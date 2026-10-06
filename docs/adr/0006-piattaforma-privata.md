# 0006 — ShareBox è privata: creatori su invito

Stato: accettato (2026-09-26). Sostituisce 0003.

## Contesto
Una piattaforma pubblica richiede infrastruttura a pagamento e difese dagli abusi. Il vincolo è non spendere, anche rinunciando all'apertura al pubblico.

## Decisione
- Può pubblicare tool solo chi è in una lista di creatori gestita dall'amministratore.
- I visitatori sono chiunque abbia un account Google e sia autorizzato dalla condivisione del tool (persone, dominio, chiunque abbia il link).
- L'app OAuth di Google viene pubblicata in produzione con i soli scope `openid email profile`: non serve la verifica e non c'è il limite di 100 utenti di test.

## Conseguenze
- Escono dall'MVP: registrazione aperta, segnalazione abusi, Termini di servizio pubblici, richiesta PSL.
- Restano: limiti di risorse per tool, sospensione, audit log. Servono contro i tool difettosi, non solo contro quelli malevoli.
- I creatori sono fidati, ma il loro codice è scritto da agenti: l'isolamento tra tool resta un requisito.
