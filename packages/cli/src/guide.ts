// Istruzioni per gli agenti che costruiscono tool per ShareBox.
// Le restituiscono `sharebox guide` e lo strumento MCP sharebox_guida.

export const GUIDE = `# Come costruire un tool per ShareBox

ShareBox pubblica piccoli tool web e li fa condividere come un documento. Login con Google, permessi, HTTPS e database li fornisce la piattaforma: il tool non deve implementarli.

## Struttura della cartella
\`\`\`
mio-tool/
  sharebox.json   {"name": "Ferie del team"}   ← l'id lo aggiunge la prima pubblicazione: non toglierlo
  public/         HTML, CSS, JS, immagini; public/index.html è la pagina principale
  worker.ts       opzionale: codice lato server, solo se serve davvero
\`\`\`
Preferisci un tool fatto solo di pagine in public/ con le collezioni per i dati: è il caso più semplice e più robusto.
Per partire: strumento sharebox_crea_progetto (oppure \`sharebox init <cartella>\`).

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
Gli errori arrivano come eccezioni con un messaggio in italiano: mostralo all'utente.

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
- Pubblica con sharebox_pubblica { cartella } (CLI: \`sharebox publish <cartella>\`). Ripubblicare la stessa cartella aggiorna lo stesso tool: indirizzo e dati restano.
- Un tool nuovo è privato: lo vede solo chi lo ha pubblicato.
- Condividi con sharebox_condividi { tool, con, ruolo }, dove con è "anna@azienda.com", "@azienda.com" (tutti gli account Google Workspace di quel dominio) oppure "chiunque" (chiunque abbia il link, sempre con login Google); ruolo è "use" oppure "manage".
- Dopo la pubblicazione comunica all'utente l'indirizzo e con chi è condiviso.

## Prima di pubblicare
- public/index.html esiste e include /__sharebox/sdk.js se usa dati o identità.
- L'interfaccia funziona anche da telefono e mostra stati di caricamento, elenco vuoto ed errori.
- Testi nella lingua dell'utente.
`;

/** Versione breve, inviata al client MCP all'avvio. */
export const MCP_INSTRUCTIONS =
  "ShareBox pubblica e condivide piccoli tool web con login Google, permessi e dati già inclusi. " +
  "Prima di costruire un tool per ShareBox chiama sharebox_guida: spiega struttura, SDK per i dati e limiti. " +
  "Per pubblicare usa sharebox_pubblica con il percorso assoluto della cartella; i tool nascono privati, condividili con sharebox_condividi.";
