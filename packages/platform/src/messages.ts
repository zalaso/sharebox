// Testi della piattaforma in italiano e inglese. La lingua viene dall'header Accept-Language
// (browser, oppure la CLI che manda la lingua del sistema).
// Le chiavi "page.*" contengono HTML: i parametri vanno passati con tHtml, che li escapa.
import { format, pickLang, type Lang } from "@sharebox/shared";
import { escapeHtml } from "./html";

const it = {
  // API
  "api.tool_not_found": "Tool non trovato",
  "api.use_only": "Puoi usare questo tool ma non gestirlo",
  "api.not_creator": "Il tuo account non può pubblicare tool: chiedi di essere abilitato a chi gestisce questa ShareBox",
  "api.tool_limit": "Hai raggiunto il limite di {max} tool",
  "api.name_required": "Serve un nome (massimo 80 caratteri)",
  "api.files_missing": "Manca l'elenco dei file (files)",
  "api.invalid_content": "{path}: contenuto non valido",
  "api.nothing_to_publish": "Il tool non contiene file né un worker",
  "api.publish_failed": "Pubblicazione non riuscita sul server, riprova tra poco",
  "api.owner_only_delete": "Solo il proprietario può eliminare il tool",
  "api.delete_failed": "Eliminazione non riuscita sul server, riprova tra poco",
  "api.invalid_role": "Il ruolo deve essere use o manage",
  "api.owner_has_access": "Il proprietario ha già accesso completo",
  "api.grant_not_found": "Condivisione non trovata",
  "api.operation_failed": "Operazione non riuscita sul server, riprova tra poco",
  "api.info_unavailable": "Informazione non disponibile, riprova tra poco",
  "api.token_not_found": "Token non trovato",
  "api.not_found": "Operazione non trovata",
  "api.unauthorized": "Token mancante o non valido: esegui `sharebox login`",
  "api.forbidden": "Richiesta non consentita",
  "api.session_expired": "Sessione scaduta: ricarica la pagina",
  "api.invalid_grant": "Condivisione non valida: serve type user (con email), domain (con dominio) o anyone",
  "api.too_large": "Richiesta troppo grande",
  "api.invalid_json": "JSON non valido",
  "api.internal": "Errore interno",
  // Pagine (HTML)
  "page.login_cancelled.title": "Accesso annullato",
  "page.login_cancelled.body": "<p>Il login con Google non è stato completato.</p>",
  "page.login_invalid.title": "Accesso non valido",
  "page.login_expired.title": "Accesso scaduto",
  "page.login_retry.body": "<p>Riapri il link del tool e accedi di nuovo.</p>",
  "page.login_failed.title": "Accesso non riuscito",
  "page.login_failed.body": "<p>Google non ha confermato l'accesso. Riprova tra poco.</p>",
  "page.tool_not_found.title": "Tool non trovato",
  "page.tool_not_found.body": "<p>Controlla il link che hai ricevuto.</p>",
  "page.cli_invalid.title": "Richiesta non valida",
  "page.cli_retry.body": "<p>Riprova con <code>sharebox login</code>.</p>",
  "page.cli_confirm.title": "Autorizzare la CLI?",
  "page.cli_confirm.body":
    "<p>La CLI di ShareBox su <strong>{device}</strong> potrà pubblicare e condividere tool a nome di <strong>{email}</strong>.</p>" +
    "<p class=\"muted\">Se non hai appena eseguito <code>sharebox login</code>, chiudi questa pagina.</p>",
  "page.cli_confirm.button": "Autorizza",
  "page.forbidden.title": "Richiesta non consentita",
  "page.not_found.title": "Pagina non trovata",
  "page.cli_unavailable.title": "CLI non disponibile su questa istanza",
  "page.method_not_allowed.title": "Metodo non consentito",
  "page.access_denied.title": "Non hai accesso a questo tool",
  "page.access_denied.body":
    "<p>Il tool <strong>{tool}</strong> non è condiviso con <strong>{email}</strong>.</p>" +
    "<p>Chiedi a chi ti ha mandato il link di condividerlo con te, oppure <a href=\"{switch}\">accedi con un altro account</a>.</p>",
  "page.suspended.title": "Tool sospeso",
  "page.suspended.body": "<p>Il tool <strong>{tool}</strong> è stato sospeso da chi lo gestisce.</p>",
  "page.not_published.title": "Tool non ancora pubblicato",
  "page.not_published.body": "<p>Il tool <strong>{tool}</strong> esiste ma non è ancora stato pubblicato.</p>",
  "page.link_expired.title": "Link di accesso scaduto",
  "page.link_expired.body": "<p><a href=\"{retry}\">Accedi di nuovo</a> per aprire il tool.</p>",
  "text.login_required": "Accesso richiesto",
} as const;

