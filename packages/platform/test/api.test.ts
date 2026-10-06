import { beforeEach, describe, expect, it } from "vitest";
import { MAX_TOOLS_PER_CREATOR, createApi, slugify } from "../src/api";
import { openDatabase } from "../src/db";
import { OrchestratorError, type Orchestrator } from "../src/orchestrator-client";
import { Store } from "../src/store";
import { testConfig } from "./helpers";

const RUNTIME = "// runtime della piattaforma";
const b64 = (s: string) => Buffer.from(s).toString("base64");
const unb64 = (s: string) => Buffer.from(s, "base64").toString("utf8");

let store: Store;
let api: (request: Request) => Promise<Response>;
let deploys: { toolId: string; version: number; files: Record<string, string> }[];
let removed: string[];
let containerCalls: string[];
let failNext: Error | null;
let tokens: Record<"guido" | "anna", string>;

beforeEach(() => {
  store = new Store(openDatabase(":memory:"));
  deploys = [];
  removed = [];
  containerCalls = [];
  failNext = null;
  const orchestrator: Orchestrator = {
    deploy: async (toolId, version, files) => {
      if (failNext) throw failNext;
      deploys.push({ toolId, version, files });
    },
    remove: async (toolId) => {
      removed.push(toolId);
    },
    sync: async () => 0,
    status: async (toolId) => {
      containerCalls.push(`status ${toolId}`);
      return { state: "running", restarts: 0, startedAt: "2026-10-03T10:00:00Z", oomKilled: false };
    },
    logs: async (toolId, tail) => {
      containerCalls.push(`logs ${toolId} ${tail}`);
      return [{ stream: "stderr", time: "2026-10-03T10:00:00Z", text: "errore di prova" }];
    },
    stop: async (toolId) => {
      containerCalls.push(`stop ${toolId}`);
    },
    start: async (toolId) => {
      containerCalls.push(`start ${toolId}`);
    },
  };
  api = createApi({ config: testConfig(), store, orchestrator, runtimeEntry: RUNTIME });
  const guido = store.upsertUser({ sub: "g", email: "guido@gmail.com", name: "Guido", hostedDomain: null }, true);
  const anna = store.upsertUser({ sub: "a", email: "anna@azienda.com", name: "Anna", hostedDomain: "azienda.com" }, false);
  tokens = { guido: store.createApiToken(guido.sub, "test").token, anna: store.createApiToken(anna.sub, "test").token };
});

function call(method: string, path: string, who: keyof typeof tokens | null, body?: object): Promise<Response> {
  const headers: Record<string, string> = body ? { "content-type": "application/json" } : {};
  if (who) headers.authorization = `Bearer ${tokens[who]}`;
  return api(new Request(`https://sharebox.test${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }));
}

async function createTool(name = "Ferie del team") {
  const res = await call("POST", "/api/tools", "guido", { name });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; slug: string; url: string };
}

describe("autenticazione", () => {
  it("rifiuta richieste senza token o con token non valido", async () => {
    expect((await call("GET", "/api/me", null)).status).toBe(401);
    const res = await api(new Request("https://sharebox.test/api/me", { headers: { authorization: "Bearer sbx_falso" } }));
    expect(res.status).toBe(401);
  });

  it("un token revocato non vale più", async () => {
    const { id, token } = store.createApiToken("g", "da revocare");
    store.revokeApiToken(id);
    expect((await api(new Request("https://sharebox.test/api/me", { headers: { authorization: `Bearer ${token}` } }))).status).toBe(401);
  });

  it("/api/me restituisce l'utente del token", async () => {
    expect(await (await call("GET", "/api/me", "guido")).json()).toEqual({ email: "guido@gmail.com", name: "Guido", creator: true });
  });
});

describe("creazione", () => {
  it("solo i creatori possono creare tool", async () => {
    expect((await call("POST", "/api/tools", "anna", { name: "X" })).status).toBe(403);
  });

  it("crea un tool con indirizzo leggibile e non indovinabile", async () => {
    const tool = await createTool("Ferie del Team — 2026!");
    expect(tool.id).toMatch(/^[a-z0-9]{12}$/);
    expect(tool.slug).toMatch(/^ferie-del-team-2026-[a-z0-9]{4}$/);
    expect(tool.url).toBe(`https://${tool.slug}.sbx.test/`);
  });

  it("rifiuta nomi mancanti o troppo lunghi", async () => {
    expect((await call("POST", "/api/tools", "guido", {})).status).toBe(400);
    expect((await call("POST", "/api/tools", "guido", { name: "x".repeat(81) })).status).toBe(400);
  });

  it("limita il numero di tool per creatore", async () => {
    for (let i = 0; i < MAX_TOOLS_PER_CREATOR; i++) await createTool(`T${i}`);
    expect((await call("POST", "/api/tools", "guido", { name: "Uno di troppo" })).status).toBe(403);
  });
});

