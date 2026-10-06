// Credenziali della CLI: a quale ShareBox è collegato questo computer e con quale token.
// Ogni istanza è indipendente (chiunque può installarne una): l'indirizzo si sceglie a `sharebox login`.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Credentials {
  url: string | null;
  token: string | null;
}

function credentialsFile(env: NodeJS.ProcessEnv): string {
  return join(env.SHAREBOX_HOME ?? join(homedir(), ".sharebox"), "credentials.json");
}

/** "sharebox.example.com" → "https://sharebox.example.com", senza barra finale. */
export function normalizeUrl(input: string): string {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(withScheme);
  return url.origin;
}

/** SHAREBOX_URL e SHAREBOX_TOKEN hanno la precedenza su quanto salvato da `sharebox login`. */
export async function loadCredentials(env: NodeJS.ProcessEnv = process.env): Promise<Credentials> {
  let saved: Partial<Credentials> = {};
  try {
    saved = JSON.parse(await readFile(credentialsFile(env), "utf8")) as Partial<Credentials>;
  } catch {
    // Nessun login ancora.
  }
  const url = env.SHAREBOX_URL ?? saved.url ?? null;
  return { url: url ? normalizeUrl(url) : null, token: env.SHAREBOX_TOKEN ?? saved.token ?? null };
}

export async function saveCredentials(credentials: { url: string; token: string }, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const file = credentialsFile(env);
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
  return file;
}

export async function clearCredentials(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await rm(credentialsFile(env), { force: true });
}
