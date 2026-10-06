# 0005 — I tool girano sul server netcup, un container gVisor + workerd per tool

Stato: accettato (2026-09-26). Sostituisce 0001.

## Contesto
Vincolo di costo: nessuna spesa o pochi euro. Workers for Platforms costa circa 30 $/mese. Il piano gratuito di Cloudflare obbliga a mettere il controllo di accesso dentro ogni tool (il codice del creatore può aggirarlo) e ha un tetto di 100.000 richieste al giorno condiviso. Guido ha già un server netcup, usato solo per un'app personale.

## Decisione
- **Caddy** davanti a tutto: HTTPS, certificato wildcard per i tool.
- **Gateway** (Node): login, permessi, pulizia degli header, iniezione dell'identità, rifiuto delle richieste cross-site che modificano dati. Unico processo che raggiunge i container dei tool.
- **Un container per tool**, con runtime **gVisor** (`runsc`) e dentro **workerd** (runtime open source dei Worker Cloudflare). I tool mantengono il formato Worker: `public/` + `worker.ts` opzionale.
- Limiti per container: CPU, memoria, numero di processi. Ogni tool ha un volume proprio con il suo database SQLite.
- **Una rete Docker interna per ogni tool**, condivisa solo con il gateway. Con una rete unica un tool potrebbe chiamare direttamente un altro tool con header di identità falsi. Il gateway ascolta solo sulla rete `edge` (quella di Caddy): dalle reti dei tool la sua porta non è raggiungibile.
- Nessun accesso a internet per i tool nell'MVP (reti `internal`). L'uscita arriva con i segreti (Fase 2), tramite un proxy con limiti.
- Caddy pubblica le porte 80/443 solo sull'IP pubblico: sull'IP Tailscale la 443 è già usata da `tailscaled` per un'app personale.
- **API e dashboard** in un processo separato, con il database della piattaforma in SQLite. L'API parla con Docker tramite un proxy del socket che espone solo le operazioni necessarie.

## Alternative scartate
- **Workers for Platforms**: circa 30 $/mese.
- **Cloudflare piano gratuito**: login dentro il tool, tetto di richieste condiviso.
- **Solo workerd, senza gVisor**: workerd non è una sandbox per codice non fidato.

## Conseguenze
- Costo aggiuntivo zero. Manutenzione, aggiornamenti e backup sono a carico di chi gestisce il server: gli snapshot netcup e un backup giornaliero dei volumi SQLite sono parte della Fase 1.
- Il formato dei tool resta compatibile con Cloudflare: un eventuale passaggio a Workers for Platforms non richiede di riscriverli.
- Il server è una VPS nano (2 vCPU, 2 GB di RAM, circa 840 MB liberi con l'app personale già presente sul server). Misurato nello spike: circa 22 MB per tool, quindi circa 25 tool accesi insieme. Oltre, serve lo spegnimento dopo inattività con riavvio alla prima richiesta (Fase 2).
- Le reti dei tool usano `com.docker.network.bridge.inhibit_ipv4`: senza, l'host ha un indirizzo su ogni rete e i tool raggiungono i suoi servizi in ascolto su tutte le interfacce (nello spike: SSH).
- Dentro i container gVisor il DNS di Docker non funziona: i tool non risolvono nomi. Il proxy in uscita della Fase 2 andrà raggiunto per IP.

Spike superato il 2026-09-26: esiti in `docs/spike-fase0.md`. I container dei tool li crea l'orchestratore (ADR 0008).
