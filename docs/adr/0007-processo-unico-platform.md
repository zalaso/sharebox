# 0007 — Gateway e API in un solo processo

Stato: accettato (2026-09-26). Modifica ADR 0005, che li prevedeva separati.

## Contesto
Il server ha circa 840 MB liberi e ogni processo Node occupa 20–25 MB. Il gateway deve leggere sessioni e permessi a ogni richiesta, e la revoca deve valere subito.

## Decisione
Un solo processo `platform` (`packages/platform`), con un solo database SQLite (`node:sqlite`, nessuna dipendenza nativa):
- richieste per `PLATFORM_DOMAIN` → login (`/auth/*`) e, dal passo 2, API;
- richieste per `*.TOOLS_DOMAIN` → gateway (`packages/gateway`), che legge sessioni e permessi dallo stesso database a ogni richiesta.

Login: Google OpenID Connect con PKCE, stato legato al browser con un cookie, nonce. La sessione della piattaforma diventa una sessione del singolo tool tramite un codice monouso valido 60 secondi e solo per quel tool. Nel database ci sono solo gli hash di token e codici.

## Conseguenze
- Nessuna chiamata di rete tra gateway e API; revoca immediata senza cache da invalidare.
- Il processo è raggiungibile solo da Caddy (ascolta sull'IP della rete `edge`), come prima il gateway.
- Un errore nel codice di login può fermare anche il gateway: accettabile con un solo server. Si separano se servirà scalare.
- Finché la dashboard non c'è, tool e condivisioni si gestiscono con `node /app/platform.mjs admin …` nel container.