describe("pubblicazione", () => {
  it("mette i file in public/, aggiunge runtime e worker vuoto, numera le versioni", async () => {
    const tool = await createTool();
    const res = await call("POST", `/api/tools/${tool.id}/deploy`, "guido", { files: { "index.html": b64("<h1>1</h1>"), "css/app.css": b64("a{}") } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { version: number }).version).toBe(1);
    expect(deploys[0]!.version).toBe(1);
    expect(Object.keys(deploys[0]!.files).sort()).toEqual(["_sharebox/entry.js", "_sharebox/user.js", "public/css/app.css", "public/index.html"]);
    expect(unb64(deploys[0]!.files["_sharebox/entry.js"]!)).toBe(RUNTIME);
    expect(unb64(deploys[0]!.files["_sharebox/user.js"]!)).toBe("export default {};\n");

    await call("POST", `/api/tools/${tool.id}/deploy`, "guido", { files: { "index.html": b64("<h1>2</h1>") } });
    expect(deploys[1]!.version).toBe(2);
    expect(store.latestDeployment(tool.id)!.version).toBe(2);
  });

  it("usa il worker del creatore", async () => {
    const tool = await createTool();
    await call("POST", `/api/tools/${tool.id}/deploy`, "guido", { files: {}, worker: b64("export default { fetch() {} }") });
    expect(unb64(deploys[0]!.files["_sharebox/user.js"]!)).toBe("export default { fetch() {} }");
  });

  it.each([
    ["percorso che esce dalla cartella", { files: { "../fuori.html": b64("x") } }],
    ["percorso assoluto", { files: { "/etc/x": b64("x") } }],
    ["nessun file né worker", { files: {} }],
    ["contenuto non testuale", { files: { "a.html": 42 } }],
  ])("rifiuta: %s", async (_, body) => {
    const tool = await createTool();
    expect((await call("POST", `/api/tools/${tool.id}/deploy`, "guido", body)).status).toBe(400);
    expect(deploys).toHaveLength(0);
  });

  it("i file del creatore non possono sostituire runtime o worker", async () => {
    const tool = await createTool();
    await call("POST", `/api/tools/${tool.id}/deploy`, "guido", { files: { "_sharebox/entry.js": b64("attacco") } });
    expect(unb64(deploys[0]!.files["_sharebox/entry.js"]!)).toBe(RUNTIME);
    expect(unb64(deploys[0]!.files["public/_sharebox/entry.js"]!)).toBe("attacco");
  });

  it("permessi: 404 senza accesso, 403 con 'può usare', consentito con 'può gestire'", async () => {
    const tool = await createTool();
    const deployAsAnna = () => call("POST", `/api/tools/${tool.id}/deploy`, "anna", { files: { "index.html": b64("x") } });
    expect((await deployAsAnna()).status).toBe(404);
    store.setGrant(tool.id, { type: "user", email: "anna@azienda.com" }, "use");
    expect((await deployAsAnna()).status).toBe(403);
    store.setGrant(tool.id, { type: "user", email: "anna@azienda.com" }, "manage");
    expect((await deployAsAnna()).status).toBe(200);
  });

  it("se l'orchestratore fallisce la versione non viene registrata", async () => {
    const tool = await createTool();
    failNext = new Error("docker non risponde");
    expect((await call("POST", `/api/tools/${tool.id}/deploy`, "guido", { files: { "index.html": b64("x") } })).status).toBe(502);
    expect(store.latestDeployment(tool.id)).toBeNull();
    failNext = new OrchestratorError("percorso non valido", 400);
    expect((await call("POST", `/api/tools/${tool.id}/deploy`, "guido", { files: { "index.html": b64("x") } })).status).toBe(400);
  });
});

describe("elenco ed eliminazione", () => {
  it("elenca solo i tool che l'utente può gestire", async () => {
    const tool = await createTool();
    expect(((await (await call("GET", "/api/tools", "anna")).json()) as { tools: unknown[] }).tools).toHaveLength(0);
    store.setGrant(tool.id, { type: "user", email: "anna@azienda.com" }, "manage");
    const { tools } = (await (await call("GET", "/api/tools", "anna")).json()) as { tools: { id: string; role: string }[] };
    expect(tools).toEqual([expect.objectContaining({ id: tool.id, role: "manage" })]);
  });

  it("solo il proprietario elimina; l'eliminazione toglie container e record", async () => {
    const tool = await createTool();
    store.setGrant(tool.id, { type: "user", email: "anna@azienda.com" }, "manage");
    expect((await call("DELETE", `/api/tools/${tool.id}`, "anna")).status).toBe(403);
    expect((await call("DELETE", `/api/tools/${tool.id}`, "guido")).status).toBe(200);
    expect(removed).toEqual([tool.id]);
    expect(store.toolById(tool.id)).toBeNull();
  });
});

