// La cartella di un tool sul disco del creatore:
//   sharebox.json   { "name": "…", "id": "…" }   (id scritto dal primo publish)
//   public/          file statici
//   worker.ts|js     codice server opzionale, impacchettato con esbuild
import { existsSync } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { BUNDLE_LIMITS, pathProblem } from "@sharebox/shared";

export const MANIFEST = "sharebox.json";
const WORKER_ENTRIES = ["worker.ts", "worker.js", "worker.mjs", "src/worker.ts", "src/worker.js"];

export interface Manifest {
  name?: string;
  id?: string;
}

export class ProjectError extends Error {}

export async function readManifest(dir: string): Promise<Manifest> {
  const file = join(dir, MANIFEST);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(await readFile(file, "utf8")) as Manifest;
  } catch {
    throw new ProjectError(`${file} non è un JSON valido`);
  }
}

export async function writeManifest(dir: string, manifest: Manifest): Promise<void> {
  await writeFile(join(dir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
}

export interface PublicFiles {
  /** percorso relativo a public/ → contenuto in base64 */
  files: Record<string, string>;
  count: number;
  bytes: number;
}

/** Legge public/, saltando file nascosti e node_modules. */
export async function collectPublic(dir: string): Promise<PublicFiles> {
  const root = join(dir, "public");
  const result: PublicFiles = { files: {}, count: 0, bytes: 0 };
  if (!existsSync(root)) return result;

  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      const path = relative(root, full).split(sep).join("/");
      const problem = pathProblem(path);
      if (problem) throw new ProjectError(`public/${path}: ${problem}. Rinomina il file (lettere, cifre, . _ -).`);
      const content = await readFile(full);
      result.files[path] = content.toString("base64");
      result.count += 1;
      result.bytes += content.byteLength;
      if (result.count > BUNDLE_LIMITS.maxFiles) throw new ProjectError(`Troppi file in public/ (massimo ${BUNDLE_LIMITS.maxFiles})`);
      if (result.bytes > BUNDLE_LIMITS.maxBytes) throw new ProjectError(`public/ supera ${BUNDLE_LIMITS.maxBytes / 1024 / 1024} MB`);
    }
  }
  if (!(await stat(root)).isDirectory()) throw new ProjectError(`${root} non è una cartella`);
  await walk(root);
  return result;
}

export function findWorker(dir: string): string | null {
  return WORKER_ENTRIES.map((entry) => join(dir, entry)).find((path) => existsSync(path)) ?? null;
}

/** Impacchetta il worker (TypeScript o JavaScript, con i suoi import) in un solo modulo ES per workerd. */
export async function bundleWorker(entry: string): Promise<string> {
  const esbuild = await import("esbuild");
  try {
    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: "esm",
      platform: "neutral",
      target: "es2022",
      conditions: ["workerd", "worker", "browser"],
      mainFields: ["module", "main"],
      external: ["cloudflare:*"],
      logLevel: "silent",
    });
    return Buffer.from(result.outputFiles[0]!.contents).toString("base64");
  } catch (error) {
    const messages = (error as { errors?: { text: string; location?: { file: string; line: number } }[] }).errors;
    const detail = messages?.map((m) => (m.location ? `${m.location.file}:${m.location.line} ${m.text}` : m.text)).join("\n");
    throw new ProjectError(`Il worker non si compila:\n${detail ?? String(error)}`);
  }
}
