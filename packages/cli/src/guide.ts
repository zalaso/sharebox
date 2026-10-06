// Istruzioni per gli agenti che costruiscono tool per ShareBox.
// Le restituiscono `sharebox guide` e lo strumento MCP sharebox_guide, nella lingua della CLI.
import type { Lang } from "@sharebox/shared";

const GUIDE_IT = `# Come costruire un tool per ShareBox

ShareBox pubblica piccoli tool web e li fa condividere come un documento. Login con Google, permessi, HTTPS e database li fornisce la piattaforma: il tool non deve implementarli.

## Struttura della cartella
\`\`\`
mio-tool/
  sharebox.json   {"name": "Ferie del team"}   ← l'id lo aggiunge la prima pubblicazione: non toglierlo
  public/         HTML, CSS, JS, immagini; public/index.html è la pagina principale
  worker.ts       opzionale: codice lato server, solo se serve davvero
\`\`\`
Preferisci un tool fatto solo di pagine in public/ con le collezioni per i dati: è il caso più semplice e più robusto.
Per partire: strumento sharebox_create_project (oppure \`sharebox init <cartella>\`).

## Chi sta usando il tool
\`\`\`html
<script src="/__sharebox/sdk.js"></script>
<script>
  const io = await sharebox.me();   // { email, name, role: "use" | "manage" }
</script>
\`\`\`
Non chiedere mai nome o email all'utente e non creare schermate di login: l'identità la dà la piattaforma ed è affidabile.
"manage" = chi gestisce il tool (proprietario o co-gestori); "use" = chi lo usa.

## Salvare e leggere dati: collezioni
\`\`\`js
const ferie = sharebox.collection("ferie");
const r = await ferie.add({ dal: "2026-08-01", al: "2026-08-15" });  // → record
const tutte = await ferie.list();
// record: { id, data, owner: { email, name }, createdAt, updatedAt, canEdit }
await ferie.update(r.id, { dal: "2026-08-02", al: "2026-08-15" });  // sostituisce data per intero
await ferie.remove(r.id);
\`\`\`
Regole, applicate dal server:
- tutti quelli che hanno accesso al tool leggono tutti i record della collezione;
- con ruolo "use" si modificano ed eliminano solo i propri record, con "manage" tutti;
- mostra i comandi di modifica ed eliminazione solo se record.canEdit è true;
- il proprietario del record (owner) lo imposta la piattaforma: non salvare email o nome di chi scrive dentro data.
Limiti: data è un oggetto JSON fino a 64 KB; list() restituisce al massimo 1000 record; 100 MB di dati per tool. Filtri, ordinamenti e totali si calcolano nel browser.
Nomi delle collezioni: lettere, cifre, - e _ (massimo 40). Puoi usarne più di una.
Gli errori arrivano come eccezioni: error.message è già nella lingua del browser (mostralo all'utente), error.code è un codice stabile (per esempio "not_yours", "storage_full").

## worker.ts (opzionale)
\`\`\`ts
export default {
  async fetch(request: Request, env: { DB: { query(sql: string, ...params: unknown[]): Promise<Record<string, unknown>[]> } }) {
    const email = request.headers.get("x-sharebox-email");
    const nome = decodeURIComponent(request.headers.get("x-sharebox-name") ?? "");
    const ruolo = request.headers.get("x-sharebox-role");   // "use" | "manage"
    const righe = await env.DB.query("SELECT * FROM mia_tabella WHERE autore = ?", email);
    return Response.json(righe);
  },
};
\`\`\`
- Riceve solo le richieste che non corrispondono a un file in public/.
- env.DB.query usa lo stesso database SQLite del tool: crea le tue tabelle (la tabella sharebox_records è delle collezioni). Le regole delle collezioni qui non valgono: i permessi li controlli tu con x-sharebox-role.
- È un Worker standard (Request, Response, fetch, crypto): niente API di Node, niente file system.

## Cosa non c'è
- Lato server il tool non può raggiungere internet: niente chiamate a servizi esterni dal worker, niente chiavi API o segreti.
- Nel browser invece si possono caricare librerie da CDN (per esempio cdn.jsdelivr.net).
- Niente passaggio di build sulla piattaforma: in public/ vanno file già pronti.
- Nomi dei file in public/: solo lettere, cifre, . _ - (niente spazi né accenti). Massimo 500 file e 25 MB.

## Pubblicare e condividere
- Pubblica con sharebox_publish { folder } (CLI: \`sharebox publish <cartella>\`). Ripubblicare la stessa cartella aggiorna lo stesso tool: indirizzo e dati restano.
- Un tool nuovo è privato: lo vede solo chi lo ha pubblicato.
- Condividi con sharebox_share { tool, with, role }, dove with è "anna@azienda.com", "@azienda.com" (tutti gli account Google Workspace di quel dominio) oppure "anyone" (chiunque abbia il link, sempre con login Google); role è "use" oppure "manage".
- Dopo la pubblicazione comunica all'utente l'indirizzo e con chi è condiviso.

## Prima di pubblicare
- public/index.html esiste e include /__sharebox/sdk.js se usa dati o identità.
- L'interfaccia funziona anche da telefono e mostra stati di caricamento, elenco vuoto ed errori.
- Testi nella lingua dell'utente.
`;

