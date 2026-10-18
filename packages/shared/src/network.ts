// Domini che un tool può raggiungere (ADR 0009): dal suo worker, attraverso il proxy della piattaforma,
// e dal browser, attraverso la Content-Security-Policy. Si dichiarano in sharebox.json:
//   { "network": { "allow": ["api.openweathermap.org", "*.example.com"] } }
// Senza dichiarazioni il tool non raggiunge niente fuori da se stesso.

export const NETWORK_LIMITS = { maxHosts: 20, maxHostLength: 253 } as const;

// Un nome DNS con almeno un punto; ammesso un "*." iniziale per i sottodomini. Niente IP, porte o percorsi.
const HOST = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

export type NetworkProblem = { code: "not_list" } | { code: "too_many" } | { code: "invalid_host"; host: string };

/** Normalizza la lista dei domini permessi; restituisce un problema se non è accettabile. */
export function parseNetworkAllow(value: unknown): { allow: string[] } | { problem: NetworkProblem } {
  if (value === undefined || value === null) return { allow: [] };
  if (!Array.isArray(value)) return { problem: { code: "not_list" } };
  if (value.length > NETWORK_LIMITS.maxHosts) return { problem: { code: "too_many" } };
  const allow: string[] = [];
  for (const entry of value) {
    const host = typeof entry === "string" ? entry.trim().toLowerCase() : "";
    if (!host || host.length > NETWORK_LIMITS.maxHostLength || !HOST.test(host)) {
      return { problem: { code: "invalid_host", host: typeof entry === "string" ? entry : JSON.stringify(entry) } };
    }
    if (!allow.includes(host)) allow.push(host);
  }
  return { allow };
}

/** Il nome host rientra nella lista? `*.example.com` copre i sottodomini, non `example.com` stesso. */
export function hostAllowed(host: string, allow: readonly string[]): boolean {
  const name = host.toLowerCase().replace(/\.$/, "");
  return allow.some((entry) => (entry.startsWith("*.") ? name.endsWith(entry.slice(1)) && name.length > entry.length - 1 : name === entry));
}

export function describeNetworkProblem(problem: NetworkProblem, lang: "it" | "en"): string {
  switch (problem.code) {
    case "not_list":
      return lang === "it" ? "network.allow deve essere un elenco di domini" : "network.allow must be a list of domains";
    case "too_many":
      return lang === "it"
        ? `network.allow: al massimo ${NETWORK_LIMITS.maxHosts} domini`
        : `network.allow: at most ${NETWORK_LIMITS.maxHosts} domains`;
    case "invalid_host":
      return lang === "it"
        ? `network.allow: "${problem.host}" non è un dominio valido (es. api.example.com o *.example.com, senza https:// né percorsi)`
        : `network.allow: "${problem.host}" is not a valid domain (e.g. api.example.com or *.example.com, no https:// or paths)`;
  }
}
