// Orchestratore: l'unico processo con accesso a Docker. Raggiungibile solo dalla piattaforma,
// sulla rete interna "control", con un token condiviso.
//   PUT    /tools/<id>/versions/<n>   { files: { "<percorso>": "<base64>" }, egressToken?: "…" }
//   DELETE /tools/<id>
//   GET    /tools/<id>/status | /tools/<id>/logs?tail=<n>
//   POST   /tools/<id>/stop | /tools/<id>/start
//   POST   /tools/<id>/rollback       { from, to, start, entry: "<base64>", egressToken?: "…" }
//   POST   /sync
//   POST   /refresh                    ricrea i container superati dopo un aggiornamento
import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { socketDocker } from "./docker";
import { Orchestrator } from "./orchestrator";
import { InvalidRequest } from "./spec";

const MAX_BODY_BYTES = 40 * 1024 * 1024;

const env = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Variabile d'ambiente mancante: ${name}`);
  return value;
};

const token = Buffer.from(env("ORCHESTRATOR_TOKEN"));
const orchestrator = new Orchestrator({
  docker: socketDocker(env("DOCKER_SOCKET", "/var/run/docker.sock")),
  toolsDir: env("TOOLS_DIR"),
  hostToolsDir: env("HOST_TOOLS_DIR"),
  runtimeImage: env("RUNTIME_IMAGE"),
  platformContainer: env("PLATFORM_CONTAINER"),
  egressPort: Number(env("EGRESS_PORT", "8091")),
});

async function handle(req: IncomingMessage): Promise<{ status: number; body: object }> {
  const given = Buffer.from((req.headers.authorization ?? "").replace(/^Bearer /, ""));
  if (given.length !== token.length || !timingSafeEqual(given, token)) return { status: 401, body: { error: "non autorizzato" } };

  const path = new URL(req.url ?? "/", "http://orchestrator").pathname;
  const deploy = /^\/tools\/([^/]+)\/versions\/(\d+)$/.exec(path);
  if (req.method === "PUT" && deploy) {
    const { files, egressToken } = (await readJson(req)) as { files?: Record<string, string>; egressToken?: unknown };
    if (!files || typeof files !== "object") throw new InvalidRequest("manca l'elenco dei file");
    const decoded = new Map(Object.entries(files).map(([name, b64]) => [name, Buffer.from(String(b64), "base64")] as const));
    await orchestrator.deploy(deploy[1]!, Number(deploy[2]), decoded, egressTokenOf(egressToken));
    return { status: 200, body: { ok: true } };
  }
  const tool = /^\/tools\/([^/]+)$/.exec(path);
  if (req.method === "DELETE" && tool) {
    await orchestrator.remove(tool[1]!);
    return { status: 200, body: { ok: true } };
  }
  const rollback = /^\/tools\/([^/]+)\/rollback$/.exec(path);
  if (req.method === "POST" && rollback) {
    const { from, to, start, entry, egressToken } = (await readJson(req)) as {
      from?: unknown;
      to?: unknown;
      start?: unknown;
      entry?: unknown;
      egressToken?: unknown;
    };
    if (typeof entry !== "string" || !entry) throw new InvalidRequest("manca il runtime (entry)");
    await orchestrator.rollback(rollback[1]!, Number(from), Number(to), start !== false, Buffer.from(entry, "base64"), egressTokenOf(egressToken));
    return { status: 200, body: { ok: true } };
  }
  const action = /^\/tools\/([^/]+)\/(status|logs|stop|start)$/.exec(path);
  if (action) {
    const [, id, verb] = action as unknown as [string, string, string];
    if (req.method === "GET" && verb === "status") return { status: 200, body: await orchestrator.status(id) };
    if (req.method === "GET" && verb === "logs") {
      const tail = Number(new URL(req.url ?? "/", "http://orchestrator").searchParams.get("tail") ?? 100);
      return { status: 200, body: { lines: await orchestrator.logs(id, tail) } };
    }
    if (req.method === "POST" && verb === "stop") {
      await orchestrator.stop(id);
      return { status: 200, body: { ok: true } };
    }
    if (req.method === "POST" && verb === "start") {
      await orchestrator.start(id);
      return { status: 200, body: { ok: true } };
    }
  }
  if (req.method === "POST" && path === "/sync") return { status: 200, body: { networks: await orchestrator.sync() } };
  if (req.method === "POST" && path === "/refresh") return { status: 200, body: await orchestrator.refreshAll() };
  return { status: 404, body: { error: "non trovato" } };
}

/** Il token finisce in una variabile d'ambiente: solo caratteri sicuri. */
function egressTokenOf(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(value)) throw new InvalidRequest("token di uscita non valido");
  return value;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new InvalidRequest("richiesta troppo grande");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new InvalidRequest("JSON non valido");
  }
}

function reply(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

createServer((req, res) => {
  handle(req).then(
    ({ status, body }) => reply(res, status, body),
    (error: unknown) => {
      if (error instanceof InvalidRequest) return reply(res, 400, { error: error.message });
      console.error(error);
      reply(res, 500, { error: error instanceof Error ? error.message : "errore interno" });
    },
  );
}).listen(Number(env("PORT", "8081")), env("LISTEN_HOST"), () => {
  console.log("orchestratore pronto");
  // All'avvio ricollega la piattaforma alle reti dei tool esistenti, poi porta i tool al runtime attuale.
  orchestrator
    .sync()
    .then((count) => console.log(`reti dei tool ricollegate: ${count}`))
    .catch((error: unknown) => console.error("sync iniziale non riuscito:", error))
    .then(() => orchestrator.refreshAll())
    .then(
      (r) => console.log(`tool aggiornati al runtime attuale: ${r.refreshed.length}, già aggiornati: ${r.upToDate}, non riusciti: ${r.failed.length}`),
      (error: unknown) => console.error("aggiornamento dei tool non riuscito:", error),
    );
});
