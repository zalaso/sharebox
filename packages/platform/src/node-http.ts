// Adattatore tra il server HTTP di Node e gli handler basati su Request/Response.
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

export function nodeHandler(handle: (request: Request) => Promise<Response>) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      if (!req.headers.host) {
        res.writeHead(400).end();
        return;
      }
      await send(res, await handle(toRequest(req)));
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  };
}

function toRequest(req: IncomingMessage): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) headers.append(name, v);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  // Caddy termina HTTPS: verso l'esterno ogni richiesta è https.
  return new Request(`https://${req.headers.host}${req.url}`, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    duplex: "half",
  } as RequestInit);
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  const out: Record<string, string | string[]> = {};
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") out[name] = value;
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) out["set-cookie"] = cookies;
  res.writeHead(response.status, out);
  if (response.body) Readable.fromWeb(response.body as NodeReadableStream).pipe(res);
  else res.end();
}