describe("condivisione", () => {
  it("condivide con una persona, un dominio e chiunque, e mostra le condivisioni", async () => {
    const tool = await createTool();
    expect((await call("PUT", `/api/tools/${tool.id}/grants`, "guido", { type: "user", value: " Anna@Azienda.com ", role: "use" })).status).toBe(200);
    await call("PUT", `/api/tools/${tool.id}/grants`, "guido", { type: "domain", value: "@azienda.com", role: "manage" });
    const res = await call("PUT", `/api/tools/${tool.id}/grants`, "guido", { type: "anyone", role: "use" });
    const { grants } = (await res.json()) as { grants: unknown[] };
    expect(grants).toEqual([
      { type: "anyone", role: "use" },
      { type: "domain", value: "azienda.com", role: "manage" },
      { type: "user", value: "anna@azienda.com", role: "use" },
    ]);
  });

  it("toglie una condivisione; 404 se non esiste", async () => {
    const tool = await createTool();
    await call("PUT", `/api/tools/${tool.id}/grants`, "guido", { type: "user", value: "anna@azienda.com", role: "use" });
    expect((await call("DELETE", `/api/tools/${tool.id}/grants`, "guido", { type: "user", value: "anna@azienda.com" })).status).toBe(200);
    expect(store.grantsFor(tool.id)).toEqual([]);
    expect((await call("DELETE", `/api/tools/${tool.id}/grants`, "guido", { type: "user", value: "anna@azienda.com" })).status).toBe(404);
  });

  it.each([
    [{ type: "user", value: "non-una-email", role: "use" }],
    [{ type: "domain", value: "x", role: "use" }],
    [{ type: "gruppo", value: "x", role: "use" }],
    [{ type: "anyone", role: "admin" }],
    [{ type: "user", value: "guido@gmail.com", role: "use" }],
  ])("rifiuta %j", async (body) => {
    const tool = await createTool();
    expect((await call("PUT", `/api/tools/${tool.id}/grants`, "guido", body)).status).toBe(400);
  });

  it("chi può solo usare il tool non può condividerlo; chi lo gestisce sì", async () => {
    const tool = await createTool();
    store.setGrant(tool.id, { type: "user", email: "anna@azienda.com" }, "use");
    const share = () => call("PUT", `/api/tools/${tool.id}/grants`, "anna", { type: "anyone", role: "use" });
    expect((await share()).status).toBe(403);
    store.setGrant(tool.id, { type: "user", email: "anna@azienda.com" }, "manage");
    expect((await share()).status).toBe(200);
  });

  it("ogni modifica va nel registro delle attività", async () => {
    const tool = await createTool();
    await call("PUT", `/api/tools/${tool.id}/grants`, "guido", { type: "anyone", role: "use" });
    await call("DELETE", `/api/tools/${tool.id}/grants`, "guido", { type: "anyone" });
    const db = (store as unknown as { db: import("node:sqlite").DatabaseSync }).db;
    const actions = (db.prepare("SELECT action FROM audit_events ORDER BY id").all() as { action: string }[]).map((e) => e.action);
    expect(actions).toEqual(["tool.create", "grant.set", "grant.remove"]);
  });
});

describe("logout della CLI", () => {
  it("DELETE /api/token revoca il token usato, e solo quello", async () => {
    expect((await call("DELETE", "/api/token", "guido")).status).toBe(200);
    expect((await call("GET", "/api/me", "guido")).status).toBe(401);
    expect((await call("GET", "/api/me", "anna")).status).toBe(200);
  });
});

describe("slugify", () => {
  it.each([
    ["Ferie del team", "ferie-del-team"],
    ["Caffè & Più!!", "caffe-piu"],
    ["   ", "tool"],
    ["x".repeat(40), "x".repeat(30)],
    ["a".repeat(29) + " b", "a".repeat(29)],
  ])("%s → %s", (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });
});

