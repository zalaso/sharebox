// `sharebox init` / sharebox_crea_progetto: cartella di partenza per un tool nuovo.
import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Lang } from "@sharebox/shared";
import { lang, m } from "./i18n";
import { ProjectError, writeManifest } from "./project";

// Testi della pagina di esempio, nella lingua di chi crea il tool.
const EXAMPLE: Record<Lang, { placeholder: string; add: string; remove: string; hello: string; comment: string }> = {
  it: { placeholder: "Nuova voce", add: "Aggiungi", remove: "Elimina", hello: "Ciao ", comment: "Esempio da sostituire: una lista condivisa. Guida completa: sharebox guide." },
  en: { placeholder: "New item", add: "Add", remove: "Delete", hello: "Hi ", comment: "Example to replace: a shared list. Full guide: sharebox guide." },
};

export async function initProject(dir: string, name: string): Promise<string> {
  const folder = resolve(dir);
  if (existsSync(folder) && (await readdir(folder)).length > 0) {
    throw new ProjectError(m("folder_not_empty", { folder }));
  }
  await mkdir(join(folder, "public"), { recursive: true });
  await writeManifest(folder, { name });
  await writeFile(join(folder, "public", "index.html"), indexHtml(name, lang()));
  return folder;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function indexHtml(name: string, language: Lang): string {
  const text = EXAMPLE[language];
  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(name)}</title>
  <style>
    :root { --bg: #fbfaf8; --card: #fff; --text: #1d1d1b; --muted: #6b6a66; --line: #e4e2dd; --accent: #1f5fbf; }
    @media (prefers-color-scheme: dark) { :root { --bg: #161615; --card: #201f1d; --text: #ecebe8; --muted: #9c9a95; --line: #33312e; --accent: #8ab4f8; } }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
    main { max-width: 40rem; margin: 0 auto; padding: 2.5rem 1rem; }
    .muted { color: var(--muted); }
    form { display: flex; gap: .5rem; margin: 1.5rem 0; }
    input { flex: 1; padding: .6rem .75rem; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--text); font: inherit; }
    button { padding: .6rem .9rem; border: 0; border-radius: 8px; background: var(--accent); color: #fff; font: inherit; cursor: pointer; }
    ul { list-style: none; padding: 0; }
    li { display: flex; justify-content: space-between; gap: 1rem; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: .75rem 1rem; margin-bottom: .5rem; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(name)}</h1>
    <p class="muted" id="chi">…</p>
    <form id="nuova">
      <input id="testo" required placeholder="${text.placeholder}" autocomplete="off">
      <button>${text.add}</button>
    </form>
    <ul id="voci"></ul>
  </main>
  <script src="/__sharebox/sdk.js"></script>
  <script>
    // ${text.comment}
    const voci = sharebox.collection("voci");

    async function mostra() {
      const lista = document.getElementById("voci");
      lista.replaceChildren();
      for (const r of await voci.list()) {
        const li = document.createElement("li");
        li.textContent = r.data.testo + " — " + (r.owner.name || r.owner.email);
        if (r.canEdit) {
          const elimina = document.createElement("button");
          elimina.textContent = ${JSON.stringify(text.remove)};
          elimina.onclick = () => voci.remove(r.id).then(mostra, (e) => alert(e.message));
          li.append(elimina);
        }
        lista.append(li);
      }
    }

    document.getElementById("nuova").addEventListener("submit", async (event) => {
      event.preventDefault();
      const campo = document.getElementById("testo");
      try {
        await voci.add({ testo: campo.value });
        campo.value = "";
        await mostra();
      } catch (e) { alert(e.message); }
    });

    sharebox.me().then((io) => { document.getElementById("chi").textContent = ${JSON.stringify(text.hello)} + (io.name || io.email); });
    mostra().catch((e) => alert(e.message));
  </script>
</body>
</html>
`;
}
