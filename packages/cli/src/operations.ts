// Operazioni condivise da CLI e server MCP.
import { existsSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { ShareboxError, type Grant, type Role, type ShareboxClient, type ToolInfo } from "./client";
import { m } from "./i18n";
import { ProjectError, bundleWorker, collectPublic, findWorker, readManifest, writeManifest } from "./project";

export interface PublishResult {
  tool: ToolInfo;
  created: boolean;
  files: number;
  bytes: number;
  worker: boolean;
}

/** Pubblica la cartella: al primo publish crea il tool e scrive l'id in sharebox.json; poi aggiorna sempre lo stesso tool. */
export async function publish(client: ShareboxClient, dir: string, options: { name?: string } = {}): Promise<PublishResult> {
  const folder = resolve(dir);
  if (!existsSync(folder) || !statSync(folder).isDirectory()) throw new ProjectError(m("folder_not_found", { folder }));
  const manifest = await readManifest(folder);
  const workerEntry = findWorker(folder);
  const publicFiles = await collectPublic(folder);
  if (publicFiles.count === 0 && !workerEntry) {
    throw new ProjectError(m("nothing_to_publish", { folder }));
  }
  const worker = workerEntry ? await bundleWorker(workerEntry) : undefined;

  let id = manifest.id;
  let created = false;
  if (!id) {
    const name = options.name ?? manifest.name ?? basename(folder);
    id = (await client.createTool(name)).id;
    // Scritto subito: se la pubblicazione fallisce, il tentativo successivo riusa lo stesso tool.
    await writeManifest(folder, { ...manifest, name, id });
    created = true;
  }
  let tool: ToolInfo;
  try {
    tool = await client.deploy(id, publicFiles.files, worker);
  } catch (error) {
    // Tipico con una cartella copiata da un'altra istanza o con un tool eliminato: l'id non esiste qui.
    if (!created && error instanceof ShareboxError && error.status === 404) {
      throw new ProjectError(m("id_not_here", { id, file: join(folder, "sharebox.json") }));
    }
    throw error;
  }
  return { tool, created, files: publicFiles.count, bytes: publicFiles.bytes, worker: Boolean(worker) };
}

/** Un tool indicato come cartella (con sharebox.json), id, indirizzo, slug o nome. */
export async function resolveTool(client: ShareboxClient, ref: string): Promise<string> {
  const folder = resolve(ref);
  if (existsSync(folder) && statSync(folder).isDirectory()) {
    const { id } = await readManifest(folder);
    if (!id) throw new ProjectError(m("not_published_yet", { folder }));
    return id;
  }
  if (/^[a-z0-9]{12}$/.test(ref)) return ref;
  const wanted = ref.replace(/^https?:\/\//, "").split(".")[0]!.toLowerCase();
  const matches = (await client.listTools()).filter((t) => t.slug === wanted || t.name.toLowerCase() === ref.toLowerCase());
  if (matches.length === 1) return matches[0]!.id;
  if (matches.length > 1) throw new ProjectError(m("ambiguous", { ref }));
  throw new ProjectError(m("tool_not_found", { ref }));
}

/** "anna@azienda.com" → persona, "@azienda.com" → dominio, "chiunque"/"anyone" → chiunque abbia il link. */
export function parseTarget(target: string): Omit<Grant, "role"> {
  const value = target.trim().toLowerCase();
  if (["chiunque", "anyone", "everyone", "link", "tutti"].includes(value)) return { type: "anyone" };
  if (value.startsWith("@")) return { type: "domain", value: value.slice(1) };
  if (value.includes("@")) return { type: "user", value };
  throw new ProjectError(m("bad_target", { target }));
}

export function parseRole(role: string | undefined): Role {
  if (role === undefined || ["use", "usa", "uso"].includes(role)) return "use";
  if (["manage", "gestisci", "gestione"].includes(role)) return "manage";
  throw new ProjectError(m("bad_role", { role }));
}

export function describeGrant(grant: Pick<Grant, "type" | "value">): string {
  if (grant.type === "anyone") return m("grant_anyone");
  return grant.type === "domain" ? m("grant_domain", { domain: grant.value! }) : grant.value!;
}

export function describeRole(role: Role): string {
  return m(role === "manage" ? "role_manage" : "role_use");
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
