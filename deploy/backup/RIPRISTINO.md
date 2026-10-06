# Ripristino da un backup

Gli archivi sono in `/opt/sharebox/backups/sharebox-<data>_<ora>.tar.gz`, creati ogni notte alle 3:30 da `sharebox-backup.timer` (ultimi 7 giorni). Ogni archivio contiene:

```
platform/platform.sqlite    database della piattaforma (utenti, tool, permessi, token, registro attività)
tools-data/<id>.tar.gz      dati di un tool (contenuto del volume sbx-data-<id>)
tools-files.tar.gz          file pubblicati dei tool (cartella tools/)
```

Prima di tutto, sul server: `mkdir -p /root/ripristino && tar -C /root/ripristino -xzf /opt/sharebox/backups/<archivio>`.

## Dati di un solo tool
Per esempio dopo che un tool ha rovinato i propri dati. L'id del tool si legge con `admin tools`.

```bash
docker stop sharebox-tool-<id>
DIR=$(docker volume inspect -f '{{.Mountpoint}}' sbx-data-<id>)
rm -rf "$DIR"/* && tar -C "$DIR" -xzf /root/ripristino/tools-data/<id>.tar.gz
docker start sharebox-tool-<id>
```

## Database della piattaforma
Riporta utenti, tool, condivisioni e token allo stato del backup.

```bash
cd /opt/sharebox/deploy && docker compose stop platform
DIR=$(docker volume inspect -f '{{.Mountpoint}}' sharebox_platform-data)
rm -f "$DIR"/platform.sqlite-wal "$DIR"/platform.sqlite-shm
cp /root/ripristino/platform/platform.sqlite "$DIR"/platform.sqlite && chown 1000:1000 "$DIR"/platform.sqlite
docker compose start platform
```

## Recuperare un backup da Google Drive
Su Drive, nella cartella `ShareBox-backup`, c'è una copia cifrata di ogni backup degli ultimi 30 giorni. Per leggerla servono le due chiavi salvate nel password manager ("ShareBox – chiavi backup Drive"), le stesse di `/root/.sharebox-backup-chiavi`.

Su qualunque computer con rclone:
1. Autorizzare Drive come alla prima configurazione: `rclone authorize "drive" "eyJzY29wZSI6ImRyaXZlLmZpbGUifQ"`, poi `rclone config create gdrive drive scope=drive.file token=<token>`.
   Lo scope `drive.file` vede solo i file creati con lo stesso client OAuth di rclone: con rclone standard i backup restano visibili.
2. `rclone config create sharebox-drive crypt remote=gdrive:ShareBox-backup password=<prima chiave> password2=<seconda chiave> --obscure`
3. `rclone lsf sharebox-drive:` per l'elenco, `rclone copy sharebox-drive:<archivio> .` per scaricarne uno già decifrato.

Sul server, se è ancora configurato, basta `rclone --config /root/.config/rclone/rclone.conf copy sharebox-drive:<archivio> /root/ripristino/`.

## Server nuovo (il vecchio è perso)
0. Recuperare l'ultimo archivio da Google Drive come sopra.
1. Clonare il repository in `/opt/sharebox` e lanciare `deploy/install.sh` (docs/installazione.md), che ricrea anche `deploy/.env`. I segreti si ricreano: token DuckDNS dal sito DuckDNS, client secret da Google Cloud Console (aggiungi secret), `ORCHESTRATOR_TOKEN` con `openssl rand -hex 32`.
2. Aggiornare l'IP del server su DuckDNS e nel record DNS della piattaforma.
3. Ripristinare il database della piattaforma come sopra (install.sh ha già avviato i servizi).
4. Estrarre i file dei tool: `tar -C /opt/sharebox/data -xzf /root/ripristino/tools-files.tar.gz`.
5. Ricreare i container dei tool: ripubblicare ogni tool dalla CLI. Poi, per ognuno, ripristinare i dati come sopra.
