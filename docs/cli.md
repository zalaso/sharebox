# CLI e server MCP

Un solo comando, `sharebox`, per le persone (terminale) e per gli agenti (server MCP). Sorgenti in `packages/cli`.

## Installazione
Ogni istanza distribuisce la propria CLI (serve Node 20 o più recente):

```bash
npm install -g https://<istanza>/cli/sharebox.tgz
```

La dashboard mostra il comando con l'indirizzo già completo (sezione *Come collegare un computer o un agente*). Per aggiornare la CLI basta ripetere il comando.

Per lo sviluppo, dalla cartella del repository: `npm install && npm run build:cli && npm install -g ./packages/cli` (il comando punta ai file del repository: dopo ogni `npm run build:cli` è già aggiornato).

## Collegare il computer
```bash
sharebox login sharebox.tuodominio.it
```
Indica l'indirizzo della tua ShareBox: ogni installazione è indipendente. Si apre il browser: login con Google (se serve), poi **Autorizza**. La CLI riceve un token personale e lo salva, con l'indirizzo, in `~/.sharebox/credentials.json`; i login successivi ricordano l'indirizzo. `sharebox logout` revoca il token e lo cancella. In alternativa si possono usare le variabili `SHAREBOX_URL` e `SHAREBOX_TOKEN` (utile su un server o in CI).

## Comandi
| Comando | Cosa fa |
|---|---|
| `sharebox init <cartella> [--name "Nome"]` | Cartella di partenza: `sharebox.json` e `public/index.html` con un esempio che usa l'SDK |
| `sharebox publish [cartella] [--name "Nome"]` | Prima volta: crea il tool e scrive l'id in `sharebox.json`. Poi: nuova versione dello stesso tool, stesso indirizzo, dati conservati |
| `sharebox list` | Tool che puoi gestire |
| `sharebox info <tool>` | Indirizzo, versione, condivisioni |
| `sharebox share <tool> <con> [--role use\|manage]` | `con`: un'email, `@dominio.it` oppure `chiunque` |
| `sharebox unshare <tool> <con>` | Toglie una condivisione |
| `sharebox delete <tool> --yes` | Elimina tool e dati; senza `--yes` chiede conferma |
| `sharebox guide` | Istruzioni per costruire un tool (pensate per gli agenti) |

`<tool>` può essere la cartella, l'id, l'indirizzo o il nome. `--json` dà l'output in JSON.

## Cartella di un tool
```
mio-tool/
  sharebox.json   {"name": "…", "id": "…"}    ← l'id lo scrive il primo publish: va conservato
  public/         file statici
  worker.ts       opzionale (anche worker.js, src/worker.ts): impacchettato con esbuild, import compresi
```
File nascosti e `node_modules` in `public/` vengono ignorati. Nomi dei file: lettere, cifre, `.`, `_`, `-`.

## Server MCP per gli agenti
`sharebox mcp` parla MCP su stdio e usa lo stesso login della CLI. Per Claude Code (su Windows: `-- cmd /c sharebox mcp`, perché i comandi installati con npm sono script `.cmd`):

```bash
claude mcp add --scope user sharebox -- sharebox mcp
```

Strumenti: `sharebox_guida`, `sharebox_crea_progetto`, `sharebox_pubblica`, `sharebox_elenco`, `sharebox_dettagli`, `sharebox_condividi`, `sharebox_revoca`. Non c'è uno strumento per eliminare: cancella i dati, quindi resta solo nella CLI con conferma. Le azioni fatte via MCP finiscono nel registro delle attività con canale `mcp`.
