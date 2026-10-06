# 0003 — ShareBox è pubblica

Stato: sostituito da [0006](0006-piattaforma-privata.md) (2026-09-26)

## Contesto
Chiunque abbia un account Google può registrarsi e pubblicare tool. È la scelta con più utenti potenziali, ma una piattaforma che ospita codice arbitrario attira phishing, spam e abuso di risorse.

## Decisione
Già nell'MVP, non dopo:
- quote per account (numero di tool, dimensione bundle, spazio D1) e limiti per richiesta;
- kill-switch amministrativo per tool e per account;
- registrazione aperta ma chiudibile con un flag (lista d'attesa se serve);
- link "segnala abuso" nella pagina di login dei tool;
- Termini di servizio e privacy policy prima del lancio.

In Fase 3: Outbound Worker per controllare il traffico in uscita dei tool, controllo Safe Browsing, CSP.

## Conseguenze
- Il login obbligatorio anche per "chiunque abbia il link" riduce molto l'uso dei tool come pagine di phishing anonime.
- La schermata di consenso OAuth di Google va pubblicata in produzione con verifica del brand (gli scope `openid email profile` non sono sensibili, quindi niente verifica completa).
- Obblighi GDPR verso utenti di terzi: il creatore è titolare dei dati del proprio tool, ShareBox è responsabile del trattamento. Da formalizzare nei Termini.
