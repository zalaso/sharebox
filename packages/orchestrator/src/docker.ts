// Client minimo per la Docker Engine API sul socket Unix.
import { request as httpRequest } from "node:http";

export interface DockerResponse {
  status: number;
  body: unknown;
}

export interface Docker {
  request(method: string, path: string, body?: unknown): Promise<DockerResponse>;
  /** Risposta senza interpretarla: serve per i log, che sono un flusso binario. */
  raw(method: string, path: string): Promise<{ status: number; body: Buffer }>;
}

export function socketDocker(socketPath: string): Docker {
  return {
    raw: (method, path) =>
      new Promise((resolve, reject) => {
        const req = httpRequest({ socketPath, method, path }, (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }));
        });
        req.on("error", reject);
        req.end();
      }),
    request: (method, path, body) =>
      new Promise((resolve, reject) => {
        const payload = body === undefined ? undefined : JSON.stringify(body);
        const req = httpRequest(
          {
            socketPath,
            method,
            path,
            headers: payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {},
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => chunks.push(chunk));
            res.on("end", () => {
              const text = Buffer.concat(chunks).toString("utf8");
              let parsed: unknown = text;
              try {
                parsed = text ? JSON.parse(text) : null;
              } catch {
                // Alcune risposte di errore non sono JSON: si tiene il testo.
              }
              resolve({ status: res.statusCode ?? 0, body: parsed });
            });
          },
        );
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
      }),
  };
}

/** Lancia un errore se lo stato non è tra quelli accettati. */
export function expectStatus(response: DockerResponse, action: string, ...accepted: number[]): DockerResponse {
  if (accepted.includes(response.status)) return response;
  const message = (response.body as { message?: string } | null)?.message ?? JSON.stringify(response.body);
  throw new Error(`Docker, ${action}: ${response.status} ${message}`);
}
