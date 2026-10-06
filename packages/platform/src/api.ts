// API della piattaforma per CLI e agenti, autenticata con token personale (Authorization: Bearer sbx_…).
//   GET    /api/me
//   GET    /api/tools                  tool che l'utente può gestire
//   POST   /api/tools                  { name }                       → crea il tool (solo creatori)
//   POST   /api/tools/<id>/deploy      { files: {…}, worker?: "…" }   → pubblica una nuova versione
//   DELETE /api/tools/<id>                                             → elimina tool e dati (solo proprietario)
//   GET    /api/tools/<id>                                             → dettagli e condivisioni
//   PUT    /api/tools/<id>/grants      { type, value?, role }         → condivide (o cambia ruolo)
//   DELETE /api/tools/<id>/grants      { type, value? }               → toglie una condivisione
//   DELETE /api/token                                                  → revoca il token usato (logout della CLI)
//   GET    /api/tools?access=all                                       → anche i tool che l'utente può solo usare
//   GET    /api/tools/<id>/status | logs | activity                   → stato del container, log, registro attività
//   POST   /api/tools/<id>/suspend | resume                            → sospende (ferma il container) o riattiva
//   GET    /api/tokens, DELETE /api/tokens/<id>                        → computer collegati dell'utente
// Autenticazione: token (CLI, agenti) oppure sessione del browser con Sec-Fetch-Site: same-origin (dashboard).
import { PLATFORM_DIR, bundleProblem, describeBundleProblem, describePathProblem, pathProblem, type Lang, type Principal, type Role } from "@sharebox/shared";
import { effectiveRole } from "./access";
import type { Config } from "./config";
import { PLATFORM_SESSION_COOKIE, readCookie } from "./cookies";
import { randomId } from "./crypto";
import { langOf, t, type MessageKey, type Params } from "./messages";
import { OrchestratorError, type Orchestrator } from "./orchestrator-client";
import type { Store, Tool, User } from "./store";

const MAX_BODY_BYTES = 40 * 1024 * 1024;
export const MAX_TOOLS_PER_CREATOR = 20;

export interface ApiDeps {
  config: Config;
  store: Store;
  orchestrator: Orchestrator;
  /** Codice del runtime (packages/runtime) aggiunto a ogni tool come `_sharebox/entry.js`. */
  runtimeEntry: string;
}

/** Errore da mostrare a chi chiama l'API, nella sua lingua (il testo si sceglie alla risposta). */
class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly text: (lang: Lang) => string,
  ) {
    super(text("it"));
  }
}

function fail(status: number, key: MessageKey, params?: Params): ApiError {
  return new ApiError(status, (lang) => t(lang, key, params));
}

