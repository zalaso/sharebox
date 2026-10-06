import { SESSION_COOKIE, type Identity, type Role } from "@sharebox/shared";
import { isAllowedRequest } from "./cross-site";
import { forwardedHeaders, returnedHeaders } from "./headers";
import { toolSlugFromHost } from "./host";

/** Esito del controllo di accesso: inoltrare al tool, oppure rispondere subito (login, 403, 404…). */
export type Authentication =
  | { ok: true; identity: Identity; role: Role; /** es. `http://tool-abc:8080` */ upstream: string }
  | { ok: false; response: Response };

export interface GatewayOptions {
  toolsDomain: string;
  authenticate: (request: Request, slug: string) => Promise<Authentication>;
  /** Attesa massima per gli header di risposta del tool. Il corpo può poi arrivare senza limiti. */
  timeoutMs?: number;
  fetchUpstream?: typeof fetch;
}

// Header legati alla singola connessione o alla compressione: non vanno inoltrati al tool.
const HOP_BY_HOP = ["connection", "keep-alive", "proxy-connection", "transfer-encoding", "te", "trailer", "upgrade", "host", "accept-encoding"];

export function createGateway(options: GatewayOptions): (request: Request) => Promise<Response> {
  const fetchUpstream = options.fetchUpstream ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;

  return async (request) => {
    const url = new URL(request.url);
    const slug = toolSlugFromHost(url.hostname, options.toolsDomain);
    if (!slug) return text(404, "Tool non trovato");
    if (!isAllowedRequest(request.method, request.headers.get("sec-fetch-site"))) {
      return text(403, "Richiesta da un altro sito non consentita");
    }

    const auth = await options.authenticate(request, slug);
    if (!auth.ok) return auth.response;

    const headers = forwardedHeaders(request.headers, auth.identity, auth.role, SESSION_COOKIE);
    for (const name of HOP_BY_HOP) headers.delete(name);
    const hasBody = request.method !== "GET" && request.method !== "HEAD";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let upstream: Response;
    try {
      upstream = await fetchUpstream(new URL(url.pathname + url.search, auth.upstream), {
        method: request.method,
        headers,
        body: hasBody ? request.body : undefined,
        redirect: "manual",
        signal: controller.signal,
        duplex: "half",
      } as RequestInit);
    } catch {
      return controller.signal.aborted
        ? text(504, "Il tool non ha risposto in tempo")
        : text(502, "Tool non raggiungibile");
    } finally {
      clearTimeout(timer);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: returnedHeaders(upstream.headers, SESSION_COOKIE),
    });
  };
}

function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}
