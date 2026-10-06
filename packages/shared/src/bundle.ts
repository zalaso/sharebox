// Regole sui file di un tool pubblicato. Le applicano sia la piattaforma sia l'orchestratore,
// che scrive i file sul disco del server e quindi non si fida di chi lo chiama.

export const BUNDLE_LIMITS = {
  maxFiles: 500,
  maxBytes: 25 * 1024 * 1024,
  maxPathLength: 200,
} as const;

/** Cartella dei file generati dalla piattaforma dentro ogni tool: i creatori non possono scriverci. */
export const PLATFORM_DIR = "_sharebox";

// Solo caratteri sicuri su qualunque filesystem e in un URL; niente spazi, niente percorsi speciali.
const SEGMENT = /^[A-Za-z0-9._-]+$/;

/** Motivo per cui il percorso non è accettabile, o null se va bene. */
export function pathProblem(path: string): string | null {
  if (path.length === 0 || path.length > BUNDLE_LIMITS.maxPathLength) return "lunghezza non valida";
  const segments = path.split("/");
  for (const segment of segments) {
    if (!SEGMENT.test(segment)) return `caratteri non ammessi in "${segment || "(vuoto)"}"`;
    if (segment === "." || segment === "..") return "percorso relativo non ammesso";
  }
  return null;
}

/** Controlla un insieme di file già decodificati; restituisce il primo problema, o null. */
export function bundleProblem(files: ReadonlyMap<string, Uint8Array>): string | null {
  if (files.size === 0) return "nessun file";
  if (files.size > BUNDLE_LIMITS.maxFiles) return `troppi file (massimo ${BUNDLE_LIMITS.maxFiles})`;
  let total = 0;
  for (const [path, content] of files) {
    const problem = pathProblem(path);
    if (problem) return `${path}: ${problem}`;
    total += content.byteLength;
  }
  if (total > BUNDLE_LIMITS.maxBytes) return `dimensione totale oltre ${BUNDLE_LIMITS.maxBytes / 1024 / 1024} MB`;
  return null;
}
