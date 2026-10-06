// `sharebox login`: la CLI ascolta su 127.0.0.1, apre il browser sulla piattaforma
// (/auth/cli), l'utente conferma e la piattaforma rimanda qui il token.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { hostname } from "node:os";
import { lang, m } from "./i18n";

export function openInBrowser(url: string): void {
  const [command, args] =
    process.platform === "win32"
      ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => undefined);
  child.unref();
}

export interface LoginOptions {
  open?: (url: string) => void;
  /** Riceve l'indirizzo da aprire, per mostrarlo se il browser non si apre da solo. */
  onUrl?: (url: string) => void;
  timeoutMs?: number;
  device?: string;
}

export function browserLogin(baseUrl: string, options: LoginOptions = {}): Promise<string> {
  const { open = openInBrowser, onUrl = () => undefined, timeoutMs = 5 * 60 * 1000, device = hostname() } = options;
  const state = randomBytes(24).toString("base64url");

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const token = url.searchParams.get("token");
      if (url.searchParams.get("state") !== state || !token) {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end(m("login_invalid"));
        return;
      }
      res
        .writeHead(200, { "content-type": "text/html; charset=utf-8" })
        .end(`<!doctype html><html lang="${lang()}"><meta charset="utf-8"><title>ShareBox</title><body style="font:17px system-ui;max-width:30rem;margin:4rem auto"><h1>${m("login_done_title")}</h1><p>${m("login_done_body")}</p>`);
      finish(null, token);
    });
    const timer = setTimeout(() => finish(new Error(m("login_timeout"))), timeoutMs);

    function finish(error: Error | null, token?: string): void {
      clearTimeout(timer);
      server.close();
      if (error) reject(error);
      else resolve(token!);
    }

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      const url = `${baseUrl}/auth/cli?${new URLSearchParams({ port: String(port), state, device })}`;
      onUrl(url);
      open(url);
    });
  });
}
