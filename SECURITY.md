# Security · Sicurezza

**English** · [Italiano](#italiano)

ShareBox runs code written by others and handles third-party data: vulnerability reports are very welcome.

## How to report
Use GitHub's private reporting: the repository's **Security** tab → **Report a vulnerability**. Please do not open public issues for security problems.

If you can, include what an attacker can achieve, steps to reproduce and the affected version (commit). Expect a reply within 7 days.

## What matters most
- A tool reaching other tools, the platform, the orchestrator or the host (see `deploy/checks/isolamento.sh`).
- A tool or page obtaining a user's session on another tool or on the dashboard.
- Access to a tool without a share, or after a revocation.
- Forging the identity (`x-sharebox-*` headers) or the role received by a tool.
- Writing files outside the tool's folder while publishing.

## Out of scope
- Attacks that require control of the server or of the victim's Google account.
- Documented resource limits (e.g. a tool using its own CPU quota).
- ShareBox instances run by others: report to their operators.

Do not test instances you do not own without permission.

---

## Italiano

ShareBox esegue codice scritto da altri e gestisce dati di terzi: le segnalazioni di vulnerabilità sono benvenute.

### Come segnalare
Usa la segnalazione privata di GitHub: scheda **Security** del repository → **Report a vulnerability**. Non aprire issue pubbliche per problemi di sicurezza.

Indica, se puoi: cosa si riesce a fare, i passi per riprodurlo e la versione (commit) interessata. Risposta attesa entro 7 giorni.

### Cosa interessa di più
- Un tool che raggiunge altri tool, la piattaforma, l'orchestratore o l'host (vedi `deploy/checks/isolamento.sh`).
- Un tool o una pagina che ottiene la sessione di un utente su un altro tool o sulla dashboard.
- Accesso a un tool senza condivisione, o dopo una revoca.
- Falsificazione dell'identità (`x-sharebox-*`) o del ruolo ricevuti dal tool.
- Scrittura di file fuori dalla cartella del tool durante la pubblicazione.

### Fuori ambito
- Attacchi che richiedono il controllo del server o dell'account Google della vittima.
- Limiti di risorse documentati (per esempio un tool che occupa la propria quota di CPU).
- Istanze di ShareBox gestite da altri: segnala a chi le gestisce.

Non eseguire test su istanze altrui senza autorizzazione.
