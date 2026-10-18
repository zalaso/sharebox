// Proxy di uscita dei tool (ADR 0009). Ascolta su una porta raggiungibile dai container dei tool;
// riceve dal runtime del tool la richiesta originale, con il token del tool e l'indirizzo di destinazione.
// Lascia passare solo HTTPS verso i domini dichiarati dal tool, inserisce i segreti destinati a quel dominio
// e rifiuta i domini che risolvono verso indirizzi non pubblici (rete del server, Tailscale, localhost…).
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpsRequest } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import { BlockList, isIP } from "node:net";
import { hostAllowed } from "@sharebox/shared";
import { decryptSecret, hashToken } from "./crypto";
import type { Store, Tool } from "./store";

export const EGRESS_LIMITS = {
  maxRequestBytes: 1024 * 1024,
  maxResponseBytes: 10 * 1024 * 1024,
  timeoutMs: 20_000,
  requestsPerMinute: 120,
  concurrentPerTool: 8,
} as const;

const TOKEN_HEADER = "x-sharebox-egress-token";
const TARGET_HEADER = "x-sharebox-egress-target";
const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-connection", "transfer-encoding", "te", "trailer", "upgrade", "host", "content-length"]);
const SECRET = /\{\{secret:([A-Z][A-Z0-9_]{0,63})\}\}/g;
// Nell'indirizzo le graffe possono arrivare codificate (%7B%7B…%7D%7D), per esempio nel percorso.
const SECRET_IN_URL = /(?:\{\{|%7B%7B)secret:([A-Z][A-Z0-9_]{0,63})(?:\}\}|%7D%7D)/gi;

// Indirizzi che un tool non deve poter raggiungere, anche con un dominio permesso che li risolve.
const NOT_PUBLIC = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) NOT_PUBLIC.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32]] as const) {
  NOT_PUBLIC.addSubnet(net, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !NOT_PUBLIC.check(address, "ipv4");
  if (family !== 6) return false;
  // IPv4 dentro IPv6 (::ffff:10.0.0.1): conta l'indirizzo IPv4.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isPublicAddress(mapped[1]!);
  return !NOT_PUBLIC.check(address, "ipv6");
}

type Resolver = (host: string) => Promise<LookupAddress[]>;
const systemResolver: Resolver = (host) =>
  new Promise((resolve, reject) => dnsLookup(host, { all: true }, (error, addresses) => (error ? reject(error) : resolve(addresses))));

export class EgressError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Richiesta pronta da inoltrare, dopo controlli e segreti. */
export interface PreparedRequest {
  tool: Tool;
  target: URL;
  method: string;
  headers: Record<string, string>;
  body: Buffer | undefined;
}

/** Controlli e segreti, senza rete: la parte che decide cosa può uscire. */
export function prepareRequest(
  store: Store,
  secretsKey: Buffer,
  input: { method: string; headers: Record<string, string | string[] | undefined>; body: Buffer | undefined },
): PreparedRequest {
  const token = String(input.headers[TOKEN_HEADER] ?? "");
  const tool = token ? store.toolByEgressToken(hashToken(token)) : null;
  if (!tool || tool.status !== "active") throw new EgressError(403, "ShareBox egress: unknown or suspended tool");

  let target: URL;
  try {
    target = new URL(String(input.headers[TARGET_HEADER] ?? ""));
  } catch {
    throw new EgressError(400, "ShareBox egress: invalid target URL");
  }
  if (target.protocol !== "https:" || (target.port && target.port !== "443") || target.username || target.password) {
    throw new EgressError(403, "ShareBox egress: only https:// on the default port is allowed");
  }
  if (isIP(target.hostname.replace(/^\[|\]$/g, "")) || !hostAllowed(target.hostname, tool.networkAllow)) {
    throw new EgressError(403, `ShareBox egress: ${target.hostname} is not in network.allow in sharebox.json`);
  }

  // Segreti: {{secret:NOME}} nell'indirizzo, negli header o nel corpo, solo se destinati a questo dominio.
  const secrets = new Map(store.secretValues(tool.id).map((s) => [s.name, s]));
  const fill = (text: string, pattern: RegExp = SECRET): string =>
    text.replace(pattern, (_, name: string) => {
      const secret = secrets.get(name);
      if (!secret) throw new EgressError(403, `ShareBox egress: secret ${name} is not set (sharebox secret set)`);
      if (!hostAllowed(target.hostname, [secret.host])) throw new EgressError(403, `ShareBox egress: secret ${name} is only for ${secret.host}`);
      return decryptSecret(secretsKey, secret.value);
    });

  const filledTarget = new URL(fill(target.toString(), SECRET_IN_URL));
  if (filledTarget.hostname !== target.hostname) throw new EgressError(403, "ShareBox egress: secrets cannot change the host");
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.headers)) {
    const key = name.toLowerCase();
    if (value === undefined || HOP_BY_HOP.has(key) || key.startsWith("x-sharebox-")) continue;
    headers[key] = fill(Array.isArray(value) ? value.join(", ") : value);
  }
  let body = input.body;
  if (body && body.length > 0 && SECRET.test(body.toString("latin1"))) {
    SECRET.lastIndex = 0;
    body = Buffer.from(fill(body.toString("utf8")), "utf8");
  }
  SECRET.lastIndex = 0;
  return { tool, target: filledTarget, method: input.method, headers, body };
}

