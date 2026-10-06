// File dei tool sul disco del server: <toolsDir>/<id>/v<versione>/…
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { bundleProblem, describeBundleProblem } from "@sharebox/shared";
import { InvalidRequest } from "./spec";

export function versionDir(toolsDir: string, id: string, version: number): string {
  return join(toolsDir, id, `v${version}`);
}

/** Scrive i file di una versione. I percorsi vengono ricontrollati: l'orchestratore non si fida di chi lo chiama. */
export async function writeVersion(toolsDir: string, id: string, version: number, files: ReadonlyMap<string, Uint8Array>): Promise<string> {
  const problem = bundleProblem(files);
  // Messaggio in italiano: arriva alla piattaforma, che rifiuta già prima i file non validi.
  if (problem) throw new InvalidRequest(describeBundleProblem(problem, "it"));

  const root = resolve(versionDir(toolsDir, id, version));
  await rm(root, { recursive: true, force: true });
  for (const [path, content] of files) {
    const target = resolve(root, path);
    if (!target.startsWith(root + sep)) throw new InvalidRequest(`${path}: fuori dalla cartella del tool`);
    await mkdir(dirname(target), { recursive: true, mode: 0o755 });
    // Leggibili dall'utente del container (uid 1000), che però non può modificarli: il montaggio è in sola lettura.
    await writeFile(target, content, { mode: 0o644 });
  }
  // workerd non parte se manca la cartella degli asset (deploy/runtime/config.capnp), anche per i tool fatti solo di worker.
  await mkdir(join(root, "public"), { recursive: true, mode: 0o755 });
  return root;
}

/** Tiene solo le versioni indicate (la corrente e la precedente, per il rollback). */
export async function pruneVersions(toolsDir: string, id: string, keep: readonly number[]): Promise<void> {
  const dir = join(toolsDir, id);
  const wanted = new Set(keep.map((v) => `v${v}`));
  for (const entry of await readdir(dir)) {
    if (/^v\d+$/.test(entry) && !wanted.has(entry)) await rm(join(dir, entry), { recursive: true, force: true });
  }
}

export async function removeToolFiles(toolsDir: string, id: string): Promise<void> {
  await rm(join(toolsDir, id), { recursive: true, force: true });
}
