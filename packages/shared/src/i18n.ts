// Lingue dell'interfaccia. L'italiano è la lingua del progetto; l'inglese quella predefinita per chiunque altro.

export type Lang = "it" | "en";

/**
 * Lingua da un header Accept-Language ("it-IT,it;q=0.9,en;q=0.8") o da un locale ("it_IT.UTF-8", "en-US"):
 * la prima lingua supportata nell'ordine di preferenza, altrimenti inglese.
 */
export function pickLang(preference: string | null | undefined): Lang {
  if (!preference) return "en";
  const ranked = preference
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag: tag.toLowerCase(), q: q ? Number(q.slice(2)) : 1, index };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of ranked) {
    const base = tag.split(/[-_.]/)[0];
    if (base === "it" || base === "en") return base;
  }
  return "en";
}

/** Sostituisce {nome} con i parametri. */
export function format(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}
