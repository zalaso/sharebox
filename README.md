# ShareBox

Pubblica e condividi piccoli tool web creati con agenti AI, semplice come condividere un documento.

> **In English:** ShareBox lets you (or your AI agent) publish small web tools with one command and share them like a Google Doc — specific people, a whole Google Workspace domain, or anyone with the link. Google sign-in, permissions, HTTPS and per-tool storage are built in; each tool runs isolated in its own gVisor sandbox. Self-hosted on a single small server. Docs are in Italian.

## Cosa fa
- **Un comando per pubblicare**, da terminale (`sharebox publish`) o da un agente AI tramite il server MCP incluso. Ogni tool riceve un indirizzo HTTPS proprio; ripubblicare aggiorna lo stesso tool mantenendo indirizzo e dati.
- **Privato per impostazione predefinita.** Si condivide con persone (email), con tutti gli account Google Workspace di un dominio o con chiunque abbia il link, con ruolo "può usare" o "può gestire". Le revoche valgono dalla richiesta successiva.
- **Login con Google gestito dalla piattaforma**: il tool non implementa nessun login e riceve in modo affidabile nome, email e ruolo di chi lo usa.
- **Dati inclusi**: ogni tool ha il suo database SQLite. Le pagine statiche usano un piccolo SDK (`sharebox.collection("ferie").add(...)`) con permessi applicati lato server; i tool con codice server (`worker.ts`) hanno accesso SQL diretto.
- **Isolamento**: ogni tool gira nel proprio container gVisor con workerd, rete propria, file in sola lettura e limiti di CPU, memoria e processi. Un solo processo, separato, può comandare Docker.
- **Dashboard web** per condivisione, stato, log, attività, sospensione ed eliminazione; **backup** giornalieri, anche cifrati su Google Drive.

## Come funziona
```
Internet → Caddy (HTTPS) → platform: login Google, permessi, API, dashboard, gateway dei tool
                                │                     │
                                │ rete interna        │ una rete interna per tool
                                ▼                     ▼
                          orchestrator          container gVisor + workerd (uno per tool)
                          (unico con Docker)    asset, SDK, worker del creatore, SQLite
```
Architettura completa e motivazioni: [docs/architettura.md](docs/architettura.md) e le decisioni in [docs/adr/](docs/adr/).

## Stato
Progetto giovane, in uso su un'istanza privata dell'autore. La Fase 1 (MVP) è quasi completa: pubblicazione, condivisione, dati, CLI, MCP, dashboard e backup funzionano. Mancano, tra l'altro: spegnimento dei tool inattivi, segreti e accesso a internet per i tool, registrazione aperta. Piano in [docs/architettura.md](docs/architettura.md#fasi).

## Struttura
| Cartella | Contenuto |
|---|---|
| `packages/platform` | Processo principale: login Google, sessioni, permessi, API, dashboard (`dashboard/`), gateway |
| `packages/gateway` | Inoltro delle richieste ai tool, pulizia di header e cookie, identità |
| `packages/orchestrator` | Unico processo con accesso a Docker: crea, aggiorna, ferma ed elimina i container dei tool |
| `packages/runtime` | Codice aggiunto a ogni tool: asset, SDK e collezioni, worker del creatore |
| `packages/cli` | Comando `sharebox` e server MCP ([docs/cli.md](docs/cli.md)) |
| `packages/shared` | Tipi e regole comuni |
| `deploy/` | Docker Compose, Caddy, immagini, backup, script di verifica ([deploy/README.md](deploy/README.md)) |
| `examples/` | Tool di esempio |

## Sviluppo
Serve Node 24.

```bash
npm install
```

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run build
```

Anteprima della dashboard con dati finti, senza server né account Google:

```bash
npm run dev:dashboard
```

## La tua ShareBox
Ogni installazione è indipendente: il tuo server, i tuoi domini, il tuo login Google, i tuoi utenti. Serve un server Ubuntu 24.04 (basta una VPS piccola), un dominio per la piattaforma, un sottodominio DuckDNS gratuito per i tool e un client OAuth di Google. Poi:

```bash
git clone https://github.com/zalaso/sharebox /opt/sharebox && cd /opt/sharebox && bash deploy/install.sh
```

Guida passo per passo: [docs/installazione.md](docs/installazione.md). Gestione e aggiornamenti: [deploy/README.md](deploy/README.md).

## Sicurezza
Per segnalare una vulnerabilità vedi [SECURITY.md](SECURITY.md): niente issue pubbliche, per favore.

## Licenza
[GNU AGPL v3](LICENSE) o successiva. Puoi usare, studiare, modificare e redistribuire ShareBox, anche per offrire un servizio; se offri un servizio basato su una versione modificata, devi rendere disponibile il codice delle tue modifiche ai suoi utenti.