const GUIDE_EN = `# How to build a tool for ShareBox

ShareBox publishes small web tools and lets people share them like a document. Google sign-in, permissions, HTTPS and the database come from the platform: the tool must not implement them.

## Folder layout
\`\`\`
my-tool/
  sharebox.json   {"name": "Team vacations"}   ← the first publish adds the id: don't remove it
  public/         HTML, CSS, JS, images; public/index.html is the main page
  worker.ts       optional: server-side code, only when really needed
\`\`\`
Prefer a tool made only of pages in public/ that keeps its data in collections: it is the simplest and sturdiest option.
To start: the sharebox_create_project tool (or \`sharebox init <folder>\`).

## Who is using the tool
\`\`\`html
<script src="/__sharebox/sdk.js"></script>
<script>
  const me = await sharebox.me();   // { email, name, role: "use" | "manage" }
</script>
\`\`\`
Never ask users for their name or email and never build login screens: the platform provides the identity and it can be trusted.
"manage" = whoever manages the tool (owner or co-managers); "use" = whoever uses it.

## Saving and reading data: collections
\`\`\`js
const vacations = sharebox.collection("vacations");
const r = await vacations.add({ from: "2026-08-01", to: "2026-08-15" });  // → record
const all = await vacations.list();
// record: { id, data, owner: { email, name }, createdAt, updatedAt, canEdit }
await vacations.update(r.id, { from: "2026-08-02", to: "2026-08-15" });  // replaces data entirely
await vacations.remove(r.id);
\`\`\`
Rules, enforced by the server:
- everyone with access to the tool reads every record of the collection;
- with role "use" people change and delete only their own records, with "manage" all of them;
- show edit and delete controls only when record.canEdit is true;
- the platform sets the record's owner: don't store the writer's email or name inside data.
Limits: data is a JSON object up to 64 KB; list() returns at most 1000 records; 100 MB of data per tool. Filter, sort and sum in the browser.
Collection names: letters, digits, - and _ (at most 40). You can use more than one.
Errors arrive as exceptions: error.message is already in the browser's language (show it to the user), error.code is a stable code (for example "not_yours", "storage_full").

## worker.ts (optional)
\`\`\`ts
export default {
  async fetch(request: Request, env: { DB: { query(sql: string, ...params: unknown[]): Promise<Record<string, unknown>[]> } }) {
    const email = request.headers.get("x-sharebox-email");
    const name = decodeURIComponent(request.headers.get("x-sharebox-name") ?? "");
    const role = request.headers.get("x-sharebox-role");   // "use" | "manage"
    const rows = await env.DB.query("SELECT * FROM my_table WHERE author = ?", email);
    return Response.json(rows);
  },
};
\`\`\`
- It only receives requests that don't match a file in public/.
- env.DB.query uses the tool's own SQLite database: create your own tables (the sharebox_records table belongs to collections). Collection rules don't apply here: check permissions yourself with x-sharebox-role.
- It is a standard Worker (Request, Response, fetch, crypto): no Node APIs, no file system.

## What is not available
- Server-side, the tool cannot reach the internet: no calls to external services from the worker, no API keys or secrets.
- In the browser, libraries can be loaded from a CDN (for example cdn.jsdelivr.net).
- No build step on the platform: public/ must contain ready-to-serve files.
- File names in public/: only letters, digits, . _ - (no spaces or accents). At most 500 files and 25 MB.

## Publishing and sharing
- Publish with sharebox_publish { folder } (CLI: \`sharebox publish <folder>\`). Publishing the same folder again updates the same tool: address and data stay.
- A new tool is private: only its publisher can see it.
- Share with sharebox_share { tool, with, role }, where with is "anna@company.com", "@company.com" (every Google Workspace account of that domain) or "anyone" (anyone with the link, still signing in with Google); role is "use" or "manage".
- After publishing, tell the user the address and who it is shared with.

## Before publishing
- public/index.html exists and includes /__sharebox/sdk.js if it uses data or identity.
- The interface works on a phone too and shows loading, empty and error states.
- Texts in the user's language.
`;

export function guide(lang: Lang): string {
  return lang === "it" ? GUIDE_IT : GUIDE_EN;
}

/** Versione breve, inviata al client MCP all'avvio. In inglese: la legge l'agente, che poi risponde nella lingua dell'utente. */
export const MCP_INSTRUCTIONS =
  "ShareBox publishes and shares small web tools, with Google sign-in, permissions and data storage built in. " +
  "Before building a tool for ShareBox call sharebox_guide: it explains the folder layout, the data SDK and the limits. " +
  "To publish use sharebox_publish with the absolute path of the folder; tools start private, share them with sharebox_share.";