export function createApi(deps: ApiDeps): (request: Request) => Promise<Response> {
  const { config, store, orchestrator } = deps;
  const toolUrl = (tool: Tool) => `https://${tool.slug}.${config.toolsDomain}/`;
  const describe = (tool: Tool, role: Role) => ({
    id: tool.id,
    slug: tool.slug,
    name: tool.name,
    url: toolUrl(tool),
    status: tool.status,
    role,
    owner: tool.ownerEmail,
    version: store.latestDeployment(tool.id)?.version ?? null,
    publishedAt: store.latestDeployment(tool.id)?.createdAt ?? null,
  });

  /** Il tool, se l'utente può gestirlo. Chi non ha accesso riceve 404: non si rivela che il tool esiste. */
  function managedTool(user: User, id: string): Tool {
    const tool = store.toolById(id);
    const role = tool ? effectiveRole(user, tool.ownerEmail, store.grantsFor(tool.id)) : null;
    if (!tool || role === null) throw fail(404, "api.tool_not_found");
    if (role !== "manage") throw fail(403, "api.use_only");
    return tool;
  }

  async function createTool(user: User, request: Request): Promise<Response> {
    if (!user.isCreator) throw fail(403, "api.not_creator");
    if (store.countToolsOwnedBy(user.email) >= MAX_TOOLS_PER_CREATOR) {
      throw fail(403, "api.tool_limit", { max: MAX_TOOLS_PER_CREATOR });
    }
    const { name } = (await readJson(request)) as { name?: unknown };
    if (typeof name !== "string" || !name.trim() || name.length > 80) throw fail(400, "api.name_required");

    const tool = store.createTool({
      id: randomId(12),
      // Suffisso casuale: l'indirizzo non si indovina dal nome.
      slug: `${slugify(name)}-${randomId(4)}`,
      name: name.trim(),
      ownerEmail: user.email,
    });
    store.audit({ actor: user.email, channel: channel(request), action: "tool.create", toolId: tool.id, details: { slug: tool.slug, name: tool.name } });
    return json(201, describe(tool, "manage"));
  }

  async function deploy(user: User, request: Request, id: string): Promise<Response> {
    const tool = managedTool(user, id);
    const body = (await readJson(request)) as { files?: unknown; worker?: unknown };
    if (!body.files || typeof body.files !== "object") throw fail(400, "api.files_missing");

    // I file del creatore vanno in public/, il suo worker e il runtime in _sharebox/: non può sovrascriverli.
    const decoded = new Map<string, Uint8Array>();
    for (const [path, content] of Object.entries(body.files as Record<string, unknown>)) {
      const problem = pathProblem(path);
      if (problem) throw new ApiError(400, (lang) => `${path}: ${describePathProblem(problem, lang)}`);
      if (typeof content !== "string") throw fail(400, "api.invalid_content", { path });
      decoded.set(`public/${path}`, Buffer.from(content, "base64"));
    }
    const hasWorker = typeof body.worker === "string" && body.worker.length > 0;
    if (decoded.size === 0 && !hasWorker) throw fail(400, "api.nothing_to_publish");
    decoded.set(`${PLATFORM_DIR}/user.js`, hasWorker ? Buffer.from(body.worker as string, "base64") : Buffer.from("export default {};\n"));
    decoded.set(`${PLATFORM_DIR}/entry.js`, Buffer.from(deps.runtimeEntry));
    const problem = bundleProblem(decoded);
    if (problem) throw new ApiError(400, (lang) => describeBundleProblem(problem, lang));

    const version = store.nextVersion(tool.id);
    const files = Object.fromEntries([...decoded].map(([path, content]) => [path, Buffer.from(content).toString("base64")]));
    try {
      await orchestrator.deploy(tool.id, version, files);
    } catch (error) {
      if (error instanceof OrchestratorError && error.status === 400) throw new ApiError(400, () => error.message);
      console.error(`Pubblicazione di ${tool.id} non riuscita:`, error);
      throw fail(502, "api.publish_failed");
    }

    const bytes = [...decoded.values()].reduce((sum, content) => sum + content.byteLength, 0);
    store.recordDeployment(tool.id, { version, actorEmail: user.email, files: decoded.size, bytes });
    store.audit({ actor: user.email, channel: channel(request), action: "tool.deploy", toolId: tool.id, details: { version, files: decoded.size, bytes } });
    return json(200, describe(tool, "manage"));
  }

  async function remove(user: User, request: Request, id: string): Promise<Response> {
    const tool = managedTool(user, id);
    if (tool.ownerEmail !== user.email) throw fail(403, "api.owner_only_delete");
    try {
      await orchestrator.remove(tool.id);
    } catch (error) {
      console.error(`Eliminazione di ${tool.id} non riuscita:`, error);
      throw fail(502, "api.delete_failed");
    }
    store.deleteTool(tool.id);
    store.audit({ actor: user.email, channel: channel(request), action: "tool.delete", toolId: tool.id, details: { slug: tool.slug, name: tool.name } });
    return json(200, { deleted: tool.id });
  }

  function details(tool: Tool): object {
    return {
      ...describe(tool, "manage"),
      grants: store.grantsFor(tool.id).map(({ principal, role }) => ({ ...principalJson(principal), role })),
    };
  }

  async function setGrant(user: User, request: Request, id: string): Promise<Response> {
    const tool = managedTool(user, id);
    const body = (await readJson(request)) as { role?: unknown };
    const principal = parsePrincipal(body);
    if (body.role !== "use" && body.role !== "manage") throw fail(400, "api.invalid_role");
    if (principal.type === "user" && principal.email === tool.ownerEmail) throw fail(400, "api.owner_has_access");
    store.setGrant(tool.id, principal, body.role);
    store.audit({ actor: user.email, channel: channel(request), action: "grant.set", toolId: tool.id, details: { principal, role: body.role } });
    return json(200, details(tool));
  }

  async function removeGrant(user: User, request: Request, id: string): Promise<Response> {
    const tool = managedTool(user, id);
    const principal = parsePrincipal(await readJson(request));
    if (!store.removeGrant(tool.id, principal)) throw fail(404, "api.grant_not_found");
    store.audit({ actor: user.email, channel: channel(request), action: "grant.remove", toolId: tool.id, details: { principal } });
    return json(200, details(tool));
  }

  /** Sospendere ferma anche il container: libera memoria; il gateway mostra "Tool sospeso". */
  async function setSuspended(user: User, request: Request, id: string, suspended: boolean): Promise<Response> {
    const tool = managedTool(user, id);
    try {
      if (suspended) await orchestrator.stop(tool.id);
      else if (store.latestDeployment(tool.id)) await orchestrator.start(tool.id);
    } catch (error) {
      console.error(`${suspended ? "Sospensione" : "Riattivazione"} di ${tool.id} non riuscita:`, error);
      throw fail(502, "api.operation_failed");
    }
    store.setToolStatus(tool.id, suspended ? "suspended" : "active");
    store.audit({ actor: user.email, channel: channel(request), action: suspended ? "tool.suspend" : "tool.resume", toolId: tool.id, details: {} });
    return json(200, details(store.toolById(tool.id)!));
  }

  async function containerInfo(id: string, what: "status" | "logs", tail: number): Promise<Response> {
    try {
      return what === "status" ? json(200, await orchestrator.status(id)) : json(200, { lines: await orchestrator.logs(id, tail) });
    } catch (error) {
      console.error(`Lettura ${what} di ${id} non riuscita:`, error);
      throw fail(502, "api.info_unavailable");
    }
  }

  async function route(user: User, token: string | null, request: Request, url: URL): Promise<Response> {
    const path = url.pathname;
    if (path === "/api/me" && request.method === "GET") {
      return json(200, { email: user.email, name: user.name, creator: user.isCreator });
    }
    if (path === "/api/token" && request.method === "DELETE" && token) {
      store.revokeApiTokenValue(token);
      store.audit({ actor: user.email, channel: channel(request), action: "token.revoke", toolId: null, details: { self: true } });
      return json(200, { revoked: true });
    }
    if (path === "/api/tokens" && request.method === "GET") return json(200, { tokens: store.apiTokensOf(user.sub) });
    const tokenMatch = /^\/api\/tokens\/([a-z0-9]+)$/.exec(path);
    if (tokenMatch && request.method === "DELETE") {
      if (!store.revokeApiTokenOf(user.sub, tokenMatch[1]!)) throw fail(404, "api.token_not_found");
      store.audit({ actor: user.email, channel: channel(request), action: "token.revoke", toolId: null, details: { id: tokenMatch[1] } });
      return json(200, { revoked: tokenMatch[1] });
    }
    if (path === "/api/tools" && request.method === "GET") {
      // Predefinito: i tool che l'utente gestisce (CLI). Con ?access=all anche quelli che può solo usare (dashboard).
      const all = url.searchParams.get("access") === "all";
      const tools = store
        .listTools()
        .map((tool) => ({ tool, role: effectiveRole(user, tool.ownerEmail, store.grantsFor(tool.id)) }))
        .filter(({ role }) => role === "manage" || (all && role === "use"))
        .map(({ tool, role }) => describe(tool, role!));
      return json(200, { tools });
    }
    const actionMatch = /^\/api\/tools\/([a-z0-9]+)\/(status|logs|activity|suspend|resume)$/.exec(path);
    if (actionMatch) {
      const [, id, action] = actionMatch as unknown as [string, string, string];
      if (request.method === "POST" && (action === "suspend" || action === "resume")) return setSuspended(user, request, id, action === "suspend");
      if (request.method === "GET" && action === "activity") return json(200, { events: store.activityOf(managedTool(user, id).id) });
      if (request.method === "GET" && (action === "status" || action === "logs")) {
        return containerInfo(managedTool(user, id).id, action, Number(url.searchParams.get("tail") ?? 200));
      }
    }
    if (path === "/api/tools" && request.method === "POST") return createTool(user, request);
    const deployMatch = /^\/api\/tools\/([a-z0-9]+)\/deploy$/.exec(path);
    if (deployMatch && request.method === "POST") return deploy(user, request, deployMatch[1]!);
    const toolMatch = /^\/api\/tools\/([a-z0-9]+)$/.exec(path);
    if (toolMatch && request.method === "DELETE") return remove(user, request, toolMatch[1]!);
    if (toolMatch && request.method === "GET") return json(200, details(managedTool(user, toolMatch[1]!)));
    const grantsMatch = /^\/api\/tools\/([a-z0-9]+)\/grants$/.exec(path);
    if (grantsMatch && request.method === "PUT") return setGrant(user, request, grantsMatch[1]!);
    if (grantsMatch && request.method === "DELETE") return removeGrant(user, request, grantsMatch[1]!);
    throw fail(404, "api.not_found");
  }

  return async (request) => {
    try {
      const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
      if (token) {
        const user = store.userByApiToken(token);
        if (!user) throw fail(401, "api.unauthorized");
        return await route(user, token, request, new URL(request.url));
      }
      // Dashboard: sessione del browser, accettata solo per richieste partite dalla piattaforma stessa.
      const session = readCookie(request.headers.get("cookie"), PLATFORM_SESSION_COOKIE);
      if (!session) throw fail(401, "api.unauthorized");
      if (request.headers.get("sec-fetch-site") !== "same-origin") throw fail(403, "api.forbidden");
      const user = store.sessionUser("platform", session);
      if (!user) throw fail(401, "api.session_expired");
      WEB_REQUESTS.add(request);
      return await route(user, null, request, new URL(request.url));
    } catch (error) {
      if (error instanceof ApiError) return json(error.status, { error: error.text(langOf(request)) });
      console.error(error);
      return json(500, { error: t(langOf(request), "api.internal") });
    }
  };
}

