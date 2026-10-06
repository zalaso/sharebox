FROM caddy:2
# Modulo DuckDNS per il certificato wildcard dei tool, scaricato dal servizio di build ufficiale di Caddy.
# Se il servizio non risponde, alternativa: immagine caddy:2-builder con `xcaddy build --with github.com/caddy-dns/duckdns`.
RUN caddy add-package github.com/caddy-dns/duckdns
