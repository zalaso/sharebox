# Fase 0 — Passi manuali (storico)

> Passi seguiti per la prima istanza, a mano. Per una nuova installazione usa [installazione.md](installazione.md) e `deploy/install.sh`.

Passi che richiedono account o accesso al server: vanno fatti da chi gestisce il server. Costo: zero.

**Stato (2026-09-26): tutti completati.** DuckDNS `esempio`, record `sharebox.example.com` sul registrar, progetto Google Cloud "ShareBox" con app OAuth pubblicata, credenziali in `/opt/sharebox/.env` sul server. Home e privacy richieste da Google: `https://sharebox.example.com/` e `/privacy` (sorgenti in `deploy/site/`).

## 1. Sottodominio DuckDNS per i tool
- Accedere a duckdns.org e creare un sottodominio (es. `esempio`) che punta all'IP del server netcup.
- Annotare il token DuckDNS: serve a Caddy per il certificato wildcard. Va solo nel file `.env` sul server, mai nel repo.
- DuckDNS risolve già `qualsiasi.esempio.duckdns.org` sullo stesso IP: non servono altri record.

## 2. Record DNS per la piattaforma
Nel pannello DNS del registrar per `example.com`: record `A` `sharebox` → IP del server.

## 3. Google OAuth (serve in Fase 1, ma conviene avviarlo ora)
- Progetto su Google Cloud Console → OAuth consent screen, tipo **External**, scope `openid`, `email`, `profile`.
- Authorized domain: `example.com`.
- Client OAuth "Web application", redirect URI: `https://sharebox.example.com/auth/callback`.
- Pubblicare l'app ("In production"): con questi scope non serve la verifica e non c'è il limite dei 100 utenti di test.

## 4. Informazioni sul server (raccolte il 2026-09-26, vedi ADR 0005)
Comando usato per raccogliere caratteristiche del server e porte occupate:

```bash
hostnamectl; nproc; free -h; df -h /; uname -r; docker --version; docker ps --format '{{.Names}}: {{.Image}} {{.Ports}}'; sudo ss -ltnp '( sport = :80 or sport = :443 )'
```
