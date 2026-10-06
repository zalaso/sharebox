# Sicurezza

ShareBox esegue codice scritto da altri e gestisce dati di terzi: le segnalazioni di vulnerabilità sono benvenute.

## Come segnalare
Usa la segnalazione privata di GitHub: scheda **Security** del repository → **Report a vulnerability**. Non aprire issue pubbliche per problemi di sicurezza.

Indica, se puoi: cosa si riesce a fare, i passi per riprodurlo e la versione (commit) interessata. Risposta attesa entro 7 giorni.

## Cosa interessa di più
- Un tool che raggiunge altri tool, la piattaforma, l'orchestratore o l'host (vedi `deploy/checks/isolamento.sh`).
- Un tool o una pagina che ottiene la sessione di un utente su un altro tool o sulla dashboard.
- Accesso a un tool senza condivisione, o dopo una revoca.
- Falsificazione dell'identità (`x-sharebox-*`) o del ruolo ricevuti dal tool.
- Scrittura di file fuori dalla cartella del tool durante la pubblicazione.

## Fuori ambito
- Attacchi che richiedono il controllo del server o dell'account Google della vittima.
- Limiti di risorse documentati (per esempio un tool che occupa la propria quota di CPU).
- Istanze di ShareBox gestite da altri: segnala a chi le gestisce.

Non eseguire test su istanze altrui senza autorizzazione.
