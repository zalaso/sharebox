// File statici del tool (cartella public/), serviti dal servizio "disk" di workerd.

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json",
  map: "application/json",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  pdf: "application/pdf",
  wasm: "application/wasm",
};

export function contentType(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return (dot > 0 && TYPES[name.slice(dot + 1).toLowerCase()]) || "application/octet-stream";
}

/** Percorsi del file da cercare per un URL: `/` → `/index.html`, `/pagina` → anche `/pagina.html`. */
export function assetCandidates(pathname: string): string[] {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return [];
  }
  if (path.includes("\\") || path.split("/").some((s) => s === "..")) return [];
  if (path.endsWith("/")) return [`${path}index.html`];
  const last = path.slice(path.lastIndexOf("/") + 1);
  return last.includes(".") ? [path] : [path, `${path}.html`, `${path}/index.html`];
}

export interface AssetFetcher {
  fetch(request: Request | URL | string): Promise<Response>;
}

/** Il file statico per questa richiesta, o null se non esiste. */
export async function serveAsset(assets: AssetFetcher, request: Request): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  for (const path of assetCandidates(new URL(request.url).pathname)) {
    let found: Response;
    try {
      found = await assets.fetch(new URL(path, "http://assets"));
    } catch {
      // Il servizio "disk" va in errore se il percorso è una cartella: si prova il candidato successivo.
      continue;
    }
    if (!found.ok) continue;
    // Il servizio "disk" risponde sempre application/octet-stream e con last-modified:
    // senza tipo il browser scarica la pagina, senza no-cache non vede i nuovi deploy.
    const headers = new Headers(found.headers);
    headers.set("content-type", contentType(path));
    headers.set("cache-control", "no-cache");
    headers.set("x-content-type-options", "nosniff");
    return new Response(request.method === "HEAD" ? null : found.body, { status: 200, headers });
  }
  return null;
}
