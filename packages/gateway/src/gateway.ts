import { SESSION_COOKIE, pickLang, type Identity, type Role } from "@sharebox/shared";
import { isAllowedRequest } from "./cross-site";
import { forwardedHeaders, returnedHeaders } from "./headers";
import { toolSlugFromHost } from "./host";

/** Esito del controllo di accesso: inoltrare al tool, oppure rispondere subito (login, 403, 404…). */
export type Authentication =
  | {
      ok: true;
      identity: Identity;
      role: Role;
      /** es. `http://tool-abc:8080` */
      upstream: string;
      /** Domini che le pagine del tool possono contattare dal browser, oltre a se stesse (ADR 0009). */
      connect?: readonly string[];
    }
  | { ok: false; response: Response };

export interface GatewayOptions {
  toolsDomain: string;
  authenticate: (request: Request, slug: string) => Promise<Authentication>;
  /** Attesa massima per gli header di risposta del tool. Il corpo può poi arrivare senza limiti. */
  timeoutMs?: number;
  /** Per quanto si riprova un tool che non risponde perché si sta riavviando (ripubblicazione). */
  retryWindowMs?: number;
  /** Prima attesa tra un tentativo e l'altro; raddoppia fino a un secondo. */
  retryDelayMs?: number;
  fetchUpstream?: typeof fetch;
}

const MESSAGES = {
  it: {
    notFound: "Tool non trovato",
    crossSite: "Richiesta da un altro sito non consentita",
    timeout: "Il tool non ha risposto in tempo",
    unreachable: "Tool non raggiungibile",
  },
  en: {
    notFound: "Tool not found",
    crossSite: "Requests from other sites are not allowed",
    timeout: "The tool did not respond in time",
    unreachable: "Tool unreachable",
  },
};

// Errori di connessione: la richiesta non è arrivata al tool, quindi si può sempre riprovare.
const NOT_DELIVERED = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT"]);
// Connessione caduta a metà: la richiesta potrebbe essere arrivata, quindi si riprovano solo le letture.
const DROPPED = new Set(["ECONNRESET", "EPIPE", "UND_ERR_SOCKET"]);
// Oltre questa dimensione il corpo passa in streaming, senza tentativi ripetuti.
const MAX_BUFFERED_BODY = 1024 * 1024;

function errorCode(error: unknown): string | undefined {
  const { code, cause } = error as { code?: string; cause?: { code?: string } };
  return cause?.code ?? code;
}

/**
 * Content-Security-Policy aggiunta a ogni risposta dei tool (ADR 0009). Limita le connessioni dal browser
 * (fetch, XHR, WebSocket, sendBeacon) al tool stesso e ai domini dichiarati, così una pagina non può mandare
 * altrove i dati che l'utente digita. Script, stili, font e immagini restano liberi: le librerie da CDN funzionano.
 * Si aggiunge a un'eventuale CSP del tool: il browser le applica tutte.
 */
export function toolCsp(connect: readonly string[] = []): string {
  const hosts = connect.map((host) => `https://${host}`).join(" ");
  return [
    `connect-src 'self'${hosts ? ` ${hosts}` : ""}`,
    "form-action 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

// Header legati alla singola connessione o alla compressione: non vanno inoltrati al tool.
const HOP_BY_HOP = ["connection", "keep-alive", "proxy-connection", "transfer-encoding", "te", "trailer", "upgrade", "host", "accept-encoding"];

export function createGateway(options: GatewayOptions): (request: Request) => Promise<Response> {
  const fetchUpstream = options.fetchUpstream ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const retryWindowMs = options.retryWindowMs ?? 10_000;
  const firstDelayMs = options.retryDelayMs ?? 200;

  return async (request) => {
    const url = new URL(request.url);
    const slug = toolSlugFromHost(url.hostname, options.toolsDomain);
    const lang = pickLang(request.headers.get("accept-language"));
    if (!slug) return text(404, MESSAGES[lang].notFound);
    if (!isAllowedRequest(request.method, request.headers.get("sec-fetch-site"))) {
      return text(403, MESSAGES[lang].crossSite);
    }

    const auth = await options.authenticate(request, slug);
    if (!auth.ok) return auth.response;

    const headers = forwardedHeaders(request.headers, auth.identity, auth.role, SESSION_COOKIE);
    for (const name of HOP_BY_HOP) headers.delete(name);
    const reading = request.method === "GET" || request.method === "HEAD";
    // I corpi piccoli si tengono in memoria, così la richiesta si può ripetere se il tool si sta riavviando.
    const length = Number(request.headers.get("content-length") ?? NaN);
    const body = reading ? undefined : length <= MAX_BUFFERED_BODY ? await request.arrayBuffer() : request.body;
    const canRetry = !(body instanceof ReadableStream);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const deadline = Date.now() + retryWindowMs;
    let delay = firstDelayMs;
    let upstream: Response;
    try {
      for (;;) {
        try {
          upstream = await fetchUpstream(new URL(url.pathname + url.search, auth.upstream), {
            method: request.method,
            headers,
            body,
            redirect: "manual",
            signal: controller.signal,
            duplex: "half",
          } as RequestInit);
          break;
        } catch (error) {
          if (controller.signal.aborted) return text(504, MESSAGES[lang].timeout);
          // Durante una ripubblicazione il container è assente per un attimo: si aspetta invece di fallire.
          const code = errorCode(error);
          const retryable = canRetry && code !== undefined && (NOT_DELIVERED.has(code) || (reading && DROPPED.has(code)));
          if (!retryable || Date.now() + delay > deadline) return text(502, MESSAGES[lang].unreachable);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay = Math.min(delay * 2, 1000);
        }
      }
    } finally {
      clearTimeout(timer);
    }
    const returned = returnedHeaders(upstream.headers, SESSION_COOKIE);
    returned.append("content-security-policy", toolCsp(auth.connect));
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: returned,
    });
  };
}

function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}
