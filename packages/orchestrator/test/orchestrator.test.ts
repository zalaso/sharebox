import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Docker, DockerResponse } from "../src/docker";
import { Orchestrator, demuxLogs } from "../src/orchestrator";

/** Docker finto: registra le chiamate e risponde secondo lo stato simulato. */
class FakeDocker implements Docker {
  calls: { method: string; path: string; body?: unknown }[] = [];
  networks = new Set<string>();
  connected = new Set<string>();

  async request(method: string, path: string, body?: unknown): Promise<DockerResponse> {
    this.calls.push({ method, path, body });
    const net = /^\/networks\/([^/?]+)(\/connect|\/disconnect)?$/.exec(path);
    if (method === "GET" && path.startsWith("/networks?")) return { status: 200, body: [...this.networks].map((Name) => ({ Name })) };
    if (method === "GET" && net) return this.networks.has(net[1]!) ? { status: 200, body: {} } : { status: 404, body: { message: "not found" } };
    if (method === "POST" && path === "/networks/create") {
      this.networks.add((body as { Name: string }).Name);
      return { status: 201, body: {} };
    }
    if (method === "POST" && net?.[2] === "/connect") {
      if (this.connected.has(net[1]!)) return { status: 403, body: { message: "endpoint with name platform already exists in network" } };
      this.connected.add(net[1]!);
      return { status: 200, body: null };
    }
    if (method === "POST" && path === "/volumes/create") return { status: 201, body: {} };
    if (method === "DELETE" && path.startsWith("/containers/")) return { status: 404, body: { message: "no such container" } };
    if (method === "GET" && /^\/containers\/[^/]+\/json$/.test(path)) return this.containerState;
    if (method === "POST" && /\/(stop(\?.*)?|start)$/.test(path)) return { status: 204, body: null };
    if (method === "POST" && path.startsWith("/containers/create")) return { status: 201, body: { Id: "c1" } };
    if (method === "POST" && path.endsWith("/start")) return { status: 204, body: null };
    if (method === "POST" && net?.[2] === "/disconnect") {
      // Come Docker: se il collegamento non c'è, 500 "is not connected".
      if (!this.connected.delete(net[1]!)) return { status: 500, body: { message: `container x is not connected to the network ${net[1]}` } };
      return { status: 200, body: null };
    }
    if (method === "DELETE") return { status: 204, body: null };
    return { status: 500, body: { message: `chiamata inattesa ${method} ${path}` } };
  }

  logBody = Buffer.alloc(0);
  containerState: { status: number; body: unknown } = { status: 404, body: { message: "no such container" } };

  async raw(method: string, path: string) {
    this.calls.push({ method, path });
    return { status: 200, body: this.logBody };
  }

  paths() {
    return this.calls.map((c) => `${c.method} ${c.path}`);
  }
}

let dir: string;
let docker: FakeDocker;
let orchestrator: Orchestrator;
const files = new Map([["public/index.html", new TextEncoder().encode("<h1>ciao</h1>")]]);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sharebox-orch-"));
  docker = new FakeDocker();
  orchestrator = new Orchestrator({
    docker,
    toolsDir: dir,
    hostToolsDir: "/opt/sharebox/data/tools",
    runtimeImage: "sharebox-runtime:latest",
    platformContainer: "sharebox-platform-1",
  });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("deploy", () => {
  it("prima pubblicazione: rete, collegamento della piattaforma, volume, container", async () => {
    await orchestrator.deploy("abc", 1, files);
    expect(docker.paths()).toEqual([
      "GET /networks/sbx-tool-abc",
      "POST /networks/create",
      "POST /networks/sbx-tool-abc/connect",
      "POST /volumes/create",
      "DELETE /containers/sharebox-tool-abc?force=true",
      "POST /containers/create?name=sharebox-tool-abc",
      "POST /containers/sharebox-tool-abc/start",
    ]);
    const create = docker.calls.find((c) => c.path.startsWith("/containers/create"))!;
    expect((create.body as { HostConfig: { Mounts: { Source: string }[] } }).HostConfig.Mounts[0]!.Source).toBe(
      join("/opt/sharebox/data/tools", "abc", "v1"),
    );
  });

  it("ripubblicazione: stessa rete e stesso volume, collegamento già presente accettato, versioni vecchie tolte", async () => {
    for (const v of [1, 2, 3]) await orchestrator.deploy("abc", v, files);
    const last = docker.paths().slice(-6);
    expect(last).not.toContain("POST /networks/create");
    expect((await readdir(join(dir, "abc"))).sort()).toEqual(["v2", "v3"]);
  });

  it("rifiuta id e file non validi senza toccare Docker", async () => {
    await expect(orchestrator.deploy("../x", 1, files)).rejects.toThrow();
    await expect(orchestrator.deploy("abc", 1, new Map([["../x", new Uint8Array(1)]]))).rejects.toThrow();
    expect(docker.calls).toHaveLength(0);
  });

  it("le pubblicazioni dello stesso tool non si sovrappongono", async () => {
    await Promise.all([orchestrator.deploy("abc", 1, files), orchestrator.deploy("abc", 2, files)]);
    const creates = docker.calls.filter((c) => c.path.startsWith("/containers/create")).map((c) => (c.body as { Labels: Record<string, string> }).Labels["sharebox.version"]);
    expect(creates).toEqual(["1", "2"]);
    const starts = docker.paths().filter((p) => p.endsWith("/start")).length;
    expect(starts).toBe(2);
  });
});