describe("dashboard: accesso con la sessione del browser", () => {
  function web(method: string, path: string, options: { site?: string; body?: object } = {}) {
    const session = store.createSession("platform", "g", null, 60_000);
    const headers: Record<string, string> = { cookie: `__Host-sharebox-platform=${session}` };
    if (options.site) headers["sec-fetch-site"] = options.site;
    if (options.body) headers["content-type"] = "application/json";
    return api(new Request(`https://sharebox.test${path}`, { method, headers, body: options.body ? JSON.stringify(options.body) : undefined }));
  }

  it("accetta la sessione solo per richieste partite dalla piattaforma", async () => {
    expect((await web("GET", "/api/me", { site: "same-origin" })).status).toBe(200);
    expect((await web("GET", "/api/me", { site: "cross-site" })).status).toBe(403);
    expect((await web("GET", "/api/me", { site: "same-site" })).status).toBe(403);
    expect((await web("GET", "/api/me")).status).toBe(403);
  });

  it("le azioni dalla dashboard finiscono nel registro con canale web", async () => {
    const tool = await createTool();
    await web("PUT", `/api/tools/${tool.id}/grants`, { site: "same-origin", body: { type: "anyone", role: "use" } });
    const [last] = store.activityOf(tool.id, 1);
    expect(last).toMatchObject({ action: "grant.set", channel: "web", actor: "guido@gmail.com" });
  });

  it("non si può dichiarare il canale web con un token", async () => {
    const tool = await createTool();
    await api(
      new Request(`https://sharebox.test/api/tools/${tool.id}/grants`, {
        method: "PUT",
        headers: { authorization: `Bearer ${tokens.guido}`, "x-sharebox-client": "web", "content-type": "application/json" },
        body: JSON.stringify({ type: "anyone", role: "use" }),
      }),
    );
    expect(store.activityOf(tool.id, 1)[0]!.channel).toBe("cli");
  });
});

describe("dashboard: tool, stato, attività, sospensione", () => {
  it("?access=all include i tool che l'utente può solo usare", async () => {
    const tool = await createTool();
    store.setGrant(tool.id, { type: "user", email: "anna@azienda.com" }, "use");
    const list = async (query: string) => ((await (await call("GET", `/api/tools${query}`, "anna")).json()) as { tools: { role: string }[] }).tools;
    expect(await list("")).toEqual([]);
    expect((await list("?access=all")).map((t) => t.role)).toEqual(["use"]);
  });

  it("stato, log e attività solo per chi gestisce il tool", async () => {
    const tool = await createTool();
    expect(await (await call("GET", `/api/tools/${tool.id}/status`, "guido")).json()).toMatchObject({ state: "running" });
    expect(await (await call("GET", `/api/tools/${tool.id}/logs?tail=50`, "guido")).json()).toEqual({
      lines: [{ stream: "stderr", time: "2026-10-03T10:00:00Z", text: "errore di prova" }],
    });
    expect(containerCalls).toEqual([`status ${tool.id}`, `logs ${tool.id} 50`]);
    const events = ((await (await call("GET", `/api/tools/${tool.id}/activity`, "guido")).json()) as { events: { action: string }[] }).events;
    expect(events.map((e) => e.action)).toEqual(["tool.create"]);

    store.setGrant(tool.id, { type: "user", email: "anna@azienda.com" }, "use");
    for (const what of ["status", "logs", "activity"]) expect((await call("GET", `/api/tools/${tool.id}/${what}`, "anna")).status).toBe(403);
  });

  it("sospendere ferma il container; riattivare lo riavvia se il tool è pubblicato", async () => {
    const tool = await createTool();
    await call("POST", `/api/tools/${tool.id}/deploy`, "guido", { files: { "index.html": b64("x") } });
    const suspended = (await (await call("POST", `/api/tools/${tool.id}/suspend`, "guido")).json()) as { status: string };
    expect(suspended.status).toBe("suspended");
    const resumed = (await (await call("POST", `/api/tools/${tool.id}/resume`, "guido")).json()) as { status: string };
    expect(resumed.status).toBe("active");
    expect(containerCalls).toEqual([`stop ${tool.id}`, `start ${tool.id}`]);
    expect(store.activityOf(tool.id, 2).map((e) => e.action)).toEqual(["tool.resume", "tool.suspend"]);
  });
});

describe("dashboard: computer collegati", () => {
  it("elenca e revoca solo i propri token", async () => {
    const own = ((await (await call("GET", "/api/tokens", "guido")).json()) as { tokens: { id: string; name: string }[] }).tokens;
    expect(own.map((t) => t.name)).toEqual(["test"]);
    expect(JSON.stringify(own)).not.toContain("sbx_");

    const annaToken = store.apiTokensOf("a")[0]!.id;
    expect((await call("DELETE", `/api/tokens/${annaToken}`, "guido")).status).toBe(404);
    expect((await call("DELETE", `/api/tokens/${own[0]!.id}`, "guido")).status).toBe(200);
    expect((await call("GET", "/api/me", "guido")).status).toBe(401);
  });
});
