// Anteprima locale della dashboard con dati finti: npm run dev:dashboard, poi http://localhost:8790/dev-login
// Usa piattaforma e API vere, con database in memoria e orchestratore simulato. Mai in produzione.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { createApi } from "../src/api";
import type { Config } from "../src/config";
import { PLATFORM_SESSION_COOKIE } from "../src/cookies";
import { openDatabase } from "../src/db";
import { nodeHandler } from "../src/node-http";
import type { Orchestrator } from "../src/orchestrator-client";
import { createPlatformApp } from "../src/platform-app";
import { Store } from "../src/store";

const PORT = 8790;
// Si lancia dalla radice del repository (npm run dev:dashboard).
const dir = join(process.cwd(), "packages", "platform", "dashboard");
const read = (file: string) => readFileSync(join(dir, file), "utf8");

const config: Config = {
  toolsDomain: "guido-sbx.duckdns.org",
  platformDomain: "localhost",
  googleClientId: "anteprima",
  googleClientSecret: "anteprima",
  creatorEmails: new Set(),
  databasePath: ":memory:",
  listenHost: "127.0.0.1",
  port: PORT,
  orchestratorUrl: "",
  orchestratorToken: "",
  runtimeEntryPath: "",
  dashboardDir: dir,
};

const store = new Store(openDatabase(":memory:"));
const DAY = 86_400_000;
const now = Date.now();
const guido = store.upsertUser({ sub: "g", email: "giulia.verdi@example.com", name: "Giulia Verdi", hostedDomain: null }, true);
store.upsertUser({ sub: "m", email: "marta@studio-rossi.it", name: "Marta Rossi", hostedDomain: "studio-rossi.it" }, true);

const tools = [
  { id: "ferie0000001", slug: "ferie-del-team-k3x9", name: "Ferie del team", owner: guido.email, versions: 3 },
  { id: "bacheca00001", slug: "bacheca-0nwi", name: "Bacheca", owner: guido.email, versions: 1 },
  { id: "preventivi01", slug: "preventivi-8fj2", name: "Calcolo preventivi", owner: guido.email, versions: 0 },
  { id: "turni0000001", slug: "turni-palestra-2kd9", name: "Turni palestra", owner: "marta@studio-rossi.it", versions: 2 },
];
for (const t of tools) {
  store.createTool({ id: t.id, slug: t.slug, name: t.name, ownerEmail: t.owner });
  store.audit({ actor: t.owner, channel: "mcp", action: "tool.create", toolId: t.id, details: { slug: t.slug, name: t.name } });
  for (let v = 1; v <= t.versions; v++) {
    store.recordDeployment(t.id, { version: v, actorEmail: t.owner, files: 3, bytes: 12_000 });
    store.audit({ actor: t.owner, channel: v === 1 ? "mcp" : "cli", action: "tool.deploy", toolId: t.id, details: { version: v } });
  }
}
store.setGrant("ferie0000001", { type: "domain", domain: "azienda.com" }, "use");
store.setGrant("ferie0000001", { type: "user", email: "anna.bianchi@azienda.com" }, "manage");
store.audit({ actor: guido.email, channel: "web", action: "grant.set", toolId: "ferie0000001", details: { principal: { type: "domain", domain: "azienda.com" }, role: "use" } });
store.setGrant("turni0000001", { type: "user", email: guido.email }, "use");
store.setToolStatus("bacheca00001", "suspended");
store.createApiToken(guido.sub, "CLI – PC-ufficio");
store.createApiToken(guido.sub, "CLI – portatile");

const orchestrator: Orchestrator = {
  deploy: async () => undefined,
  remove: async () => undefined,
  sync: async () => 0,
  stop: async () => undefined,
  start: async () => undefined,
  status: async (id) =>
    id === "bacheca00001"
      ? { state: "exited", restarts: 0, startedAt: null, oomKilled: false }
      : id === "preventivi01"
        ? { state: "missing", restarts: 0, startedAt: null, oomKilled: false }
        : { state: "running", restarts: 1, startedAt: new Date(now - 2 * DAY).toISOString(), oomKilled: false },
  logs: async () => [
    { stream: "stdout", time: new Date(now - 3600_000).toISOString(), text: "workerd: in ascolto su *:8080" },
    { stream: "stderr", time: new Date(now - 1800_000).toISOString(), text: "TypeError: Cannot read properties of undefined (reading 'dal')" },
    { stream: "stderr", time: new Date(now - 1799_000).toISOString(), text: "    at fetch (worker.js:12:31)" },
  ],
};

const platform = createPlatformApp({ config, store, dashboard: { html: read("index.html"), js: read("app.js"), css: read("app.css") } });
const api = createApi({ config, store, orchestrator, runtimeEntry: "" });

createServer(
  nodeHandler(async (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/dev-login") {
      const session = store.createSession("platform", guido.sub, null, DAY);
      return new Response(null, { status: 302, headers: { location: "/app", "set-cookie": `${PLATFORM_SESSION_COOKIE}=${session}; Path=/; Secure; HttpOnly; SameSite=Lax` } });
    }
    // I file della dashboard si rileggono a ogni richiesta, così le modifiche si vedono subito.
    if (url.pathname.startsWith("/app")) {
      return createPlatformApp({ config, store, dashboard: { html: read("index.html"), js: read("app.js"), css: read("app.css") } })(request);
    }
    return url.pathname.startsWith("/api/") ? api(request) : platform(request);
  }),
).listen(PORT, "127.0.0.1", () => console.log(`Anteprima della dashboard: http://localhost:${PORT}/dev-login`));
