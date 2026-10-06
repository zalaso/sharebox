// Controllo di accesso del gateway, eseguito a ogni richiesta verso un tool.
import type { Authentication } from "@sharebox/gateway";
import { SESSION_COOKIE } from "@sharebox/shared";
import { effectiveRole } from "./access";
import type { Config } from "./config";
import { clearHostCookie, hostCookie, readCookie } from "./cookies";
import { escapeHtml, page, redirect, safePath } from "./html";
import { accessDenied, suspended } from "./platform-app";
import type { Store, Tool } from "./store";

export const TOOL_SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

// Percorsi gestiti dal gateway: non arrivano mai al codice del tool.
const CALLBACK_PATH = "/__sharebox/auth/callback";
const LOGOUT_PATH = "/__sharebox/logout";

export function createToolAuthenticator(deps: { config: Config; store: Store }) {
  const { config, store } = deps;
  const platform = `https://${config.platformDomain}`;

  function loginUrl(tool: Tool, next: string): string {
    return `${platform}/auth/tool?${new URLSearchParams({ tool: tool.slug, next })}`;
  }

  /** Scambia il codice monouso emesso dalla piattaforma con una sessione valida solo per questo tool. */
  function completeLogin(url: URL, tool: Tool): Response {
    const grant = store.takeToolCode(url.searchParams.get("code") ?? "", tool.id);
    if (!grant) {
      return page(
        400,
        "Link di accesso scaduto",
        `<p><a href="${escapeHtml(loginUrl(tool, "/"))}">Accedi di nuovo</a> per aprire il tool.</p>`,
      );
    }
    const session = store.createSession("tool", grant.userSub, tool.id, TOOL_SESSION_TTL);
    return redirect(safePath(grant.next), [hostCookie(SESSION_COOKIE, session, TOOL_SESSION_TTL / 1000)]);
  }

  function logout(request: Request): Response {
    const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
    if (token) store.deleteSession(token);
    return redirect(`${platform}/auth/logout?next=/`, [clearHostCookie(SESSION_COOKIE)]);
  }

  return async (request: Request, slug: string): Promise<Authentication> => {
    const url = new URL(request.url);
    const tool = store.toolBySlug(slug);
    if (!tool) return deny(page(404, "Tool non trovato", `<p>Controlla il link che hai ricevuto.</p>`));
    if (url.pathname === CALLBACK_PATH) return deny(completeLogin(url, tool));
    if (url.pathname === LOGOUT_PATH) return deny(logout(request));
    if (tool.status !== "active") return deny(suspended(tool));
    if (!store.latestDeployment(tool.id)) {
      return deny(page(503, "Tool non ancora pubblicato", `<p>Il tool <strong>${escapeHtml(tool.name)}</strong> esiste ma non è ancora stato pubblicato.</p>`));
    }

    const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
    const user = token ? store.sessionUser("tool", token, tool.id) : null;
    if (!user) {
      // Le navigazioni vanno al login; le chiamate dal codice del tool ricevono 401.
      const navigation = request.method === "GET" || request.method === "HEAD";
      return deny(navigation ? redirect(loginUrl(tool, url.pathname + url.search)) : new Response("Accesso richiesto", { status: 401 }));
    }

    // Permessi letti a ogni richiesta: una revoca vale dalla richiesta successiva.
    const role = effectiveRole(user, tool.ownerEmail, store.grantsFor(tool.id));
    if (!role) return deny(accessDenied(tool, user, `/auth/tool?${new URLSearchParams({ tool: tool.slug, next: "/" })}`, platform));

    return {
      ok: true,
      identity: { email: user.email, name: user.name, hostedDomain: user.hostedDomain ?? undefined },
      role,
      upstream: `http://tool-${tool.id}:8080`,
    };
  };
}

function deny(response: Response): Authentication {
  return { ok: false, response };
}
