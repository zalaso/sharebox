# ShareBox — Architettura

Documento di riferimento. Le decisioni con alternative scartate sono negli ADR in `docs/adr/`.

## Decisioni di base

| Decisione | Scelta | ADR |
|---|---|---|
| Dove girano i tool | Server netcup: un container gVisor + workerd per tool | [0005](adr/0005-server-netcup-container-gvisor.md) |
| Domini | Piattaforma su `sharebox.getceng.it`, tool su `guido-sbx.duckdns.org` | [0002](adr/0002-domini-separati.md) |
| Chi pubblica | Solo creatori invitati; visitatori con qualunque account Google autorizzato | [0006](adr/0006-piattaforma-privata.md) |
| Codice server | `worker.ts` supportato già nell'MVP | [0004](adr/0004-worker-ts-nell-mvp.md) |
| Processi | Gateway e API in un solo processo `platform` con SQLite | [0007](adr/0007-processo-unico-platform.md) |
| Container dei tool | Li crea solo l'orchestratore, con specifica fissa e sicura | [0008](adr/0008-orchestratore.md) |
| Costo | Nessuno oltre al server già pagato | |

Nomi usati qui: `sharebox.getceng.it` = piattaforma · `guido-sbx.duckdns.org` = tool.

Server: netcup VPS nano, 2 vCPU, 2 GB di RAM, Ubuntu 24.04, Docker. Ospita anche un'app personale (raggiungibile solo via Tailscale).

## Componenti

```
Internet
   │ :443
   ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Caddy — HTTPS; certificato wildcard *.guido-sbx.duckdns.org (DNS-01) │
│   sharebox.getceng.it  → api                                         │
│   *.guido-sbx.duckdns.org → gateway                                  │
│   solo sull'IP pubblico; l'app personale resta su Tailscale          │
└───────┬───────────────────────────────┬──────────────────────────────┘
        ▼                               ▼
┌──────────────────────┐   ACL,  ┌──────────────────────────────┐
│ api + dashboard      │◄────────│ gateway                      │
│ login Google, tool,  │ sessioni│ 1. host → tool               │
│ deploy, grant, token,│         │ 2. sessione? no → login      │
│ audit · SQLite       │         │ 3. permesso? no → 403        │
└───────┬──────────────┘         │ 4. sospeso? → 503            │
        │ proxy socket Docker    │ 5. blocca richieste          │
        ▼                        │    cross-site che modificano │
   Docker (runsc)                │ 6. pulisce header/cookie,    │
                                 │    inietta identità          │
                                 └──────────────┬───────────────┘
                                                ▼  una rete interna per tool
┌──────────────────────────────────────────────────────────────────────┐
│ tool A: container gVisor · workerd · asset · SQLite su volume proprio│
│ tool B: container gVisor · workerd · asset · SQLite su volume proprio│
│ limiti CPU / RAM / processi per container                           │
└──────────────────────────────────────────────────────────────────────┘
```

| Pacchetto | Ruolo |
|---|---|
| `packages/shared` | Tipi e costanti condivise (ruoli, header riservati, manifest) |
| `packages/gateway` | Proxy davanti ai tool: instradamento, identità, pulizia di header e cookie |
| `packages/platform` | Processo unico: login Google, sessioni, permessi, gateway, API e dashboard su `/app` (ADR 0007). Anteprima locale della dashboard con dati finti: `npm run dev:dashboard` |
| `packages/runtime` | Modulo d'ingresso di ogni tool, eseguito da workerd: asset, `/__sharebox/*`, worker del creatore |
| `packages/orchestrator` | Unico processo con accesso a Docker: crea, aggiorna ed elimina i container dei tool (ADR 0008) |
| `packages/cli` | Comando `sharebox` per persone e agenti: login dal browser, init, publish, share; `sharebox mcp` è il server MCP (docs/cli.md) |
| `deploy/` | Docker Compose, Caddyfile, immagini, script di verifica per il server |

## Login e identità

1. Il visitatore apre `ferie-k3x9.guido-sbx.duckdns.org`; il gateway non trova sessione e reindirizza a `sharebox.getceng.it/login?tool=…`.
2. Login Google (OIDC, scope `openid email profile`). La sessione su `sharebox.getceng.it` dà il single sign-on tra tool.
3. La piattaforma torna al tool con un **codice monouso** a scadenza breve; il gateway lo scambia con l'API e imposta il cookie `__Host-sharebox` (`HttpOnly`, `Secure`, `SameSite=Lax`, valido solo per quell'host).
4. Prima di inoltrare al container il gateway:
   - rifiuta le richieste che modificano dati se `Sec-Fetch-Site` non è `same-origin` o `none` (i tool sono "stesso sito" tra loro);
   - elimina ogni header `x-sharebox-*` arrivato dal client;
   - toglie il cookie di sessione dall'header `Cookie`;
   - imposta `x-sharebox-email` e `x-sharebox-name` (nome percent-encoded).

I container stanno su una rete interna raggiungibile solo dal gateway: gli header di identità sono affidabili.

