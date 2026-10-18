#!/usr/bin/env bash
# Network isolation check: every published tool must reach only itself (ADR 0005, 0008).
# Run it on the server:
#   bash /opt/sharebox/deploy/checks/isolamento.sh
# From inside each tool's container it opens TCP connections to the tool itself, the other tools,
# the platform, the orchestrator, the host and the internet, and fails if anything but the tool
# itself and the platform's egress proxy (token-only, ADR 0009) is reachable. It checks the network
# layer; the second layer (workerd sending every outbound fetch through the egress worker, which refuses
# it unless the tool declared the domain) is set in deploy/runtime/config.capnp.
# It uses IP addresses, not names: Docker's DNS does not work inside gVisor containers.
#
# Verifica dell'isolamento di rete: ogni tool pubblicato deve raggiungere solo se stesso.
# Messaggi in italiano se il server è in italiano (o con SHAREBOX_LANG=it), altrimenti in inglese.
set -euo pipefail
cd "$(dirname "$0")/.."

case "${SHAREBOX_LANG:-${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}}" in it*) IT=1 ;; *) IT=0 ;; esac
msg() { if [ "$IT" = 1 ]; then printf '%s\n' "$1"; else printf '%s\n' "$2"; fi; }

mapfile -t TOOLS < <(docker ps --filter label=sharebox.tool --format '{{.Label "sharebox.tool"}}' | sort)
if [ "${#TOOLS[@]}" -lt 2 ]; then
  msg "Servono almeno due tool pubblicati e avviati (trovati: ${#TOOLS[@]})" "At least two published, running tools are needed (found: ${#TOOLS[@]})"
  exit 1
fi

PUBLIC_IP=$(grep '^PUBLIC_IP=' .env | cut -d= -f2- | tr -d '"')
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo 100.64.0.1)

ip_of() { docker inspect -f "{{(index .NetworkSettings.Networks \"$2\").IPAddress}}" "$1"; }

# Each tool's own address, and the platform's address on that tool's network.
declare -A TOOL_IP GW_IP
for t in "${TOOLS[@]}"; do
  TOOL_IP[$t]=$(ip_of "sharebox-tool-$t" "sbx-tool-$t")
  GW_IP[$t]=$(ip_of sharebox-platform "sbx-tool-$t")
done

# Runs inside the tool's container (which has node): one TCP connection per target.
PROBE=$(cat <<'EOF'
const net = require("net");
const it = process.env.PROBE_LANG === "it";
const targets = process.env.TARGETS.trim().split(" ").map((t) => t.split("|"));
Promise.all(targets.map(([host, port, expected, label]) => new Promise((resolve) => {
  const s = net.connect({ host, port: Number(port), timeout: 2500 });
  const done = (reached, why) => { s.destroy(); resolve({ host, port, label, expected: expected === "yes", reached, why }); };
  s.on("connect", () => done(true, it ? "connesso" : "connected"));
  s.on("timeout", () => done(false, "timeout"));
  s.on("error", (e) => done(false, e.code));
}))).then((results) => {
  let ok = true;
  for (const r of results) {
    const good = r.reached === r.expected;
    ok = ok && good;
    const state = r.reached ? (it ? "raggiungibile" : "reachable") : (it ? "bloccato" : "blocked");
    console.log(`  ${good ? "OK" : "KO"}  ${r.label.padEnd(28)} ${r.host}:${r.port}  ${state} (${r.why})`);
  }
  process.exit(ok ? 0 : 1);
});
EOF
)

fail=0
for t in "${TOOLS[@]}"; do
  # host|port|should be reachable|label
  # The platform's egress proxy (port 8091, ADR 0009) is the one thing a tool may reach besides itself:
  # it only answers requests carrying that tool's token.
  targets="${TOOL_IP[$t]}|8080|yes|itself ${GW_IP[$t]}|8080|no|platform-(own-network) ${GW_IP[$t]}|8091|yes|platform-egress-proxy"
  for o in "${TOOLS[@]}"; do
    [ "$o" = "$t" ] || targets+=" ${TOOL_IP[$o]}|8080|no|tool-$o ${GW_IP[$o]}|8080|no|platform-($o-network)"
  done
  targets+=" $TAILSCALE_IP|443|no|host-services-via-Tailscale $PUBLIC_IP|22|no|server-SSH 172.17.0.1|22|no|host-docker0"
  targets+=" 172.30.0.1|22|no|host-edge-network 172.30.0.10|8080|no|platform-(edge-network)"
  targets+=" 172.31.0.10|8081|no|orchestrator 1.1.1.1|53|no|internet"

  msg "Da $t:" "From $t:"
  docker exec -e TARGETS="$targets" -e PROBE_LANG="$([ "$IT" = 1 ] && echo it || echo en)" "sharebox-tool-$t" node -e "$PROBE" || fail=1
done

if [ "$fail" -eq 0 ]; then
  msg "Isolamento OK (${#TOOLS[@]} tool)" "Isolation OK (${#TOOLS[@]} tools)"
else
  msg "Isolamento NON rispettato" "Isolation NOT respected"
  exit 1
fi
