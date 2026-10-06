# Gestire un'installazione

Prima installazione: [docs/installazione.md](../docs/installazione.md) (`deploy/install.sh`).

Sul server il repository sta in `/opt/sharebox` (o dove indicato da `SHAREBOX_DIR`). I comandi `docker compose` si danno da `/opt/sharebox/deploy`, dove c'è anche la configurazione `.env`.

| Cosa | Dove |
|---|---|
| Configurazione e segreti | `deploy/.env` (solo root; valori in `deploy/.env.example`) |
| Database della piattaforma (utenti, tool, permessi, token, registro attività) | volume `sharebox_platform-data` |
| File pubblicati dei tool (ultima versione e precedente) | `data/tools/<id>/v<n>/` |
| Dati di ogni tool | volume `sbx-data-<id>` |
| Backup | `backups/` (7 giorni) e, se configurato, Google Drive |
| Certificati HTTPS | volume `sharebox_caddy-data` |

Servizi: `caddy` (HTTPS), `platform` (login, API, dashboard, gateway dei tool), `orchestrator` (unico con accesso a Docker, ADR 0008). I container dei tool (`sharebox-tool-<id>`) li crea l'orchestratore.

## Aggiornare
```bash
bash /opt/sharebox/deploy/aggiorna.sh
```
Con un clone git scarica la versione nuova; poi ricostruisce le immagini (dal codice sorgente, non serve Node sul PC) e riavvia. Senza git, prima copia sul server i file nuovi del repository, per esempio dal PC: `git archive HEAD | ssh server "tar -x -C /opt/sharebox"`.

## Amministrazione
Finché la dashboard non le copre tutte, alcune operazioni sono comandi nel container della piattaforma:

```bash
cd /opt/sharebox/deploy && docker compose exec platform node /app/platform.mjs admin
```

Senza argomenti mostra i comandi (tool, condivisioni, sospensione, eliminazione, token). Chi può pubblicare si decide con `CREATOR_EMAILS` in `deploy/.env`, poi `docker compose up -d platform`.

## Verifiche
- Isolamento dei tool (almeno due tool pubblicati): `bash /opt/sharebox/deploy/checks/isolamento.sh`
- Stato e memoria: `docker compose ps` e `docker stats --no-stream`
- Log: `docker compose logs --tail 50 platform orchestrator caddy`

## Backup
Ogni notte alle 3:30 (`systemctl list-timers sharebox-backup.timer`) in `backups/`: database della piattaforma, dati e file di ogni tool; ogni tool resta congelato per una frazione di secondo durante la copia. Backup manuale: `systemctl start sharebox-backup.service`; esito: `systemctl status sharebox-backup.service`.

Copia cifrata su Google Drive (30 giorni), facoltativa: `deploy/backup/configura-drive.sh`, poi `OFFSITE_BACKUP="google-drive"` in `.env`. Le chiavi sono in `/root/.sharebox-backup-chiavi`: vanno salvate anche fuori dal server. Ripristino: [backup/RIPRISTINO.md](backup/RIPRISTINO.md).
