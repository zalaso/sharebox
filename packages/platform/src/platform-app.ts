// Rotte della piattaforma (sharebox.getceng.it) per il login. Le pagine statiche le serve Caddy.
import { effectiveRole } from "./access";
import type { Config } from "./config";
import { LOGIN_STATE_COOKIE, PLATFORM_SESSION_COOKIE, clearHostCookie, hostCookie, readCookie } from "./cookies";
import { pkceChallenge, randomToken } from "./crypto";
import { authorizationUrl, exchangeCode, profileFromIdToken, type GoogleClient } from "./google";
import { escapeHtml, page, redirect, safePath } from "./html";
import type { Store, Tool, User } from "./store";

const DAY = 24 * 60 * 60 * 1000;
export const PLATFORM_SESSION_TTL = 30 * DAY;
const LOGIN_TTL = 10 * 60 * 1000;
// Il codice passa dal browser al dominio del tool con un redirect immediato: basta poco.
const TOOL_CODE_TTL = 60 * 1000;

export interface DashboardFiles {
  html: string;
  js: string;
  css: string;
}

export interface PlatformDeps {
  config: Config;
  store: Store;
  fetchFn?: typeof fetch;
  now?: () => number;
  /** File della dashboard (packages/platform/dashboard), serviti su /app. */
  dashboard?: DashboardFiles;
  /** Pacchetto npm della CLI, servito su /cli/sharebox.tgz. */
  cliTarball?: Uint8Array;
}

// La dashboard non ha script o stili inline e non carica nulla da altri domini.
const DASHBOARD_CSP =
  "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; " +
  "frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