/** Nome leggibile per l'indirizzo: "Ferie del team!" → "ferie-del-team". */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");
  return slug || "tool";
}

const EMAIL = /^[^\s@]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/** `{ type: "user", value: "anna@x.it" }`, `{ type: "domain", value: "azienda.com" }` o `{ type: "anyone" }`. */
function parsePrincipal(body: unknown): Principal {
  const { type, value } = (body ?? {}) as { type?: unknown; value?: unknown };
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (type === "anyone") return { type };
  if (type === "user" && EMAIL.test(normalized)) return { type, email: normalized };
  if (type === "domain" && DOMAIN.test(normalized.replace(/^@/, ""))) return { type, domain: normalized.replace(/^@/, "") };
  throw fail(400, "api.invalid_grant");
}

function principalJson(principal: Principal): { type: Principal["type"]; value?: string } {
  switch (principal.type) {
    case "user":
      return { type: "user", value: principal.email };
    case "domain":
      return { type: "domain", value: principal.domain };
    case "anyone":
      return { type: "anyone" };
  }
}

/** Richieste autenticate con la sessione del browser (dashboard). */
const WEB_REQUESTS = new WeakSet<Request>();

/** Canale per il registro attività: decide il tipo di autenticazione, non un header che il client può scegliere. */
function channel(request: Request): "cli" | "mcp" | "web" {
  if (WEB_REQUESTS.has(request)) return "web";
  return request.headers.get("x-sharebox-client") === "mcp" ? "mcp" : "cli";
}

async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw fail(413, "api.too_large");
  try {
    return await request.json();
  } catch {
    throw fail(400, "api.invalid_json");
  }
}

function json(status: number, body: object): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
