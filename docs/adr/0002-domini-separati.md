# 0002 — Piattaforma e tool su domini separati

Stato: accettato (2026-09-25), rivisto il 2026-09-26 per il passaggio al server netcup (ADR 0005)

## Contesto
Se i tool fossero sottodomini del dominio della piattaforma, un tool malevolo potrebbe leggere o impostare cookie validi per la dashboard. I tool non devono essere "stesso sito" della piattaforma né degli altri domini del gestore (qui `getceng.it`).

## Decisione
- Piattaforma (dashboard, API, login): `sharebox.getceng.it`.
- Tool: `<slug>.guido-sbx.duckdns.org`, sottodominio DuckDNS gratuito. `duckdns.org` è nella Public Suffix List, quindi i tool sono un sito diverso dalla piattaforma.
- Il cookie di sessione dei tool è `__Host-sharebox`: valido solo per l'host del tool, `HttpOnly`, `Secure`, `SameSite=Lax`. Il gateway lo toglie prima di inoltrare la richiesta al codice del tool.
- I tool sono però "stesso sito" tra loro (`guido-sbx.duckdns.org`): `SameSite` non protegge un tool dalle richieste partite da un altro. Il gateway rifiuta le richieste che modificano dati (metodi diversi da GET/HEAD/OPTIONS) se `Sec-Fetch-Site` non è `same-origin` o `none`.

## Conseguenze
- Il login passa da un redirect con codice monouso tra i due domini.
- Niente richiesta di inserimento nella PSL: `duckdns.org` c'è già.
- Certificato wildcard per i tool tramite challenge DNS-01 con l'API DuckDNS (Caddy con il modulo `caddy-dns/duckdns`).
- Se un giorno la piattaforma diventa pubblica, serve un dominio dedicato ai tool e la richiesta PSL.
