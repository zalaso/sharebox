# 0009 — Uscita verso internet controllata, segreti e CSP per i tool

Stato: accettato (2026-10-18)

## Contesto
Fino a qui un tool non raggiungeva niente fuori da se stesso: rete Docker interna senza uscita e, nel runtime, un servizio che rifiutava ogni `fetch`. Molti tool utili però devono chiamare un servizio esterno (meteo, calendari, un'API aziendale), spesso con una chiave. Scrivere la chiave nel codice del tool la esporrebbe a chiunque possa ripubblicarlo o leggerne i file, e un'uscita libera trasformerebbe ogni tool in un possibile ponte verso la rete del server (altre app, Tailscale).

Nel browser, inoltre, la pagina di un tool poteva mandare con `fetch` ciò che l'utente digita a qualunque sito.

## Decisione
**Domini dichiarati.** Un tool dichiara in `sharebox.json` i domini che gli servono: `{"network": {"allow": ["api.example.com", "*.example.org"]}}` (massimo 20, solo nomi DNS). La lista arriva alla piattaforma a ogni pubblicazione. Senza dichiarazioni non cambia niente: il tool resta senza uscita.

**Proxy di uscita nella piattaforma.**
- Nel runtime, ogni `fetch` del tool passa da un piccolo worker (`deploy/runtime/egress.js`). Se il tool non ha domini dichiarati la rifiuta. Altrimenti la inoltra al proxy della piattaforma, sulla rete privata del tool, con il token del tool. Il token è un binding solo di quel worker: il codice del tool non lo vede e non può sostituirlo.
- Il proxy (`packages/platform/src/egress.ts`) ascolta sulla porta 8091 e risponde solo a token validi di tool attivi. Il token cambia a ogni pubblicazione e nel database ne resta solo l'hash.
- Lascia passare solo HTTPS sulla porta 443 verso i domini dichiarati. Risolve il nome e rifiuta i domini con anche un solo indirizzo non pubblico (reti private, 100.64/10 di Tailscale, localhost, link-local come 169.254.169.254), così un dominio permesso non può puntare dentro il server. Si collega all'indirizzo controllato e verifica il certificato sul nome.
- Limiti per tool: richiesta fino a 1 MB, risposta fino a 10 MB, 20 secondi, 120 richieste al minuto, 8 in parallelo.

**Segreti.** Li imposta chi gestisce il tool, dalla CLI (`sharebox secret set <tool> NOME --host api.example.com`; il valore si digita senza vederlo o arriva da stdin) o dall'API. Restano nel database cifrati con AES-256-GCM, con una chiave derivata da `ORCHESTRATOR_TOKEN`: una copia del solo database non basta a leggerli. Il codice del tool scrive `{{secret:NOME}}` nell'indirizzo, negli header o nel corpo. Il proxy lo sostituisce solo se la richiesta va al dominio del segreto. L'API restituisce nomi e domini, mai i valori. Gli agenti non hanno uno strumento MCP per i segreti: chiedono all'utente di impostarli.

**Content-Security-Policy.** Il gateway aggiunge a ogni risposta dei tool `connect-src 'self'` più i domini dichiarati, e `form-action 'self'`, `frame-ancestors 'self'`, `base-uri 'self'`, `object-src 'none'`. Le connessioni dirette dal browser (`fetch`, XHR, WebSocket) arrivano solo al tool e ai suoi domini. Script, stili, font e immagini restano liberi, così le librerie da CDN continuano a funzionare. La CSP del tool, se c'è, resta: il browser le applica tutte.

## Conseguenze
- Una porta della piattaforma (8091) è raggiungibile dai container dei tool. Prima nessuna lo era. Il gestore è piccolo, risponde solo a token validi e non tocca sessioni né login, ma è un'apertura in più: lo script `deploy/checks/isolamento.sh` la verifica esplicitamente. Un processo separato sarebbe più isolato, al prezzo di un servizio in più da tenere (ADR 0007).
- Il proxy esegue le richieste come la piattaforma: chi gestisce un tool può usarlo per fare richieste HTTPS verso i domini che dichiara, entro i limiti.
- La CSP non chiude ogni canale: una pagina può ancora far uscire dati caricando un'immagine o uno script da un dominio esterno. Chiude quello più comodo e frequente, senza rompere le librerie da CDN.
- I tool che dal browser chiamavano direttamente un'API esterna devono dichiararne il dominio.
- Il token di uscita sta nella configurazione del container, leggibile da root sul server, come gli altri segreti dell'istanza.