/** Risolve il nome e rifiuta gli indirizzi non pubblici; restituisce l'indirizzo a cui collegarsi. */
export async function resolvePublic(host: string, resolve: Resolver = systemResolver): Promise<LookupAddress> {
  let addresses: LookupAddress[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new EgressError(502, `ShareBox egress: cannot resolve ${host}`);
  }
  if (addresses.length === 0) throw new EgressError(502, `ShareBox egress: cannot resolve ${host}`);
  // Tutti pubblici, non solo il primo: un nome che mescola indirizzi interni è sospetto.
  if (!addresses.every((a) => isPublicAddress(a.address))) throw new EgressError(403, `ShareBox egress: ${host} resolves to a non-public address`);
  return addresses[0]!;
}

export interface EgressDeps {
  store: Store;
  secretsKey: Buffer;
  resolve?: Resolver;
  now?: () => number;
}

/** Gestore HTTP del proxy, da montare su un server Node dedicato. */
export function createEgressHandler(deps: EgressDeps): (req: IncomingMessage, res: ServerResponse) => void {
  const now = deps.now ?? Date.now;
  const windows = new Map<string, { start: number; count: number; active: number }>();

  const fail = (res: ServerResponse, status: number, message: string) => {
    if (!res.headersSent) res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
    res.end(message);
  };

  return (req, res) => {
    void (async () => {
      if (req.url !== "/fetch") return fail(res, 404, "not found");
      const body = await readBody(req);
      const prepared = prepareRequest(deps.store, deps.secretsKey, { method: req.method ?? "GET", headers: req.headers, body });

      // Limiti per tool: richieste al minuto e in parallelo.
      const usage = windows.get(prepared.tool.id) ?? { start: now(), count: 0, active: 0 };
      if (now() - usage.start >= 60_000) Object.assign(usage, { start: now(), count: 0 });
      if (usage.count >= EGRESS_LIMITS.requestsPerMinute || usage.active >= EGRESS_LIMITS.concurrentPerTool) {
        throw new EgressError(429, "ShareBox egress: too many requests from this tool, slow down");
      }
      usage.count += 1;
      usage.active += 1;
      windows.set(prepared.tool.id, usage);
      try {
        await forward(prepared, res, deps.resolve);
      } finally {
        usage.active -= 1;
      }
    })().catch((error: unknown) => {
      if (error instanceof EgressError) return fail(res, error.status, error.message);
      console.error("Uscita di un tool non riuscita:", error);
      fail(res, 502, "ShareBox egress: request failed");
    });
  };
}

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > EGRESS_LIMITS.maxRequestBytes) throw new EgressError(413, "ShareBox egress: request body too large (max 1 MB)");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function forward(prepared: PreparedRequest, res: ServerResponse, resolve?: Resolver): Promise<void> {
  const { target } = prepared;
  const address = await resolvePublic(target.hostname, resolve);
  await new Promise<void>((done, reject) => {
    const outgoing = httpsRequest(
      {
        host: address.address,
        family: address.family,
        port: 443,
        servername: target.hostname, // il certificato viene verificato sul nome, non sull'IP
        method: prepared.method,
        path: target.pathname + target.search,
        headers: { ...prepared.headers, host: target.host, ...(prepared.body ? { "content-length": String(prepared.body.length) } : {}) },
        timeout: EGRESS_LIMITS.timeoutMs,
      },
      (incoming) => {
        const headers: Record<string, string | string[]> = {};
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (value !== undefined && !HOP_BY_HOP.has(name)) headers[name] = value;
        }
        res.writeHead(incoming.statusCode ?? 502, headers);
        let size = 0;
        incoming.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > EGRESS_LIMITS.maxResponseBytes) {
            incoming.destroy();
            res.destroy();
            return;
          }
          res.write(chunk);
        });
        incoming.on("end", () => {
          res.end();
          done();
        });
        incoming.on("error", reject);
      },
    );
    outgoing.on("timeout", () => outgoing.destroy(new EgressError(504, "ShareBox egress: the remote server did not answer in time")));
    outgoing.on("error", (error) => reject(error instanceof EgressError ? error : new EgressError(502, `ShareBox egress: ${error.message}`)));
    outgoing.end(prepared.body);
  });
}
