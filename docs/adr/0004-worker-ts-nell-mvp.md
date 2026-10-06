# 0004 — Codice server (`worker.ts`) supportato nell'MVP

Stato: accettato (2026-09-25)

## Contesto
La demo si può fare con un tool solo statico e la collections API. Ma molti tool utili hanno bisogno di logica server (validazioni, chiamate ad API esterne con segreti).

## Decisione
Un tool può includere `worker.ts`. La CLI lo impacchetta con esbuild; la piattaforma genera il modulo d'ingresso che instrada `/__sharebox/*` al proprio runtime e il resto all'handler del creatore. Asset e worker si caricano nello stesso deploy.

## Conseguenze
- Il percorso di deploy è lo stesso dei tool statici (workerd esegue comunque un modulo d'ingresso): il costo aggiuntivo è il bundling nella CLI.
- Il codice del creatore gira nello stesso container del runtime della piattaforma per quel tool: può manometterlo, ma solo a danno dei dati del proprio tool. Login e permessi restano nel gateway, fuori dalla sua portata (ADR 0005).
- I segreti (Fase 2) sono disponibili solo ai tool con `worker.ts`.
- Il traffico in uscita è limitato dai limiti del container subito e controllato da un proxy in uscita in Fase 3.

Aggiornato il 2026-09-26 per il passaggio al server netcup (ADR 0005).
