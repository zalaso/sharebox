FROM caddy:2
# Moduli DNS per il certificato wildcard dei tool (DNS_PROVIDER in deploy/.env), scaricati dal servizio
# di build ufficiale di Caddy. In alternativa: immagine caddy:2-builder con `xcaddy build --with ...`.
RUN caddy add-package github.com/caddy-dns/duckdns github.com/caddy-dns/cloudflare
