# Spike Fase 0 sul server netcup (storico)

> Documento storico: descrive lo spike del 2026-09-26. Per il deploy attuale vedi `deploy/README.md`. Il gateway e i tool di prova qui citati sono stati sostituiti da `platform` e dall'orchestratore.

Verifica i punti rischiosi dell'ADR 0005 prima di costruire l'MVP. Sul server finisce tutto in `/opt/sharebox`.

## 1. Installare gVisor (una volta)
Sul server, da root. Aggiunge il runtime `runsc` a Docker; i container esistenti non vengono toccati.

```bash
apt-get update && apt-get install -y ca-certificates curl gnupg
curl -fsSL https://gvisor.dev/archive.key | gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" > /etc/apt/sources.list.d/gvisor.list
apt-get update && apt-get install -y runsc
runsc install && systemctl restart docker
docker run --rm --runtime=runsc hello-world
```

## 2. Copiare i file e creare `.env`
Sul PC, dalla cartella del repo:

```bash
npm run build:gateway
```

```bash
scp -r deploy vps:/opt/sharebox
```

Sul server: `cp /opt/sharebox/.env.example /opt/sharebox/.env`, poi `nano /opt/sharebox/.env` e incollare il token DuckDNS. Il token non passa dal PC né dalla chat.

## 3. Avviare

```bash
cd /opt/sharebox && docker compose up -d --build
```

Il primo avvio scarica le immagini e ottiene il certificato wildcard: può richiedere qualche minuto. Log: `docker compose logs -f caddy`.

## Criteri di successo

| # | Verifica | Atteso |
|---|---|---|
| 1 | Aprire `https://spike.guido-sbx.duckdns.org/` | Pagina servita con certificato valido (wildcard) |
| 2 | Riquadro "Dati e identità" | `email: spike@sharebox.invalid`, `nome: Spike Tester` |
| 3 | `curl -H "x-sharebox-email: finto@x.com" -H "cookie: __Host-sharebox=abc; tema=scuro" https://spike.guido-sbx.duckdns.org/__sharebox/ping` | Email sempre quella dello spike; `cookie` = `tema=scuro` |
| 4 | Ricaricare più volte, poi `docker compose up -d --force-recreate tool-spike` | `visite` continua a crescere dopo la ricreazione del container |
| 5 | Aprire `https://altro.guido-sbx.duckdns.org/` | `visite` parte da 1: dati separati |
| 6 | Sul server: `bash /opt/sharebox/checks/isolamento.sh` | `Isolamento OK`: ogni tool raggiunge solo se stesso |
| 7 | Aprire `/__sharebox/burn` su spike e subito dopo `altro`; leggere `cpu.max` del container | `altro` risponde subito; `cpu.max` = `25000 100000` (25% di una CPU) |
| 8 | Aprire `/__sharebox/mem` su spike | Nessun "memoria NON limitata"; il container viene riavviato, `altro` e l'app personale sul server non se ne accorgono |
| 9 | `docker stats --no-stream` | Memoria per tool, per stimare quanti tool reggono i 2 GB |
| 10 | Aprire `https://inesistente.guido-sbx.duckdns.org/` | 502 (in Fase 1 diventerà 404 con il registro dei tool) |

Gli esiti vanno annotati in fondo a questo file.

## Fermare lo spike
Il gateway dello spike non controlla gli accessi: chiunque conosca l'indirizzo vede i tool di prova. A fine prova:

```bash
cd /opt/sharebox && docker compose down
```

`docker compose down -v` cancella anche i dati dei tool e il certificato.

## Esiti (2026-09-26)

Spike **superato**, con una correzione applicata durante la prova e un'attività aggiunta alla Fase 1.

| # | Esito |
|---|---|
| 1 | OK: HTTP 200, certificato wildcard Let's Encrypt `*.guido-sbx.duckdns.org` ottenuto via DNS-01 in circa 10 s |
| 2–3 | OK: identità iniettata dal gateway, header falsi del client ignorati, `__Host-sharebox` tolto (`cookie` = `tema=scuro`) |
| 4 | OK: contatore conservato dopo `docker compose down` + `up` e dopo un crash per memoria |
| 5 | OK: `altro` ha un contatore separato |
| 6 | OK dopo la correzione sotto: ogni tool raggiunge solo se stesso |
| 7 | OK: `cpu.max` 25%, `memory.max` 128 MB, `pids.max` 64 applicati; `altro` risponde in 0,6 s mentre `spike` consuma CPU |
| 8 | OK: il kernel chiude solo il container di `spike`, che riparte da solo; `altro` e l'app personale sul server non se ne accorgono. **Ma** il visitatore aspetta 60 s invece di ricevere subito un errore (vedi sotto) |
| 9 | Circa 22 MB per tool (workerd + gVisor), 20 MB il gateway, 11 MB Caddy. Con circa 840 MB liberi: circa 25 tool accesi insieme |
| 10 | 502, come previsto per lo spike |

**Correzione: l'host era raggiungibile dai tool.** Con reti `internal` l'host ha comunque un indirizzo su ogni rete dei tool, e un tool raggiungeva l'SSH del server su quell'indirizzo. Risolto con `com.docker.network.bridge.inhibit_ipv4` sulle reti dei tool (ora in `compose.yaml`).

**Scoperta: niente DNS nei container gVisor.** Il DNS interno di Docker non funziona con `runsc`: dentro un tool nessun nome si risolve. Per i tool è un vantaggio (un canale in meno); il gateway, che gira con `runc`, risolve normalmente. Il test di isolamento nella pagina è stato sostituito da `checks/isolamento.sh`, che usa gli IP.

**Da fare in Fase 1: timeout del gateway.** Se un tool si blocca o crasha, il gateway deve rispondere entro pochi secondi (504) invece di lasciare il visitatore in attesa.
