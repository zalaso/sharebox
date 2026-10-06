const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/** Pagina semplice della piattaforma (errori, accesso negato). `body` deve essere già escapato. */
export function page(status: number, title: string, body: string): Response {
  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — ShareBox</title>
<style>
  :root { --bg: #fbfaf8; --text: #1d1d1b; --muted: #6b6a66; --link: #1f5fbf; }
  @media (prefers-color-scheme: dark) { :root { --bg: #161615; --text: #ecebe8; --muted: #9c9a95; --link: #8ab4f8; } }
  body { margin: 0; background: var(--bg); color: var(--text); font: 17px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 34rem; margin: 0 auto; padding: 4rem 1rem; }
  h1 { font-size: 1.6rem; line-height: 1.25; margin: 0 0 1rem; }
  p { margin: 0 0 1rem; }
  .muted { color: var(--muted); }
  a { color: var(--link); }
  button { font: inherit; padding: .6rem 1.1rem; border: 0; border-radius: 8px; background: var(--link); color: var(--bg); cursor: pointer; }
  code { font-size: .9em; }
</style>
</head>
<body><main><h1>${escapeHtml(title)}</h1>${body}</main></body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
    },
  });
}

export function redirect(location: string, cookies: readonly string[] = []): Response {
  const headers = new Headers({ location, "cache-control": "no-store", "referrer-policy": "no-referrer" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
}

/** Accetta solo percorsi relativi allo stesso sito (`/…`): niente redirect verso altri domini. */
export function safePath(value: string | null, fallback = "/"): string {
  if (!value || value.length > 2000) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
