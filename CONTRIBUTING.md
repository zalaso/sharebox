# Contributing · Contribuire

**English** — Thanks for your interest in ShareBox! Bug reports, ideas, documentation fixes and pull requests are all welcome. Translations of the (currently Italian-only) user interface are especially welcome.

**Italiano** — Grazie per l'interesse! Segnalazioni, idee, correzioni alla documentazione e pull request sono benvenute, in particolare le traduzioni dell'interfaccia.

## Development setup · Ambiente di sviluppo
Node 24 is required. / Serve Node 24.

```bash
npm install
```

```bash
npm run typecheck && npm test
```

```bash
npm run build
```

Dashboard preview with fake data, no server or Google account needed / anteprima della dashboard con dati finti, senza server né account Google:

```bash
npm run dev:dashboard
```

Then open / poi apri `http://localhost:8790/dev-login`.

## Repository layout · Struttura
| Path | |
|---|---|
| `packages/platform` | Google login, sessions, permissions, API, dashboard (`dashboard/`), gateway wiring |
| `packages/gateway` | Request forwarding to tools, header/cookie sanitizing, identity |
| `packages/orchestrator` | The only process with Docker access: tool containers lifecycle |
| `packages/runtime` | Code added to every tool: assets, SDK and collections, creator's worker |
| `packages/cli` | `sharebox` command and MCP server |
| `packages/shared` | Shared types and rules |
| `deploy/` | Docker Compose, Caddy, images, installer, backups, checks |
| `docs/` | Install guides, architecture, decision records (ADR) |

## Guidelines · Linee guida
- **Tests first for security-relevant code** (permissions, sessions, isolation, file paths). The CI runs typecheck, tests, build, shellcheck and image builds on every pull request. / I test vengono prima per il codice che tocca la sicurezza; la CI li esegue su ogni pull request.
- **Keep it dependency-free** where reasonable: the platform, orchestrator and dashboard have no runtime dependencies. / Niente dipendenze dove non servono.
- **Code comments and docs are in Italian** (the project's working language); English is fine in issues and pull requests. / Commenti e documentazione sono in italiano; nelle issue e nelle pull request va bene anche l'inglese.
- **Significant design changes** deserve a short decision record in `docs/adr/`. / Le scelte di progetto importanti vanno in un ADR.
- **Never commit secrets** or instance-specific data (IP addresses, tokens, `.env` files). / Mai segreti o dati di un'istanza nel repository.

## Security · Sicurezza
Please do not open public issues for vulnerabilities: see [SECURITY.md](SECURITY.md). / Le vulnerabilità vanno segnalate in privato.

## License · Licenza
By contributing you agree that your contributions are licensed under the [GNU AGPL v3 or later](LICENSE). / Contribuendo accetti che i tuoi contributi siano distribuiti con la stessa licenza.
