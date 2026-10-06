/** Sessione sulla piattaforma (sharebox.getceng.it). */
export const PLATFORM_SESSION_COOKIE = "__Host-sharebox-platform";

/** Lega il login Google al browser che l'ha iniziato: impedisce di far completare a qualcun altro il proprio login. */
export const LOGIN_STATE_COOKIE = "__Host-sharebox-login";

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator !== -1 && pair.slice(0, separator).trim() === name) return pair.slice(separator + 1).trim();
  }
  return null;
}

/** Cookie `__Host-`: solo HTTPS, solo l'host che lo imposta, non leggibile da JavaScript. */
export function hostCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearHostCookie(name: string): string {
  return hostCookie(name, "", 0);
}
