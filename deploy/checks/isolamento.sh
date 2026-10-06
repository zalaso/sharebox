#!/usr/bin/env bash
# Verifica che ogni tool pubblicato raggiunga solo se stesso (ADR 0005, 0008). Da lanciare sul server:
#   bash /opt/sharebox/deploy/checks/isolamento.sh
# Usa gli IP e non i nomi: dentro i container gVisor il DNS di Docker non funziona.
set -euo pipefail
cd "$(dirname "$0")/.."

mapfile -t TOOLS < <(docker ps --filter label=sharebox.tool --format '{{.Label "sharebox.tool"}}' | sort)
if [ "${#TOOLS[@]}" -lt 2 ]; then echo "Servono almeno due tool pubblicati (trovati: ${#TOOLS[@]})"; exit 1; fi

PUBLIC_IP=$(grep '^PUBLIC_IP=' .env | cut -d= -f2- | tr -d '"')
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo 100.64.0.1)

ip_of() { docker inspect -f "{{(index .NetworkSettings.Networks \"$2\").IPAddress}}" "$1"; }

declare -A TOOL_IP GW_IP
for t in "${TOOLS[@]}"; do
  TOOL_IP[$t]=$(ip_of "sharebox-tool-$t" "sbx-tool-$t")
  GW_IP[$t]=$(ip_of sharebox-platform "sbx-tool-$t")
done

PROBE=$(cat <<'EOF'
const net = require("net");
const targets = process.env.TARGETS.trim().split(" ").map((t) => t.split("|"));
Promise.all(targets.map(([host, port, expected, label]) => new Promise((resolve) => {
  const s = net.connect({ host, port: Number(port), timeout: 2500 });
  const done = (reached, why) => { s.destroy(); resolve({ host, port, label, expected: expected === "si", reached, why }); };
  s.on("connect", () => done(true, "connesso"));
  s.on("timeout", () => done(false, "timeout"));
  s.on("error", (e) => done(false, e.code));
}))).then((results) => {
  let ok = true;
  for (const r of results) {
    const good = r.reached === r.expected;
    ok = ok && good;
    console.log(`  ${good ? "OK" : "KO"}  ${r.label.padEnd(26)} ${r.host}:${r.port}  ${r.reached ? "raggiungibile" : "bloccato"} (${r.why})`);
  }
  process.exit(ok ? 0 : 1);
});
EOF
)

fail=0
for t in "${TOOLS[@]}"; do
  # host|porta|atteso raggiungibile|etichetta
  targets="${TOOL_IP[$t]}|8080|si|se-stesso ${GW_IP[$t]}|8080|no|piattaforma-(propria-rete)"
  for o in "${TOOLS[@]}"; do
    [ "$o" = "$t" ] || targets+=" ${TOOL_IP[$o]}|8080|no|tool-$o ${GW_IP[$o]}|8080|no|piattaforma-(rete-$o)"
  done
  targets+=" $TAILSCALE_IP|443|no|servizi-host-via-Tailscale $PUBLIC_IP|22|no|SSH-server 172.17.0.1|22|no|host-docker0"
  targets+=" 172.30.0.1|22|no|host-rete-edge 172.30.0.10|8080|no|piattaforma-(rete-edge)"
  targets+=" 172.31.0.10|8081|no|orchestratore 1.1.1.1|53|no|internet"

  echo "Da $t:"
  docker exec -e TARGETS="$targets" "sharebox-tool-$t" node -e "$PROBE" || fail=1
done

if [ "$fail" -eq 0 ]; then echo "Isolamento OK (${#TOOLS[@]} tool)"; else echo "Isolamento NON rispettato"; exit 1; fi
