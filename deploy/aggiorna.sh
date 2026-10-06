#!/usr/bin/env bash
# Aggiorna un'installazione di ShareBox: scarica la versione nuova (se è un clone git),
# ricostruisce le immagini e riavvia i servizi. Dati, configurazione e backup restano.
#   bash /opt/sharebox/deploy/aggiorna.sh
set -euo pipefail

case "${SHAREBOX_LANG:-${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}}" in it*) IT=1 ;; *) IT=0 ;; esac
msg() { if [ "$IT" = 1 ]; then printf '%s\n' "$1"; else printf '%s\n' "$2"; fi; }

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
if [ -d .git ]; then
  git pull --ff-only
fi
cd deploy
[ -f .env ] || { msg "Manca deploy/.env: per una prima installazione usa deploy/install.sh" "deploy/.env is missing: for a first installation use deploy/install.sh" >&2; exit 1; }
docker compose --profile build build runtime
docker compose up -d --build --remove-orphans
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true
docker compose ps --format '{{.Service}}: {{.Status}}'
msg "Aggiornato. I tool già pubblicati useranno il nuovo runtime alla loro prossima pubblicazione." \
  "Updated. Tools already published will use the new runtime on their next publish."
