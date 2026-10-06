#!/usr/bin/env bash
# Backup giornaliero di ShareBox (systemd: sharebox-backup.timer). Ripristino: deploy/backup/RIPRISTINO.md.
# Contiene: database della piattaforma, dati di ogni tool, file pubblicati dei tool.
# Non contiene: .env (segreti) e certificati, che si ricreano.
set -euo pipefail

# Radice dell'installazione (il repository sul server): data/ e backups/ stanno lì.
SHAREBOX_DIR=${SHAREBOX_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}
DEST=${SHAREBOX_BACKUP_DIR:-$SHAREBOX_DIR/backups}
KEEP_DAYS=${SHAREBOX_BACKUP_KEEP_DAYS:-7}
STAMP=$(date +%Y-%m-%d_%H%M%S)
WORK=$(mktemp -d)
PAUSED=""

cleanup() {
  # Un tool non deve mai restare congelato, anche se il backup fallisce a metà.
  [ -n "$PAUSED" ] && docker unpause "$PAUSED" >/dev/null 2>&1 || true
  docker exec sharebox-platform node -e 'try { require("fs").unlinkSync("/data/backup-in-corso.sqlite") } catch {}' >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

mkdir -p "$DEST" "$WORK/platform" "$WORK/tools-data"
chmod 700 "$DEST"

# 1. Database della piattaforma: copia coerente con VACUUM INTO, verificata prima di uscire dal container.
docker exec sharebox-platform node -e '
  const { DatabaseSync } = require("node:sqlite");
  // \x27 = apice singolo: VACUUM INTO vuole una stringa SQL, e qui siamo dentro apici di bash.
  new DatabaseSync("/data/platform.sqlite").exec("VACUUM INTO \x27/data/backup-in-corso.sqlite\x27");
  const check = new DatabaseSync("/data/backup-in-corso.sqlite", { readOnly: true }).prepare("PRAGMA integrity_check").get();
  if (check.integrity_check !== "ok") { console.error("integrity_check:", check); process.exit(1); }
'
docker cp -q sharebox-platform:/data/backup-in-corso.sqlite "$WORK/platform/platform.sqlite"

# 2. Dati di ogni tool: il container viene congelato per il tempo della copia, così i file SQLite sono coerenti.
for container in $(docker ps --filter label=sharebox.tool --format '{{.Names}}'); do
  id=$(docker inspect -f '{{index .Config.Labels "sharebox.tool"}}' "$container")
  volume=$(docker volume inspect -f '{{.Mountpoint}}' "sbx-data-$id")
  docker pause "$container" >/dev/null
  PAUSED=$container
  tar -C "$volume" -czf "$WORK/tools-data/$id.tar.gz" .
  docker unpause "$container" >/dev/null
  PAUSED=""
done

# 3. File pubblicati (ultima versione e precedente di ogni tool).
tar -C "$SHAREBOX_DIR/data" -czf "$WORK/tools-files.tar.gz" tools

# 4. Un solo archivio, leggibile solo da root, verificato.
ARCHIVE="$DEST/sharebox-$STAMP.tar.gz"
tar -C "$WORK" -czf "$ARCHIVE.tmp" .
tar -tzf "$ARCHIVE.tmp" >/dev/null
mv "$ARCHIVE.tmp" "$ARCHIVE"
chmod 600 "$ARCHIVE"

# 5. Rotazione: restano gli ultimi KEEP_DAYS giorni.
find "$DEST" -maxdepth 1 -name 'sharebox-*.tar.gz' -mtime +"$KEEP_DAYS" -delete

echo "Backup completato: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1), tool: $(ls "$WORK/tools-data" | wc -l))"

# 6. Copia cifrata su Google Drive, se configurata (configura-drive.sh); lì restano DRIVE_KEEP_DAYS giorni.
#    Se fallisce, il servizio risulta fallito (systemctl status sharebox-backup) ma il backup locale resta.
RCLONE="rclone --config /root/.config/rclone/rclone.conf"
DRIVE_KEEP_DAYS=${SHAREBOX_DRIVE_KEEP_DAYS:-30}
if command -v rclone >/dev/null && $RCLONE listremotes 2>/dev/null | grep -qx 'sharebox-drive:'; then
  $RCLONE copy "$ARCHIVE" sharebox-drive:
  $RCLONE delete sharebox-drive: --min-age "${DRIVE_KEEP_DAYS}d"
  echo "Copia cifrata su Google Drive completata"
fi
