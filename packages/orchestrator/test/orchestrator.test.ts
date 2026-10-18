import { mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Docker, DockerResponse } from "../src/docker";
import { Orchestrator, demuxLogs } from "../src/orchestrator";
import { SPEC_LABEL, containerSpec, runtimeFingerprint } from "../src/spec";

/** Docker finto: registra le chiamate e risponde secondo lo stato simulato. */
class FakeDocker implements Docker {
  calls: { method: string; path: string; body?: unknown }[] = [];
  networks = new Set<string>();
  connected = new Set<string>();

  imageId = "sha256:nuova";
  layers = ["sha256:strato-a", "sha256:strato-b"];
  toolContainers: { Names?: string[]; State: string; Labels: Record<string, string> }[] = [];

  platformIps: Record<string, string> = {};

  image() {
    return { Id: this.imageId, RootFS: { Type: "layers", Layers: this.layers }, Config: { Cmd: ["workerd", "serve"] } };
  }

  async request(method: string, path: string, body?: unknown): Promise<DockerResponse> {
    this.calls.push({ method, path, body });
    if (method === "GET" && path.startsWith("/images/")) return { status: 200, body: this.image() };
    if (method === "GET" && path.startsWith("/containers/json?")) return { status: 200, body: this.toolContainers };
    if (method === "GET" && path === "/containers/sharebox-platform-1/json") {
      return { status: 200, body: { NetworkSettings: { Networks: Object.fromEntries(Object.entries(this.platformIps).map(([n, ip]) => [n, { IPAddress: ip }])) } } };
    }
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
    if (method === "POST" && path.includes("/rename?name=")) return { status: 204, body: null };
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
      "GET /images/sharebox-runtime%3Alatest/json",
      // Il container nuovo si prepara mentre quello vecchio serve ancora.
      "DELETE /containers/sharebox-tool-abc-next?force=true",
      "POST /containers/create?name=sharebox-tool-abc-next",
      "DELETE /containers/sharebox-tool-abc?force=true",
      "POST /containers/sharebox-tool-abc-next/rename?name=sharebox-tool-abc",
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

describe("rollback", () => {
  const withEntry = (html: string, entry: string) =>
    new Map([
      ["public/index.html", new TextEncoder().encode(html)],
      ["_sharebox/entry.js", new TextEncoder().encode(entry)],
    ]);

  it("ripubblica i file della versione precedente come versione nuova, con il runtime attuale", async () => {
    await orchestrator.deploy("abc", 1, withEntry("prima", "runtime vecchio"));
    await orchestrator.deploy("abc", 2, withEntry("seconda", "runtime vecchio"));
    docker.calls = [];
    await orchestrator.rollback("abc", 1, 3, true, new TextEncoder().encode("runtime attuale"));

    expect(await readFile(join(dir, "abc", "v3", "public", "index.html"), "utf8")).toBe("prima");
    expect(await readFile(join(dir, "abc", "v3", "_sharebox", "entry.js"), "utf8")).toBe("runtime attuale");
    // Resta la versione da cui si torna indietro, così il rollback si può annullare.
    expect((await readdir(join(dir, "abc"))).sort()).toEqual(["v2", "v3"]);
    const created = docker.calls.find((c) => c.path.startsWith("/containers/create"))!.body as { Labels: Record<string, string> };
    expect(created.Labels["sharebox.version"]).toBe("3");
    expect(docker.paths().at(-1)).toBe("POST /containers/sharebox-tool-abc/start");
  });

  it("su un tool sospeso prepara la versione ma non lo avvia", async () => {
    await orchestrator.deploy("abc", 1, files);
    await orchestrator.deploy("abc", 2, files);
    docker.calls = [];
    await orchestrator.rollback("abc", 1, 3, false, new TextEncoder().encode("x"));
    expect(docker.paths().some((p) => p.endsWith("/start"))).toBe(false);
  });

  it("rifiuta una versione che non è più su disco, senza toccare il container", async () => {
    await orchestrator.deploy("abc", 3, files);
    docker.calls = [];
    await expect(orchestrator.rollback("abc", 1, 4, true, new TextEncoder().encode("x"))).rejects.toThrow(/non più disponibile/);
    expect(docker.calls).toHaveLength(0);
  });
});

describe("uscita verso internet (ADR 0009)", () => {
  const TOKEN = "t".repeat(43);
  const envOf = () => (docker.calls.filter((c) => c.path.startsWith("/containers/create")).at(-1)!.body as { Env: string[] }).Env;

  it("senza token il runtime riceve variabili vuote", async () => {
    await orchestrator.deploy("abc", 1, files);
    expect(envOf()).toEqual(["SHAREBOX_EGRESS_URL=", "SHAREBOX_EGRESS_TOKEN="]);
  });

  it("con il token: indirizzo della piattaforma sulla rete del tool, token in un file leggibile solo da root", async () => {
    docker.platformIps = { "sbx-tool-abc": "172.20.0.2" };
    await orchestrator.deploy("abc", 1, files, TOKEN);
    expect(envOf()).toEqual(["SHAREBOX_EGRESS_URL=http://172.20.0.2:8091", `SHAREBOX_EGRESS_TOKEN=${TOKEN}`]);
    if (process.platform !== "win32") expect((await stat(join(dir, "abc", "egress-token"))).mode & 0o777).toBe(0o600);
    // Ripubblicare senza token toglie l'uscita.
    await orchestrator.deploy("abc", 2, files, null);
    expect(envOf()).toEqual(["SHAREBOX_EGRESS_URL=", "SHAREBOX_EGRESS_TOKEN="]);
  });

  it("refreshAll ricrea il tool se la piattaforma ha cambiato indirizzo sulla sua rete", async () => {
    docker.platformIps = { "sbx-tool-abc": "172.20.0.2" };
    await orchestrator.deploy("abc", 1, files, TOKEN);
    const label = (docker.calls.filter((c) => c.path.startsWith("/containers/create")).at(-1)!.body as { Labels: Record<string, string> }).Labels;
    docker.toolContainers = [{ State: "running", Labels: label }];
    docker.calls = [];
    expect((await orchestrator.refreshAll()).upToDate).toBe(1);

    docker.platformIps = { "sbx-tool-abc": "172.20.0.5" };
    expect((await orchestrator.refreshAll()).refreshed).toEqual(["abc"]);
    expect(envOf()[0]).toBe("SHAREBOX_EGRESS_URL=http://172.20.0.5:8091");
  });
});

describe("remove e sync", () => {
  it("elimina container, rete, volume e file", async () => {
    await orchestrator.deploy("abc", 1, files);
    docker.calls = [];
    await orchestrator.remove("abc");
    expect(docker.paths()).toEqual([
      "DELETE /containers/sharebox-tool-abc-next?force=true",
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

describe("refreshAll", () => {
  const labels = (id: string, version: number, spec?: string) => ({
    "sharebox.tool": id,
    "sharebox.version": String(version),
    ...(spec ? { [SPEC_LABEL]: spec } : {}),
  });
  const currentSpec = (id: string, version: number) =>
    containerSpec(id, version, {
      runtimeImage: "sharebox-runtime:latest",
      hostCodeDir: join("/opt/sharebox/data/tools", id, `v${version}`),
      runtime: runtimeFingerprint(docker.image()),
      env: ["SHAREBOX_EGRESS_URL=", "SHAREBOX_EGRESS_TOKEN="],
    }).Labels[SPEC_LABEL];

  it("ricrea solo i container superati, con la stessa versione; un tool sospeso resta fermo", async () => {
    for (const [id, v] of [["vecchio", 3], ["sospeso", 1], ["attuale", 2]] as const) await mkdir(join(dir, id, `v${v}`), { recursive: true });
    docker.toolContainers = [
      { State: "running", Labels: labels("vecchio", 3) },
      { State: "exited", Labels: labels("sospeso", 1) },
      { State: "running", Labels: labels("attuale", 2, currentSpec("attuale", 2)) },
    ];
    const result = await orchestrator.refreshAll();
    expect(result).toEqual({ refreshed: ["vecchio", "sospeso"], upToDate: 1, failed: [] });
    expect(docker.paths().filter((p) => !p.startsWith("GET"))).toEqual([
      "DELETE /containers/sharebox-tool-vecchio-next?force=true",
      "POST /containers/create?name=sharebox-tool-vecchio-next",
      "DELETE /containers/sharebox-tool-vecchio?force=true",
      "POST /containers/sharebox-tool-vecchio-next/rename?name=sharebox-tool-vecchio",
      "POST /containers/sharebox-tool-vecchio/start",
      "DELETE /containers/sharebox-tool-sospeso-next?force=true",
      "POST /containers/create?name=sharebox-tool-sospeso-next",
      "DELETE /containers/sharebox-tool-sospeso?force=true",
      "POST /containers/sharebox-tool-sospeso-next/rename?name=sharebox-tool-sospeso",
    ]);
    const created = docker.calls.find((c) => c.path === "/containers/create?name=sharebox-tool-vecchio-next")!.body as { Labels: Record<string, string> };
    expect(created.Labels["sharebox.version"]).toBe("3");
    expect(created.Labels[SPEC_LABEL]).toBe(currentSpec("vecchio", 3));
  });

  it("se mancano i file della versione lascia il container com'è e lo segnala", async () => {
    docker.toolContainers = [{ State: "running", Labels: labels("senzafile", 2) }];
    const result = await orchestrator.refreshAll();
    expect(result.refreshed).toEqual([]);
    expect(result.failed).toEqual([{ id: "senzafile", error: "file della versione 2 mancanti" }]);
    expect(docker.paths().some((p) => p.startsWith("DELETE"))).toBe(false);
  });

  it("ignora un container -next rimasto da una ripubblicazione interrotta", async () => {
    docker.toolContainers = [{ Names: ["/sharebox-tool-abc-next"], State: "created", Labels: labels("abc", 2) }];
    expect(await orchestrator.refreshAll()).toEqual({ refreshed: [], upToDate: 0, failed: [] });
  });

  it("guarda il contenuto dell'immagine, non il suo ID: una build identica non riavvia i tool", async () => {
    await mkdir(join(dir, "abc", "v1"), { recursive: true });
    docker.toolContainers = [{ State: "running", Labels: labels("abc", 1, currentSpec("abc", 1)) }];
    docker.imageId = "sha256:stessa-build-id-diverso";
    expect(await orchestrator.refreshAll()).toEqual({ refreshed: [], upToDate: 1, failed: [] });

    docker.layers = [...docker.layers, "sha256:strato-nuovo"]; // il runtime è cambiato davvero
    expect((await orchestrator.refreshAll()).refreshed).toEqual(["abc"]);
  });

  it("due richieste insieme fanno un solo giro", async () => {
    await mkdir(join(dir, "vecchio", "v1"), { recursive: true });
    docker.toolContainers = [{ State: "running", Labels: labels("vecchio", 1) }];
    const [a, b] = await Promise.all([orchestrator.refreshAll(), orchestrator.refreshAll()]);
    expect(a).toBe(b);
    expect(docker.paths().filter((p) => p.startsWith("POST /containers/create"))).toHaveLength(1);
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
