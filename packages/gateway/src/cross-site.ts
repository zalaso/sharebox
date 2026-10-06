const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const TRUSTED_SITES = new Set(["same-origin", "none"]);

/**
 * I tool sono "stesso sito" tra loro (ADR 0002), quindi SameSite non impedisce a un tool
 * di mandare richieste con i cookie a un altro. Le richieste che modificano dati passano
 * solo se partono dallo stesso tool o da un'azione diretta dell'utente.
 * Senza `Sec-Fetch-Site` la richiesta non viene da un browser moderno: nessun rischio CSRF.
 */
export function isAllowedRequest(method: string, secFetchSite: string | null): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  if (secFetchSite === null) return true;
  return TRUSTED_SITES.has(secFetchSite);
}
