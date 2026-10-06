#!/usr/bin/env bash
# Installa un'istanza di ShareBox su un server Ubuntu 24.04, da root, dalla radice del repository:
#   git clone <indirizzo del repository> /opt/sharebox && cd /opt/sharebox && bash deploy/install.sh
# Si può rilanciare: i passi già fatti vengono saltati. Guida completa: docs/installazione.md.
# Messaggi in italiano se il sistema è in italiano (o con SHAREBOX_LANG=it), altrimenti in inglese.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
DEPLOY="$ROOT/deploy"
ENV_FILE="$DEPLOY/.env"

case "${SHAREBOX_LANG:-${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}}" in it*) IT=1 ;; *) IT=0 ;; esac
msg() { if [ "$IT" = 1 ]; then printf '%s' "$1"; else printf '%s' "$2"; fi; }

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf '%s %s\n' "$(msg 'Attenzione:' 'Warning:')" "$*"; }
fail() { printf '\n%s %s\n' "$(msg 'Errore:' 'Error:')" "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "$(msg 'va eseguito da root: sudo bash deploy/install.sh' 'must run as root: sudo bash deploy/install.sh')"
# shellcheck disable=SC1091
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || warn "$(msg "provato solo su Ubuntu 24.04 (qui: ${PRETTY_NAME:-sconosciuto})" "only tested on Ubuntu 24.04 (this is: ${PRETTY_NAME:-unknown})")"
MEM_MB=$(awk '/MemTotal/ { print int($2 / 1024) }' /proc/meminfo)
[ "$MEM_MB" -ge 1800 ] || warn "$(msg "il server ha ${MEM_MB} MB di RAM: ne servono almeno 2 GB (ogni tool acceso ne usa circa 25 MB)" "the server has ${MEM_MB} MB of RAM: at least 2 GB are needed (each running tool uses about 25 MB)")"

say "$(msg '1/6 Docker e gVisor' '1/6 Docker and gVisor')"
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
docker run --rm --runtime=runsc hello-world >/dev/null && msg $'gVisor: i container dei tool girano in sandbox\n' $'gVisor: tool containers run sandboxed\n'

say "$(msg '2/6 Configurazione' '2/6 Configuration')"
if [ -f "$ENV_FILE" ]; then
  msg "$ENV_FILE esiste già: la uso così com'è (per cambiare un valore modifica il file e rilancia)."$'\n' \
    "$ENV_FILE already exists: using it as is (to change a value, edit the file and run again)."$'\n'
else
  # I valori finiscono tra virgolette in .env: niente virgolette, $ o \ al loro interno.
  check() {
    case "$2" in *'"'* | *'$'* | *'\'*) fail "$1: $(msg 'non può contenere' 'cannot contain') \" \$ \\" ;; esac
    [ -n "$2" ] || fail "$1: $(msg 'serve un valore' 'a value is required')"
  }
  ask() {
    local answer
    read -rp "$2${3:+ [$3]}: " answer
    answer=${answer:-${3:-}}
    check "$2" "$answer"
    printf -v "$1" '%s' "$answer"
  }
  secret() {
    local answer
    read -rsp "$2 ($(msg 'non viene mostrato' 'hidden')): " answer
    echo
    check "$2" "$answer"
    printf -v "$1" '%s' "$answer"
  }
  domain() {
    [[ "$2" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] ||
      fail "$1: \"$2\" $(msg 'non è un dominio valido (es. sharebox.example.com)' 'is not a valid domain (e.g. sharebox.example.com)')"
  }
  msg $'Prima di continuare servono: il dominio della piattaforma con un record A verso questo server,\nun dominio per i tool (DuckDNS gratuito, oppure un dominio su Cloudflare) e un client OAuth di Google.\nGuida: docs/installazione.md\n' \
    $'Before continuing you need: the platform domain with an A record pointing to this server,\na domain for the tools (free DuckDNS, or a domain on Cloudflare) and a Google OAuth client.\nGuide: docs/install.md\n'
  DETECTED_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')
  ask PUBLIC_IP "$(msg 'IP pubblico del server' 'Public IP of the server')" "$DETECTED_IP"
  ask PLATFORM_DOMAIN "$(msg 'Dominio della piattaforma, es. sharebox.example.com' 'Platform domain, e.g. sharebox.example.com')"
  PLATFORM_DOMAIN=${PLATFORM_DOMAIN,,}
  domain "$(msg 'Dominio della piattaforma' 'Platform domain')" "$PLATFORM_DOMAIN"
  ask DNS_PROVIDER "$(msg 'Certificato dei tool: duckdns (sottodominio gratuito) o cloudflare (dominio tuo su Cloudflare)' 'Tool certificate: duckdns (free subdomain) or cloudflare (your own domain on Cloudflare)')" "duckdns"
  DUCKDNS_TOKEN=""
  CLOUDFLARE_API_TOKEN=""
  case "${DNS_PROVIDER,,}" in
    duckdns)
      DNS_PROVIDER=duckdns
      ask TOOLS_DOMAIN "$(msg 'Sottodominio DuckDNS per i tool, es. nome.duckdns.org' 'DuckDNS subdomain for the tools, e.g. name.duckdns.org')"
      secret DUCKDNS_TOKEN "$(msg 'Token DuckDNS' 'DuckDNS token')"
      ;;
    cloudflare)
      DNS_PROVIDER=cloudflare
      ask TOOLS_DOMAIN "$(msg 'Dominio dei tool su Cloudflare (record A *.dominio verso il server), es. strumenti-esempio.com' 'Tools domain on Cloudflare (A record *.domain pointing to the server), e.g. tools-example.com')"
      secret CLOUDFLARE_API_TOKEN "$(msg 'Token API Cloudflare (permesso Zone > DNS > Edit)' 'Cloudflare API token (permission Zone > DNS > Edit)')"
      ;;
    *) fail "$(msg 'provider non supportato' 'unsupported provider'): ${DNS_PROVIDER} (duckdns, cloudflare)" ;;
  esac
  TOOLS_DOMAIN=${TOOLS_DOMAIN,,}
  domain "$(msg 'Dominio dei tool' 'Tools domain')" "$TOOLS_DOMAIN"
  [ "$TOOLS_DOMAIN" != "$PLATFORM_DOMAIN" ] || fail "$(msg 'il dominio dei tool deve essere diverso da quello della piattaforma' 'the tools domain must differ from the platform domain')"
  # Stesso dominio registrato (es. app.esempio.it e tool.esempio.it): funziona, ma i tool sarebbero "stesso sito" della piattaforma.
  [ "$(echo "$TOOLS_DOMAIN" | awk -F. '{ print $(NF-1)"."$NF }')" != "$(echo "$PLATFORM_DOMAIN" | awk -F. '{ print $(NF-1)"."$NF }')" ] ||
    warn "$(msg 'tool e piattaforma sotto lo stesso dominio: meglio un dominio separato per i tool (docs/adr/0002-domini-separati.md)' 'tools and platform under the same domain: a separate domain for the tools is safer (docs/adr/0002-domini-separati.md)')"
  ask GOOGLE_CLIENT_ID "$(msg 'Google OAuth: ID client' 'Google OAuth: client ID')"
  secret GOOGLE_CLIENT_SECRET "$(msg 'Google OAuth: client secret' 'Google OAuth: client secret')"
  ask CREATOR_EMAILS "$(msg 'Email di chi può pubblicare tool, separate da virgola' 'Emails of the people who can publish tools, comma separated')"
  ask OPERATOR_NAME "$(msg "Nome di chi gestisce l'istanza (compare nell'informativa privacy)" 'Name of the instance operator (shown in the privacy policy)')"
  ask OPERATOR_EMAIL "$(msg 'Email di contatto per la privacy' 'Contact email for privacy matters')" "${CREATOR_EMAILS%%,*}"
  ask HOSTING_DESCRIPTION "$(msg "Dove sta il server, frase per l'informativa privacy" 'Where the server is, a sentence for the privacy policy')" \
    "$(msg "Su un server nell'Unione Europea" 'On a server in the European Union')"
  (
    umask 077
    cat >"$ENV_FILE" <<EOF
# Creato da deploy/install.sh il $(date -I). Valori: deploy/.env.example.
PUBLIC_IP="$PUBLIC_IP"
PLATFORM_DOMAIN="$PLATFORM_DOMAIN"
TOOLS_DOMAIN="$TOOLS_DOMAIN"
DNS_PROVIDER="$DNS_PROVIDER"
DUCKDNS_TOKEN="$DUCKDNS_TOKEN"
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN"
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
  msg "Salvata in $ENV_FILE (leggibile solo da root)."$'\n' "Saved to $ENV_FILE (readable by root only)."$'\n'
fi
value() { grep "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"'; }
PUBLIC_IP=$(value PUBLIC_IP)
PLATFORM_DOMAIN=$(value PLATFORM_DOMAIN)
TOOLS_DOMAIN=$(value TOOLS_DOMAIN)

say "$(msg '3/6 DNS, porte e firewall' '3/6 DNS, ports and firewall')"
resolved() { getent ahostsv4 "$1" 2>/dev/null | awk 'NR == 1 { print $1 }'; }
for host in "$PLATFORM_DOMAIN" "prova.$TOOLS_DOMAIN"; do
  ip=$(resolved "$host")
  if [ "$ip" = "$PUBLIC_IP" ]; then
    echo "$host → $ip: ok"
  else
    warn "$(msg "$host risolve in '${ip:-niente}', non in $PUBLIC_IP: HTTPS non funzionerà finché il DNS non è corretto" "$host resolves to '${ip:-nothing}', not $PUBLIC_IP: HTTPS won't work until DNS is fixed")"
  fi
done
busy=$(ss -ltnH '( sport = :80 or sport = :443 )' | awk '{ print $4 }' | grep -E "^(0\.0\.0\.0|\*|\[::\]|${PUBLIC_IP//./\\.}):" | grep -v docker-proxy || true)
if [ -n "$busy" ] && ! docker ps --format '{{.Names}}' | grep -q '^sharebox-caddy'; then
  fail "$(msg "le porte 80/443 su $PUBLIC_IP sono già usate ($busy): ShareBox ha bisogno di quelle porte" "ports 80/443 on $PUBLIC_IP are already in use ($busy): ShareBox needs them")"
fi
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && msg $'Firewall (ufw): porte 80 e 443 aperte\n' $'Firewall (ufw): ports 80 and 443 open\n'
fi

say "$(msg '4/6 Costruzione e avvio (la prima volta qualche minuto)' '4/6 Build and start (a few minutes the first time)')"
mkdir -p "$ROOT/data/tools" "$ROOT/backups"
chmod 700 "$ROOT/backups"
cd "$DEPLOY"
docker compose --profile build build runtime
docker compose up -d --build --remove-orphans

say "$(msg '5/6 Backup automatico ogni notte' '5/6 Nightly automatic backup')"
sed "s#^ExecStart=.*#ExecStart=/bin/bash $DEPLOY/backup/backup.sh#" "$DEPLOY/backup/sharebox-backup.service" >/etc/systemd/system/sharebox-backup.service
cp "$DEPLOY/backup/sharebox-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now sharebox-backup.timer >/dev/null
msg "Backup in $ROOT/backups alle 3:30 (copia cifrata su Google Drive: deploy/backup/configura-drive.sh)"$'\n' \
  "Backups in $ROOT/backups at 3:30 (encrypted copy on Google Drive: deploy/backup/configura-drive.sh)"$'\n'

say "$(msg '6/6 Verifica' '6/6 Check')"
for _ in $(seq 1 30); do
  docker compose logs platform 2>/dev/null | grep -q "platform su" && break
  sleep 2
done
docker compose ps --format '  {{.Service}}: {{.Status}}'
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$PLATFORM_DOMAIN/" || true)
if [ "$code" = "200" ]; then
  msg "https://$PLATFORM_DOMAIN risponde"$'\n' "https://$PLATFORM_DOMAIN is up"$'\n'
else
  warn "$(msg "https://$PLATFORM_DOMAIN non risponde ancora (codice '$code'): il certificato può richiedere qualche minuto; poi controlla 'docker compose logs caddy'" "https://$PLATFORM_DOMAIN is not responding yet (code '$code'): the certificate can take a few minutes; then check 'docker compose logs caddy'")"
fi

if [ "$IT" = 1 ]; then
  cat <<EOF

Installazione completata. Ultimi passi:
  1. Google Cloud Console → il tuo client OAuth: redirect URI autorizzato https://$PLATFORM_DOMAIN/auth/callback
  2. Apri https://$PLATFORM_DOMAIN/app e accedi con un account tra quelli dei creatori.
  3. Sul tuo PC installa la CLI (docs/cli.md) e collegala:  sharebox login $PLATFORM_DOMAIN
  4. Per gli agenti (Claude Code):  claude mcp add --scope user sharebox -- sharebox mcp
Aggiornare in futuro: bash deploy/aggiorna.sh
EOF
else
  cat <<EOF

Installation complete. Last steps:
  1. Google Cloud Console → your OAuth client: authorized redirect URI https://$PLATFORM_DOMAIN/auth/callback
  2. Open https://$PLATFORM_DOMAIN/app and sign in with one of the creator accounts.
  3. On your PC install the CLI (docs/cli.md) and connect it:  sharebox login $PLATFORM_DOMAIN
  4. For agents (Claude Code):  claude mcp add --scope user sharebox -- sharebox mcp
To update later: bash deploy/aggiorna.sh
EOF
fi
