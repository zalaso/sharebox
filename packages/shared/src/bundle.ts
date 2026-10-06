// Regole sui file di un tool pubblicato. Le applicano sia la piattaforma sia l'orchestratore,
// che scrive i file sul disco del server e quindi non si fida di chi lo chiama.
import type { Lang } from "./i18n";

export const BUNDLE_LIMITS = {
  maxFiles: 500,
  maxBytes: 25 * 1024 * 1024,
  maxPathLength: 200,
} as const;

/** Cartella dei file generati dalla piattaforma dentro ogni tool: i creatori non possono scriverci. */
export const PLATFORM_DIR = "_sharebox";

// Solo caratteri sicuri su qualunque filesystem e in un URL; niente spazi, niente percorsi speciali.
const SEGMENT = /^[A-Za-z0-9._-]+$/;

export type PathProblem = { code: "length" } | { code: "chars"; segment: string } | { code: "relative" };

export type BundleProblem =
  | { code: "empty" }
  | { code: "too_many_files" }
  | { code: "too_big" }
  | { code: "path"; path: string; problem: PathProblem };

/** Perché il percorso non è accettabile, o null se va bene. */
export function pathProblem(path: string): PathProblem | null {
  if (path.length === 0 || path.length > BUNDLE_LIMITS.maxPathLength) return { code: "length" };
  for (const segment of path.split("/")) {
    if (!SEGMENT.test(segment)) return { code: "chars", segment };
    if (segment === "." || segment === "..") return { code: "relative" };
  }
  return null;
}

/** Controlla un insieme di file già decodificati; restituisce il primo problema, o null. */
export function bundleProblem(files: ReadonlyMap<string, Uint8Array>): BundleProblem | null {
  if (files.size === 0) return { code: "empty" };
  if (files.size > BUNDLE_LIMITS.maxFiles) return { code: "too_many_files" };
  let total = 0;
  for (const [path, content] of files) {
    const problem = pathProblem(path);
    if (problem) return { code: "path", path, problem };
    total += content.byteLength;
  }
  if (total > BUNDLE_LIMITS.maxBytes) return { code: "too_big" };
  return null;
}

export function describePathProblem(problem: PathProblem, lang: Lang): string {
  const segment = problem.code === "chars" ? problem.segment || (lang === "it" ? "(vuoto)" : "(empty)") : "";
  switch (problem.code) {
    case "length":
      return lang === "it" ? "lunghezza non valida" : "invalid length";
    case "chars":
      return lang === "it"
        ? `caratteri non ammessi in "${segment}" (solo lettere, cifre, . _ -)`
        : `characters not allowed in "${segment}" (letters, digits, . _ - only)`;
    case "relative":
      return lang === "it" ? "percorso relativo non ammesso" : "relative paths are not allowed";
  }
}

export function describeBundleProblem(problem: BundleProblem, lang: Lang): string {
  const mb = BUNDLE_LIMITS.maxBytes / 1024 / 1024;
  switch (problem.code) {
    case "empty":
      return lang === "it" ? "nessun file" : "no files";
    case "too_many_files":
      return lang === "it" ? `troppi file (massimo ${BUNDLE_LIMITS.maxFiles})` : `too many files (at most ${BUNDLE_LIMITS.maxFiles})`;
    case "too_big":
      return lang === "it" ? `dimensione totale oltre ${mb} MB` : `total size over ${mb} MB`;
    case "path":
      return `${problem.path}: ${describePathProblem(problem.problem, lang)}`;
  }
}