describe("remove e sync", () => {
  it("elimina container, rete, volume e file", async () => {
    await orchestrator.deploy("abc", 1, files);
    docker.calls = [];
    await orchestrator.remove("abc");
    expect(docker.paths()).toEqual([
      "DELETE /containers/sharebox-tool-abc?force=true",
      "POST /networks/sbx-tool-abc/disconnect",
      "DELETE /networks/sbx-tool-abc",
      "DELETE /volumes/sbx-data-abc",
    ]);
    expect(await readdir(dir)).toEqual([]);
  });

  it("elimina anche un tool la cui rete non è (più) collegata alla piattaforma", async () => {
    await expect(orchestrator.remove("orfano")).resolves.toBeUndefined();
  });

  it("sync ricollega la piattaforma a tutte le reti dei tool", async () => {
    docker.networks = new Set(["sbx-tool-a1a", "sbx-tool-b2b"]);
    docker.connected = new Set(["sbx-tool-a1a"]);
    expect(await orchestrator.sync()).toBe(2);
    expect(docker.connected).toEqual(new Set(["sbx-tool-a1a", "sbx-tool-b2b"]));
  });
});

describe("stato, log, arresto", () => {
  it("riporta lo stato del container, o missing se non esiste", async () => {
    expect((await orchestrator.status("abc")).state).toBe("missing");
    docker.containerState = {
      status: 200,
      body: { State: { Status: "running", Restarting: true, StartedAt: "2026-10-03T10:00:00Z", OOMKilled: true }, RestartCount: 4 },
    };
    expect(await orchestrator.status("abc")).toEqual({ state: "restarting", restarts: 4, startedAt: "2026-10-03T10:00:00Z", oomKilled: true });
  });

  it("separa i blocchi dei log di Docker in righe con flusso e ora", () => {
    const frame = (stream: number, text: string) => {
      const payload = Buffer.from(text);
      const header = Buffer.alloc(8);
      header[0] = stream;
      header.writeUInt32BE(payload.length, 4);
      return Buffer.concat([header, payload]);
    };
    const body = Buffer.concat([
      frame(1, "2026-10-03T10:00:00Z avvio\n"),
      frame(2, "2026-10-03T10:00:01Z errore: x\n2026-10-03T10:00:02Z dettaglio\n"),
    ]);
    expect(demuxLogs(body)).toEqual([
      { stream: "stdout", time: "2026-10-03T10:00:00Z", text: "avvio" },
      { stream: "stderr", time: "2026-10-03T10:00:01Z", text: "errore: x" },
      { stream: "stderr", time: "2026-10-03T10:00:02Z", text: "dettaglio" },
    ]);
  });

  it("limita le righe di log richieste e valida l id", async () => {
    await orchestrator.logs("abc", 10_000);
    expect(docker.calls.at(-1)!.path).toContain("tail=500");
    await expect(orchestrator.logs("../x", 10)).rejects.toThrow();
  });

  it("ferma e riavvia il container", async () => {
    await orchestrator.stop("abc");
    await orchestrator.start("abc");
    expect(docker.paths()).toEqual(["POST /containers/sharebox-tool-abc/stop?t=5", "POST /containers/sharebox-tool-abc/start"]);
  });
});