export type MessageKey = keyof typeof it;

const en: Record<MessageKey, string> = {
  "api.tool_not_found": "Tool not found",
  "api.use_only": "You can use this tool but not manage it",
  "api.not_creator": "Your account cannot publish tools: ask the operator of this ShareBox to enable it",
  "api.tool_limit": "You have reached the limit of {max} tools",
  "api.name_required": "A name is required (at most 80 characters)",
  "api.files_missing": "The list of files (files) is missing",
  "api.invalid_content": "{path}: invalid content",
  "api.nothing_to_publish": "The tool contains neither files nor a worker",
  "api.publish_failed": "Publishing failed on the server, please try again shortly",
  "api.owner_only_delete": "Only the owner can delete the tool",
  "api.delete_failed": "Deletion failed on the server, please try again shortly",
  "api.invalid_role": "The role must be use or manage",
  "api.owner_has_access": "The owner already has full access",
  "api.grant_not_found": "Share not found",
  "api.operation_failed": "Operation failed on the server, please try again shortly",
  "api.info_unavailable": "Information not available, please try again shortly",
  "api.token_not_found": "Token not found",
  "api.not_found": "Operation not found",
  "api.unauthorized": "Missing or invalid token: run `sharebox login`",
  "api.forbidden": "Request not allowed",
  "api.session_expired": "Session expired: reload the page",
  "api.invalid_grant": "Invalid share: type must be user (with an email), domain (with a domain) or anyone",
  "api.too_large": "Request too large",
  "api.invalid_json": "Invalid JSON",
  "api.internal": "Internal error",
  "page.login_cancelled.title": "Sign-in cancelled",
  "page.login_cancelled.body": "<p>Google sign-in was not completed.</p>",
  "page.login_invalid.title": "Invalid sign-in",
  "page.login_expired.title": "Sign-in expired",
  "page.login_retry.body": "<p>Open the tool's link again and sign in.</p>",
  "page.login_failed.title": "Sign-in failed",
  "page.login_failed.body": "<p>Google did not confirm the sign-in. Please try again shortly.</p>",
  "page.tool_not_found.title": "Tool not found",
  "page.tool_not_found.body": "<p>Check the link you received.</p>",
  "page.cli_invalid.title": "Invalid request",
  "page.cli_retry.body": "<p>Try again with <code>sharebox login</code>.</p>",
  "page.cli_confirm.title": "Authorize the CLI?",
  "page.cli_confirm.body":
    "<p>The ShareBox CLI on <strong>{device}</strong> will be able to publish and share tools on behalf of <strong>{email}</strong>.</p>" +
    "<p class=\"muted\">If you did not just run <code>sharebox login</code>, close this page.</p>",
  "page.cli_confirm.button": "Authorize",
  "page.forbidden.title": "Request not allowed",
  "page.not_found.title": "Page not found",
  "page.cli_unavailable.title": "CLI not available on this instance",
  "page.method_not_allowed.title": "Method not allowed",
  "page.access_denied.title": "You don't have access to this tool",
  "page.access_denied.body":
    "<p>The tool <strong>{tool}</strong> is not shared with <strong>{email}</strong>.</p>" +
    "<p>Ask whoever sent you the link to share it with you, or <a href=\"{switch}\">sign in with another account</a>.</p>",
  "page.suspended.title": "Tool suspended",
  "page.suspended.body": "<p>The tool <strong>{tool}</strong> has been suspended by its managers.</p>",
  "page.not_published.title": "Tool not published yet",
  "page.not_published.body": "<p>The tool <strong>{tool}</strong> exists but has not been published yet.</p>",
  "page.link_expired.title": "Sign-in link expired",
  "page.link_expired.body": "<p><a href=\"{retry}\">Sign in again</a> to open the tool.</p>",
  "text.login_required": "Sign-in required",
};

const MESSAGES: Record<Lang, Record<MessageKey, string>> = { it, en };

export type Params = Record<string, string | number>;

export function t(lang: Lang, key: MessageKey, params?: Params): string {
  return format(MESSAGES[lang][key], params);
}

/** Come t, ma per testi HTML: i parametri vengono escapati. */
export function tHtml(lang: Lang, key: MessageKey, params: Params = {}): string {
  const safe = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, escapeHtml(String(v))]));
  return format(MESSAGES[lang][key], safe);
}

export function langOf(request: Request): Lang {
  return pickLang(request.headers.get("accept-language"));
}
