// Contratto tra gateway, runtime e codice dei tool. Vedi docs/architettura.md.

export {
  BUNDLE_LIMITS,
  PLATFORM_DIR,
  bundleProblem,
  describeBundleProblem,
  describePathProblem,
  pathProblem,
  type BundleProblem,
  type PathProblem,
} from "./bundle";
export { format, pickLang, type Lang } from "./i18n";

/** Header con cui il gateway comunica al tool chi lo sta usando. */
export const IDENTITY_HEADERS = {
  email: "x-sharebox-email",
  /** Percent-encoded: gli header non accettano UTF-8. */
  name: "x-sharebox-name",
  /** Ruolo del visitatore su questo tool: `use` o `manage`. */
  role: "x-sharebox-role",
} as const;

/** Nessun header con questo prefisso arriva al tool dal client. */
export const RESERVED_HEADER_PREFIX = "x-sharebox-";

/** Rotte servite dal runtime della piattaforma dentro ogni tool. */
export const RESERVED_PATH_PREFIX = "/__sharebox/";

/** Cookie di sessione del visitatore, valido solo per l'host del tool (ADR 0002). */
export const SESSION_COOKIE = "__Host-sharebox";

export type Role = "use" | "manage";

export type Principal =
  | { type: "user"; email: string }
  | { type: "domain"; domain: string }
  | { type: "anyone" };

export interface Grant {
  toolId: string;
  principal: Principal;
  role: Role;
}

export interface Identity {
  email: string;
  name: string;
  /** Claim `hd` di Google: presente solo per account Workspace. Base dei grant di dominio. */
  hostedDomain?: string;
}

/** Contenuto di `sharebox.json` nella cartella del tool. */
export interface ToolManifest {
  /** Assegnato al primo publish; ripubblicare con lo stesso id aggiorna lo stesso tool. */
  id?: string;
  name: string;
}
