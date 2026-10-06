// Modulo d'ingresso di ogni tool, eseguito da workerd nel container del tool (ADR 0004, 0005).
// `./user.js` è il worker del creatore già impacchettato, oppure un modulo vuoto per i tool solo statici.
import { DurableObject } from "cloudflare:workers";
import { IDENTITY_HEADERS, RESERVED_PATH_PREFIX } from "@sharebox/shared";
import user from "./user.js";
import { serveAsset, type AssetFetcher } from "./assets";
import { Collections, type Actor, type RecordView, type Result } from "./collections";
import { message, type ErrorCode } from "./messages";
import { SDK_SOURCE } from "./sdk";

interface ToolDataStub {
  list(collection: string, actor: Actor): Promise<Result<RecordView[]>>;
  add(collection: string, data: unknown, actor: Actor): Promise<Result<RecordView>>;
  update(collection: string, id: string, data: unknown, actor: Actor): Promise<Result<RecordView>>;
  remove(collection: string, id: string, actor: Actor): Promise<Result<{ id: string }>>;
  query(sql: string, params: unknown[]): Promise<Record<string, unknown>[]>;
}

interface Env {
  ASSETS: AssetFetcher;
  DATA: { idFromName(name: string): unknown; get(id: unknown): ToolDataStub };
}

interface UserWorker {
  fetch?: (request: Request, env: object, ctx: unknown) => Response | Promise<Response>;
}

const COLLECTIONS_PATH = `${RESERVED_PATH_PREFIX}api/collections/`;
const MAX_BODY_BYTES = 128 * 1024;

/** Spazio dati del tool: un solo database SQLite, usato dalle collezioni e da `env.DB` dei worker. */
export class ToolData extends DurableObject {
  private readonly collections: Collections;

  constructor(ctx: ConstructorParameters<typeof DurableObject>[0], env: unknown) {
    super(ctx, env);
    const sql = this.ctx.storage.sql;
    this.collections = new Collections(sql, Date.now, () => sql.databaseSize ?? 0);
  }

  list(collection: string, actor: Actor) {
    return this.collections.list(collection, actor);
  }
  add(collection: string, data: unknown, actor: Actor) {
    return this.collections.add(collection, data, actor);
  }
  update(collection: string, id: string, data: unknown, actor: Actor) {
    return this.collections.update(collection, id, data, actor);
  }
  remove(collection: string, id: string, actor: Actor) {
    return this.collections.remove(collection, id, actor);
  }
  /** SQL diretto per i worker dei creatori: è il loro tool, le regole delle collezioni non si applicano. */
  query(sql: string, params: unknown[]) {
    return this.ctx.storage.sql.exec(sql, ...params).toArray();
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: unknown): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith(RESERVED_PATH_PREFIX)) return platformRoute(request, url, env);

    const asset = await serveAsset(env.ASSETS, request);
    if (asset) return asset;

    const handler = (user as UserWorker | undefined)?.fetch;
    if (typeof handler === "function") {
      const data = toolData(env);
      return handler.call(user, request, { DB: { query: (sql: string, ...params: unknown[]) => data.query(sql, params) } }, ctx);
    }
    return new Response(message(request, "page_not_found"), { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  },
};

function toolData(env: Env): ToolDataStub {
  return env.DATA.get(env.DATA.idFromName("tool"));
}

/** Chi sta facendo la richiesta, dagli header scritti dal gateway (il client non può impostarli). */
function actorOf(request: Request): Actor | null {
  const email = request.headers.get(IDENTITY_HEADERS.email);
  const role = request.headers.get(IDENTITY_HEADERS.role);
  if (!email || (role !== "use" && role !== "manage")) return null;
  return { email, name: decodeURIComponent(request.headers.get(IDENTITY_HEADERS.name) ?? ""), role };
}

async function platformRoute(request: Request, url: URL, env: Env): Promise<Response> {
  if (url.pathname === `${RESERVED_PATH_PREFIX}me`) {
    return json(200, {
      email: request.headers.get(IDENTITY_HEADERS.email),
      name: decodeURIComponent(request.headers.get(IDENTITY_HEADERS.name) ?? ""),
      role: request.headers.get(IDENTITY_HEADERS.role),
    });
  }
  if (url.pathname === `${RESERVED_PATH_PREFIX}sdk.js`) {
    return new Response(SDK_SOURCE, {
      headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache", "x-content-type-options": "nosniff" },
    });
  }
  if (url.pathname.startsWith(COLLECTIONS_PATH)) return collectionsRoute(request, url, env);
  return failure(request, 404, "not_found");
}

async function collectionsRoute(request: Request, url: URL, env: Env): Promise<Response> {
  const actor = actorOf(request);
  if (!actor) return failure(request, 401, "login_required");

  const [collection = "", id, ...extra] = url.pathname.slice(COLLECTIONS_PATH.length).split("/").map(decodeURIComponent);
  if (extra.length > 0) return failure(request, 404, "not_found");
  const data = toolData(env);

  if (request.method === "GET" && id === undefined) {
    return respond(request, await data.list(collection, actor), (records) => ({ records }));
  }
  if (request.method === "DELETE" && id !== undefined) {
    return respond(request, await data.remove(collection, id, actor), (value) => value);
  }
  if ((request.method === "POST" && id === undefined) || (request.method === "PATCH" && id !== undefined)) {
    const body = await readBody(request);
    if (!body.ok) return failure(request, body.status, body.error);
    const result = id === undefined ? await data.add(collection, body.value, actor) : await data.update(collection, id, body.value, actor);
    return respond(request, result, (record) => ({ record }), id === undefined ? 201 : 200);
  }
  return failure(request, 405, "method_not_allowed");
}

async function readBody(request: Request): Promise<Result<unknown>> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return { ok: false, status: 413, error: "too_large" };
  try {
    const parsed = JSON.parse(text) as { data?: unknown };
    return { ok: true, value: parsed?.data };
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
}

function respond<T>(request: Request, result: Result<T>, shape: (value: T) => object, status = 200): Response {
  return result.ok ? json(status, shape(result.value)) : failure(request, result.status, result.error);
}

/** Errore nella lingua di chi chiama, con il codice stabile per il codice del tool. */
function failure(request: Request, status: number, code: ErrorCode): Response {
  return json(status, { error: message(request, code), code });
}

function json(status: number, body: object): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