## Permessi

- `grants(tool_id, tipo: user|domain|anyone, valore, ruolo: use|manage)`; il proprietario è sempre `manage`; con più grant vince il ruolo più alto.
- Grant di dominio: si confronta il claim **`hd`** dell'ID token Google (solo account Workspace), non il suffisso dell'email.
- "Chiunque abbia il link" richiede comunque il login.
- ACL letta dal database a ogni richiesta, senza cache: la revoca è immediata.
- `manage` permette di ripubblicare e cambiare la condivisione, anche via CLI/MCP con il proprio token.
- Pubblicare un nuovo tool richiede di essere nella lista dei creatori.

## Formato di un tool

```
ferie-team/
  sharebox.json   { "name": "Ferie team" }   ← dopo il primo publish contiene anche "id"
  public/         asset statici
  worker.ts       opzionale
```

- La CLI impacchetta `worker.ts` con esbuild e carica modulo + asset.
- Il container del tool esegue workerd con un modulo d'ingresso generato: `/__sharebox/*` va al codice della piattaforma, il resto agli asset e poi all'handler `fetch` del creatore.
- Il formato è quello dei Worker Cloudflare: gli stessi tool girerebbero su Workers for Platforms senza modifiche.
- Il servizio `disk` di workerd risponde sempre `application/octet-stream`: il runtime deve impostare `content-type` in base all'estensione, altrimenti il browser scarica le pagine invece di mostrarle. Deve anche mandare `cache-control: no-cache`: con il solo `last-modified` il browser tiene in cache le pagine e non vede i nuovi deploy.
- Ripubblicare sostituisce codice e asset nel container; il volume dati resta.

## Dati

- Ogni tool ha un database SQLite (Durable Object SQLite di workerd) sul proprio volume, montato solo nel suo container.
- **Collezioni** (per i tool statici), in `packages/runtime/src/collections.ts`:
  - SDK: `<script src="/__sharebox/sdk.js">`, poi `sharebox.me()` e `sharebox.collection('ferie').list/add/update/remove()`;
  - API sottostante: `GET|POST /__sharebox/api/collections/<nome>`, `PATCH|DELETE /__sharebox/api/collections/<nome>/<id>`;
  - ogni record ha proprietario (email e nome) scritto lato server dagli header del gateway; tutti quelli che hanno accesso leggono tutto; `use` modifica ed elimina solo i propri record, `manage` tutti; ogni record riporta `canEdit` per l'interfaccia;
  - limiti: 64 KB per record, 1000 record per elenco, 100 MB di database per tool (poi si può solo eliminare).
- Tool con `worker.ts`: `env.DB.query(sql, ...parametri)` sullo stesso database, senza le regole delle collezioni (è il codice del creatore). Segreti in Fase 2.
- Eliminare un tool elimina container, volume e file.
- Backup: snapshot netcup + copia giornaliera dei volumi SQLite fuori dal server.

## Limiti

| Limite | Dove | Valore iniziale (da tarare sul server) |
|---|---|---|
| CPU per tool | Docker `--cpus` | 0,25 |
| Memoria per tool | Docker `--memory` | 128 MB |
| Processi per tool | Docker `--pids-limit` | 64 |
| Spazio dati per tool | `PRAGMA max_page_count` sul database | 100 MB |
| Richieste per tool | rate limit nel gateway | da definire con i primi dati |
| Tool per creatore | API | 20 |

Superare memoria o spazio blocca solo quel tool; il gateway risponde 503 e l'errore finisce nei log del creatore.

## Modello dati della piattaforma (SQLite)

`users` (con flag creatore) · `tools` (id, slug, proprietario, stato, versione corrente) · `deployments` · `grants` · `api_tokens` (hash, scope, revocabili) · `secrets` (cifrati con una chiave fuori dal database) · `audit_events` (solo aggiunta: attore, canale web/CLI/MCP, azione, oggetto, prima/dopo) · `tool_errors`.

## Fasi

| Fase | Contenuto | Criterio di uscita |
|---|---|---|
| 0 — Fondamenta | DuckDNS, record DNS, client OAuth Google, monorepo, spike sul server | Spike superato il 2026-09-26 (`docs/spike-fase0.md`) |
| 1 — MVP | Gateway con login, ACL e timeout verso i tool, API, runtime + collections, `worker.ts`, CLI, MCP, skill per l'agente, dashboard minima, audit log, limiti, backup | Test E2E della demo: publish da agente, condivisione a `@azienda.com`, accesso e salvataggio da un secondo account, dati intatti dopo il redeploy, 403 per esterni e subito dopo la revoca |
| 2 — Creatore | Spegnimento dei tool inattivi (2 GB di RAM), segreti e accesso a internet tramite proxy, errori e log, dati ed export in dashboard, vista audit, versioni e rollback | |
| 3 — Sicurezza | CSP, scope dei token, sessioni attive, pentest sul proprio server | |
| 4 — Crescita | MCP remoto con OAuth, template | |