export function createPlatformApp(deps: PlatformDeps): (request: Request) => Promise<Response> {
  const { config, store } = deps;
  const now = deps.now ?? Date.now;
  const google: GoogleClient = {
    clientId: config.googleClientId,
    clientSecret: config.googleClientSecret,
    redirectUri: `https://${config.platformDomain}/auth/callback`,
  };

  function currentUser(request: Request): User | null {
    const token = readCookie(request.headers.get("cookie"), PLATFORM_SESSION_COOKIE);
    return token ? store.sessionUser("platform", token) : null;
  }

  /** Avvia il login Google; al ritorno si prosegue verso `next`. */
  function login(url: URL): Response {
    const state = randomToken();
    const nonce = randomToken();
    const codeVerifier = randomToken();
    store.createLoginState(state, { nonce, codeVerifier, next: safePath(url.searchParams.get("next")) }, LOGIN_TTL);
    return redirect(authorizationUrl(google, { state, nonce, codeChallenge: pkceChallenge(codeVerifier) }), [
      hostCookie(LOGIN_STATE_COOKIE, state, LOGIN_TTL / 1000),
    ]);
  }

  async function callback(request: Request, url: URL): Promise<Response> {
    if (url.searchParams.has("error")) {
      return page(400, "Accesso annullato", `<p>Il login con Google non è stato completato.</p>`);
    }
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    // Lo stato deve coincidere con il cookie del browser che ha avviato il login.
    if (!state || !code || state !== readCookie(request.headers.get("cookie"), LOGIN_STATE_COOKIE)) {
      return page(400, "Accesso non valido", `<p>Riapri il link del tool e accedi di nuovo.</p>`);
    }
    const pending = store.takeLoginState(state);
    if (!pending) return page(400, "Accesso scaduto", `<p>Riapri il link del tool e accedi di nuovo.</p>`);

    let user: User;
    try {
      const idToken = await exchangeCode(google, code, pending.codeVerifier, deps.fetchFn);
      const profile = profileFromIdToken(idToken, {
        clientId: google.clientId,
        nonce: pending.nonce,
        nowSeconds: Math.floor(now() / 1000),
      });
      user = store.upsertUser(profile, config.creatorEmails.has(profile.email));
    } catch (error) {
      console.error("Login Google non riuscito:", error);
      return page(502, "Accesso non riuscito", `<p>Google non ha confermato l'accesso. Riprova tra poco.</p>`);
    }

    const session = store.createSession("platform", user.sub, null, PLATFORM_SESSION_TTL);
    return redirect(pending.next, [
      clearHostCookie(LOGIN_STATE_COOKIE),
      hostCookie(PLATFORM_SESSION_COOKIE, session, PLATFORM_SESSION_TTL / 1000),
    ]);
  }

  /**
   * Punto d'ingresso dal tool: verifica l'accesso e rimanda al dominio del tool con un codice monouso,
   * che il gateway scambia con una sessione valida solo per quel tool.
   */
  function toolEntry(request: Request, url: URL): Response {
    const tool = store.toolBySlug(url.searchParams.get("tool") ?? "");
    if (!tool) return page(404, "Tool non trovato", `<p>Controlla il link che hai ricevuto.</p>`);
    const user = currentUser(request);
    if (!user) return redirect(`/auth/login?${new URLSearchParams({ next: url.pathname + url.search })}`);
    if (tool.status !== "active") return suspended(tool);

    const role = effectiveRole(user, tool.ownerEmail, store.grantsFor(tool.id));
    if (!role) return accessDenied(tool, user, url.pathname + url.search);

    const next = safePath(url.searchParams.get("next"));
    const code = store.createToolCode(user.sub, tool.id, next, TOOL_CODE_TTL);
    return redirect(`https://${tool.slug}.${config.toolsDomain}/__sharebox/auth/callback?${new URLSearchParams({ code, next })}`);
  }

  /**
   * Login della CLI: `sharebox login` ascolta su 127.0.0.1:<porta> e apre questa pagina nel browser.
   * Dopo la conferma esplicita, il token viene consegnato solo a quell'indirizzo locale.
   */
  function cliLogin(request: Request, url: URL, params: URLSearchParams): Response {
    const port = Number(params.get("port"));
    const state = params.get("state") ?? "";
    const device = (params.get("device") ?? "").replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 60) || "computer";
    if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^[A-Za-z0-9_-]{16,128}$/.test(state)) {
      return page(400, "Richiesta non valida", `<p>Riprova con <code>sharebox login</code>.</p>`);
    }
    const user = currentUser(request);
    if (!user) return redirect(`/auth/login?${new URLSearchParams({ next: url.pathname + url.search })}`);

    if (request.method === "GET") {
      const hidden = (name: string, value: string | number) => `<input type="hidden" name="${name}" value="${escapeHtml(String(value))}">`;
      return page(
        200,
        "Autorizzare la CLI?",
        `<p>La CLI di ShareBox su <strong>${escapeHtml(device)}</strong> potrà pubblicare e condividere tool a nome di <strong>${escapeHtml(user.email)}</strong>.</p>
         <p class="muted">Se non hai appena eseguito <code>sharebox login</code>, chiudi questa pagina.</p>
         <form method="post" action="/auth/cli">${hidden("port", port)}${hidden("state", state)}${hidden("device", device)}
           <button type="submit">Autorizza</button>
         </form>`,
      );
    }
    // Solo un modulo inviato da questa pagina: un altro sito non può creare token a nome dell'utente.
    // Con referrer-policy no-referrer i browser mandano "Origin: null": vale anche Sec-Fetch-Site, che il browser imposta da sé.
    const sameOrigin =
      request.headers.get("origin") === `https://${config.platformDomain}` || request.headers.get("sec-fetch-site") === "same-origin";
    if (!sameOrigin) return page(403, "Richiesta non consentita", `<p>Riprova con <code>sharebox login</code>.</p>`);
    const { id, token } = store.createApiToken(user.sub, `CLI – ${device}`);
    store.audit({ actor: user.email, channel: "web", action: "token.create", toolId: null, details: { id, device } });
    return redirect(`http://127.0.0.1:${port}/callback?${new URLSearchParams({ state, token })}`);
  }

  function logout(request: Request, url: URL): Response {
    const token = readCookie(request.headers.get("cookie"), PLATFORM_SESSION_COOKIE);
    if (token) store.deleteSession(token);
    return redirect(safePath(url.searchParams.get("next")), [clearHostCookie(PLATFORM_SESSION_COOKIE)]);
  }

  function dashboard(request: Request, url: URL): Response {
    const files = deps.dashboard;
    if (!files) return page(404, "Pagina non trovata", "");
    const common = { "cache-control": "no-cache", "x-content-type-options": "nosniff" };
    if (url.pathname === "/app/app.js") return new Response(files.js, { headers: { ...common, "content-type": "text/javascript; charset=utf-8" } });
    if (url.pathname === "/app/app.css") return new Response(files.css, { headers: { ...common, "content-type": "text/css; charset=utf-8" } });
    if (url.pathname !== "/app" && url.pathname !== "/app/") return page(404, "Pagina non trovata", "");
    if (!currentUser(request)) return redirect("/auth/login?next=%2Fapp");
    return new Response(files.html, {
      headers: {
        ...common,
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": DASHBOARD_CSP,
        "x-frame-options": "DENY",
        "referrer-policy": "same-origin",
      },
    });
  }

  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/cli/sharebox.tgz" && request.method === "GET") {
      if (!deps.cliTarball) return page(404, "CLI non disponibile su questa istanza", "");
      return new Response(deps.cliTarball, {
        headers: { "content-type": "application/gzip", "content-disposition": "attachment; filename=sharebox.tgz", "cache-control": "no-cache" },
      });
    }
    if ((url.pathname === "/app" || url.pathname.startsWith("/app/")) && request.method === "GET") return dashboard(request, url);
    if (url.pathname === "/auth/cli" && request.method === "POST") {
      return cliLogin(request, url, new URLSearchParams(await request.text()));
    }
    if (request.method !== "GET") return page(405, "Metodo non consentito", "");
    switch (url.pathname) {
      case "/auth/cli":
        return cliLogin(request, url, url.searchParams);
      case "/auth/login":
        return login(url);
      case "/auth/callback":
        return callback(request, url);
      case "/auth/tool":
        return toolEntry(request, url);
      case "/auth/logout":
        return logout(request, url);
      default:
        return page(404, "Pagina non trovata", "");
    }
  };
}

/** `platformOrigin` serve quando la pagina è mostrata sul dominio del tool. */
export function accessDenied(tool: Tool, user: User, retryPath: string, platformOrigin = ""): Response {
  const switchAccount = `${platformOrigin}/auth/logout?${new URLSearchParams({ next: retryPath })}`;
  return page(
    403,
    "Non hai accesso a questo tool",
    `<p>Il tool <strong>${escapeHtml(tool.name)}</strong> non è condiviso con <strong>${escapeHtml(user.email)}</strong>.</p>
     <p>Chiedi a chi ti ha mandato il link di condividerlo con te, oppure <a href="${escapeHtml(switchAccount)}">accedi con un altro account</a>.</p>`,
  );
}

export function suspended(tool: Tool): Response {
  return page(503, "Tool sospeso", `<p>Il tool <strong>${escapeHtml(tool.name)}</strong> è stato sospeso da chi lo gestisce.</p>`);
}
