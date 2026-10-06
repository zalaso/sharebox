// Un'etichetta DNS valida: niente punti, quindi un solo livello sotto il dominio dei tool.
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Ricava lo slug del tool dall'host (`ferie-k3x9.sbxapps.dev` → `ferie-k3x9`), o null se l'host non è un tool. */
export function toolSlugFromHost(hostname: string, toolsDomain: string): string | null {
  const host = hostname.toLowerCase();
  const suffix = "." + toolsDomain.toLowerCase();
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  return SLUG.test(slug) ? slug : null;
}
