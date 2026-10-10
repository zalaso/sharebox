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

# Porta i tool già pubblicati al runtime appena costruito: stessa versione, stessi dati, i sospesi restano fermi.
# Lo chiede all'orchestratore da dentro il suo container, l'unico che ha il token e raggiunge la sua rete.
# shellcheck disable=SC2016 # il JavaScript va passato a node così com'è
REFRESH_JS='
const url = `http://${process.env.LISTEN_HOST}:${process.env.PORT || 8081}/refresh`;
const headers = { authorization: `Bearer ${process.env.ORCHESTRATOR_TOKEN}` };
(async () => {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || String(res.status));
      for (const f of body.failed) console.error(`  ${f.id}: ${f.error}`);
      console.log(`${body.refreshed.length} ${body.upToDate} ${body.failed.length}`);
      return;
    } catch (error) {
      if (attempt >= 30) { console.error(error.message); process.exit(1); }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
})();'
if counts=$(docker compose exec -T orchestrator node -e "$REFRESH_JS"); then
  read -r refreshed uptodate failed <<<"$counts"
  msg "Tool portati al runtime nuovo: $refreshed (già aggiornati: $uptodate)." "Tools moved to the new runtime: $refreshed (already up to date: $uptodate)."
  [ "$failed" = 0 ] || msg "Attenzione: $failed tool non aggiornati (dettagli sopra); ripubblicali." "Warning: $failed tools not updated (details above); publish them again."
else
  msg "Attenzione: aggiornamento dei tool non riuscito; restano sul runtime precedente finché non vengono ripubblicati." \
    "Warning: updating the tools failed; they keep the previous runtime until they are published again."
fi
msg "Aggiornato." "Updated."
