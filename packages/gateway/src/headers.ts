import { IDENTITY_HEADERS, RESERVED_HEADER_PREFIX, type Identity, type Role } from "@sharebox/shared";

/**
 * Header da inoltrare al tool. Il client non può far arrivare header `x-sharebox-*`
 * e il cookie di sessione della piattaforma non raggiunge il codice del tool.
 */
export function forwardedHeaders(incoming: Headers, identity: Identity, role: Role, sessionCookie: string): Headers {
  const headers = new Headers();
  for (const [name, value] of incoming) {
    if (name.startsWith(RESERVED_HEADER_PREFIX)) continue;
    if (name === "cookie") {
      const kept = withoutCookie(value, sessionCookie);
      if (kept) headers.set("cookie", kept);
      continue;
    }
    headers.append(name, value);
  }
  headers.set(IDENTITY_HEADERS.email, identity.email);
  headers.set(IDENTITY_HEADERS.name, encodeURIComponent(identity.name));
  headers.set(IDENTITY_HEADERS.role, role);
  return headers;
}

/**
 * Header della risposta del tool da mandare al browser. Il tool non può impostare
 * il cookie di sessione della piattaforma (es. per far agire i visitatori con un'altra identità).
 * Il corpo arriva già decompresso da fetch: la compressione verso il browser la fa Caddy.
 */
export function returnedHeaders(upstream: Headers, sessionCookie: string): Headers {
  const headers = new Headers();
  const blocked = sessionCookie.toLowerCase();
  for (const [name, value] of upstream) {
    if (name === "set-cookie" || name === "content-encoding" || name === "content-length") continue;
    headers.append(name, value);
  }
  for (const cookie of upstream.getSetCookie()) {
    if (cookie.split("=", 1)[0]!.trim().toLowerCase() !== blocked) headers.append("set-cookie", cookie);
  }
  return headers;
}

function withoutCookie(cookieHeader: string, name: string): string {
  return cookieHeader
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair && pair.split("=", 1)[0] !== name)
    .join("; ");
}
