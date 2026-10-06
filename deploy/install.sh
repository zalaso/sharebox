#!/usr/bin/env bash
# Installa un'istanza di ShareBox su un server Ubuntu 24.04, da root, dalla radice del repository:
#   git clone <indirizzo del repository> /opt/sharebox && cd /opt/sharebox && bash deploy/install.sh
# Si può rilanciare: i passi già fatti vengono saltati. Guida completa: docs/installazione.md.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
DEPLOY="$ROOT/deploy"
ENV_FILE="$DEPLOY/.env"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf 'Attenzione: %s\n' "$*"; }
fail() { printf '\nErrore: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "va eseguito da root: sudo bash deploy/install.sh"
# shellcheck disable=SC1091
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || warn "provato solo su Ubuntu 24.04 (qui: ${PRETTY_NAME:-sconosciuto})"

say "1/6 Docker e gVisor"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg openssl iproute2 >/dev/null
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/ubuntu/gpg" -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
fi
echo "$(docker --version)"
if ! command -v runsc >/dev/null; then
  curl -fsSL https://gvisor.dev/archive.key | gpg --dearmor --yes -o /usr/share/keyrings/gvisor-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" \
    > /etc/apt/sources.list.d/gvisor.list
  apt-get update -qq
  apt-get install -y -qq runsc >/dev/null
fi
if ! docker info 2>/dev/null | grep -q runsc; then
  runsc install
  systemctl restart docker
fi
docker run --rm --runtime=runsc hello-world >/dev/null && echo "gVisor: i container dei tool girano in sandbox"

say "2/6 Configurazione"
if [ -f "$ENV_FILE" ]; then
  echo "$ENV_FILE esiste già: la uso così com'è (per cambiare un valore modifica il file e rilancia)."
else
  # I valori finiscono tra virgolette in .env: niente virgolette, $ o \ al loro interno.
  check() { case "$2" in *'"'* | *'$'* | *'\'*) fail "$1: non può contenere \" \$ o \\" ;; esac; [ -n "$2" ] || fail "$1: serve un valore"; }
  ask() {
    local answer
    read -rp "$2${3:+ [$3]}: " answer
    answer=${answer:-${3:-}}
    check "$2" "$answer"
    printf -v "$1" '%s' "$answer"
  }
  secret() {
    local answer
    read -rsp "$2 (non viene mostrato): " answer
    echo
    check "$2" "$answer"
    printf -v "$1" '%s' "$answer"
  }
  echo "Prima di continuare servono: il dominio della piattaforma con un record A verso questo server,"
  echo "un sottodominio DuckDNS con il suo token e un client OAuth di Google (docs/installazione.md)."
  DETECTED_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')
  ask PUBLIC_IP "IP pubblico del server" "$DETECTED_IP"
  ask PLATFORM_DOMAIN "Dominio della piattaforma, es. sharebox.example.com"
  ask TOOLS_DOMAIN "Sottodominio DuckDNS per i tool, es. nome.duckdns.org"
  secret DUCKDNS_TOKEN "Token DuckDNS"
  ask GOOGLE_CLIENT_ID "Google OAuth: ID client"
  secret GOOGLE_CLIENT_SECRET "Google OAuth: client secret"
  ask CREATOR_EMAILS "Email di chi può pubblicare tool, separate da virgola"
  ask OPERATOR_NAME "Nome di chi gestisce l'istanza (compare nell'informativa privacy)"
  ask OPERATOR_EMAIL "Email di contatto per la privacy" "${CREATOR_EMAILS%%,*}"
  ask HOSTING_DESCRIPTION "Dove sta il server, frase per l'informativa privacy" "Su un server nell'Unione Europea"
  (
    umask 077
    cat >"$ENV_FILE" <<EOF
# Creato da deploy/install.sh il $(date -I). Valori: deploy/.env.example.
PUBLIC_IP="$PUBLIC_IP"
PLATFORM_DOMAIN="${PLATFORM_DOMAIN,,}"
TOOLS_DOMAIN="${TOOLS_DOMAIN,,}"
DUCKDNS_TOKEN="$DUCKDNS_TOKEN"
GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID"
GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET"
CREATOR_EMAILS="${CREATOR_EMAILS,,}"
ORCHESTRATOR_TOKEN="$(openssl rand -hex 32)"
OPERATOR_NAME="$OPERATOR_NAME"
OPERATOR_EMAIL="$OPERATOR_EMAIL"
HOSTING_DESCRIPTION="$HOSTING_DESCRIPTION"
OFFSITE_BACKUP="nessuno"
SHAREBOX_DIR="$ROOT"
EOF
  )
  echo "Salvata in $ENV_FILE (leggibile solo da root)."
fi
value() { grep "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"'; }
PUBLIC_IP=$(value PUBLIC_IP)
PLATFORM_DOMAIN=$(value PLATFORM_DOMAIN)
TOOLS_DOMAIN=$(value TOOLS_DOMAIN)

say "3/6 DNS, porte e firewall"
resolved() { getent ahostsv4 "$1" 2>/dev/null | awk 'NR == 1 { print $1 }'; }
for host in "$PLATFORM_DOMAIN" "prova.$TOOLS_DOMAIN"; do
  ip=$(resolved "$host")
  if [ "$ip" = "$PUBLIC_IP" ]; then echo "$host → $ip: ok"; else warn "$host risolve in '${ip:-niente}', non in $PUBLIC_IP: HTTPS non funzionerà finché il DNS non è corretto"; fi
done
busy=$(ss -ltnH '( sport = :80 or sport = :443 )' | awk '{ print $4 }' | grep -E "^(0\.0\.0\.0|\*|\[::\]|${PUBLIC_IP//./\\.}):" | grep -v docker-proxy || true)
if [ -n "$busy" ] && ! docker ps --format '{{.Names}}' | grep -q '^sharebox-caddy'; then
  fail "le porte 80/443 su $PUBLIC_IP sono già usate ($busy): ShareBox ha bisogno di quelle porte"
fi
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && echo "Firewall (ufw): porte 80 e 443 aperte"
fi

say "4/6 Costruzione e avvio (la prima volta qualche minuto)"
mkdir -p "$ROOT/data/tools" "$ROOT/backups"
chmod 700 "$ROOT/backups"
cd "$DEPLOY"
docker compose --profile build build runtime
docker compose up -d --build --remove-orphans

say "5/6 Backup automatico ogni notte"
sed "s#^ExecStart=.*#ExecStart=/bin/bash $DEPLOY/backup/backup.sh#" "$DEPLOY/backup/sharebox-backup.service" >/etc/systemd/system/sharebox-backup.service
cp "$DEPLOY/backup/sharebox-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now sharebox-backup.timer >/dev/null
echo "Backup in $ROOT/backups alle 3:30 (copia cifrata su Google Drive: deploy/backup/configura-drive.sh)"

say "6/6 Verifica"
for _ in $(seq 1 30); do
  docker compose logs platform 2>/dev/null | grep -q "platform su" && break
  sleep 2
done
docker compose ps --format '  {{.Service}}: {{.Status}}'
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$PLATFORM_DOMAIN/" || true)
if [ "$code" = "200" ]; then echo "https://$PLATFORM_DOMAIN risponde"; else warn "https://$PLATFORM_DOMAIN non risponde ancora (codice '$code'): il certificato può richiedere qualche minuto; poi controlla 'docker compose logs caddy'"; fi

cat <<EOF

Installazione completata. Ultimi passi:
  1. Google Cloud Console → il tuo client OAuth: redirect URI autorizzato https://$PLATFORM_DOMAIN/auth/callback
  2. Apri https://$PLATFORM_DOMAIN/app e accedi con un account tra quelli dei creatori.
  3. Sul tuo PC installa la CLI (docs/cli.md) e collegala:  sharebox login $PLATFORM_DOMAIN
  4. Per gli agenti (Claude Code):  claude mcp add --scope user sharebox -- sharebox mcp
Aggiornare in futuro: bash deploy/aggiorna.sh
EOF
