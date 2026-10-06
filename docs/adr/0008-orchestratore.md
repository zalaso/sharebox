# 0008 — Un orchestratore separato è l'unico ad avere accesso a Docker

Stato: accettato (2026-09-26)

## Contesto
Per pubblicare un tool bisogna creare container, reti e volumi. Chi ha accesso al socket di Docker ha di fatto i permessi di root sul server (può creare un container privilegiato o montare `/`). La piattaforma è esposta su internet e riceve codice da chiunque sia creatore: se avesse il socket, una sua vulnerabilità comprometterebbe il server e le altre app che ospita.

## Decisione
Un processo `orchestrator` (`packages/orchestrator`):
- è l'unico con il socket di Docker;
- sta solo sulla rete interna `control`, condivisa con la piattaforma, e richiede un token condiviso (`ORCHESTRATOR_TOKEN`);
- espone solo: pubblica una versione di un tool, elimina un tool, ricollega la piattaforma alle reti dei tool;
- decide da solo come è fatto ogni container (`spec.ts`): gVisor, sola lettura, nessuna capability, limiti di CPU, memoria e processi, rete interna propria senza indirizzo per l'host, codice montato in sola lettura, volume dati proprio. La piattaforma indica solo quale tool, quale versione e quali file;
- ricontrolla id e percorsi dei file prima di scrivere su disco.

I file di ogni versione stanno in `/opt/sharebox/data/tools/<id>/v<n>/`; restano l'ultima e la precedente, per il rollback (Fase 2).

## Alternative scartate
- **Socket di Docker nella piattaforma**, anche tramite un proxy che filtra le API: il proxy limita gli endpoint ma non i parametri, quindi la creazione di un container privilegiato resta possibile.
- **Servizio sull'host (systemd)**: stesso isolamento, ma fuori da Docker Compose e più difficile da aggiornare.

## Conseguenze
- Una piattaforma compromessa può al massimo creare, aggiornare o eliminare tool isolati, non prendere il controllo del server.
- Circa 20 MB di RAM in più.
- Ripubblicare ricrea il container: un paio di secondi di interruzione per il tool. I dati restano nel volume.
