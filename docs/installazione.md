# Installare la propria ShareBox

Ogni installazione è indipendente: il tuo server, i tuoi domini, il tuo login Google, i tuoi utenti. Tempo: circa mezz'ora, quasi tutta di configurazione di DNS e Google.

## Cosa serve
| Cosa | Note | Costo |
|---|---|---|
| Un server Linux **Ubuntu 24.04** con IP pubblico, accesso root, porte 80 e 443 libere | Basta una VPS piccola: 2 GB di RAM reggono circa 25 tool accesi insieme. Meglio un server dedicato a ShareBox | da ~4 €/mese |
| Un **dominio per la piattaforma**, es. `sharebox.tuodominio.it` | Basta un sottodominio di un dominio che hai già | quello che hai |
| Un **sottodominio DuckDNS** per i tool, es. `nome.duckdns.org` | Gratuito. Serve un dominio diverso da quello della piattaforma (ADR 0002) | 0 € |
| Un **account Google** per creare il client OAuth | Il login degli utenti passa da Google | 0 € |

## 1. DNS
1. **Piattaforma:** nel pannello DNS del tuo dominio crea un record `A` per il nome scelto (es. `sharebox`) con l'IP del server.
2. **Tool:** su [duckdns.org](https://www.duckdns.org) accedi, crea un sottodominio e impostane l'IP su quello del server (attenzione: il campo si compila da solo con l'IP da cui navighi). Annota il **token** DuckDNS mostrato in alto: serve all'installazione per il certificato HTTPS dei tool.

DuckDNS risolve da solo ogni `qualcosa.nome.duckdns.org`: non servono altri record.

## 2. Login con Google
In [Google Cloud Console](https://console.cloud.google.com):
1. Crea un progetto (es. "ShareBox") e apri **Google Auth Platform**.
2. **Branding:** nome dell'app, email di assistenza, dominio autorizzato = il tuo dominio (es. `tuodominio.it`), home page `https://<piattaforma>/` e informativa privacy `https://<piattaforma>/privacy` (le pagine le pubblica ShareBox stessa).
3. **Pubblico:** tipo *Esterno*; poi **Pubblica app**. Con i soli scope di base non serve la verifica di Google.
4. **Accesso ai dati:** scope `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
5. **Client:** *Applicazione web*, URI di reindirizzamento `https://<piattaforma>/auth/callback`. Copia **ID client** e **client secret** (il secret si vede una volta sola).

## 3. Installazione sul server
Da root:

```bash
git clone https://github.com/zalaso/sharebox /opt/sharebox
```

```bash
cd /opt/sharebox && bash deploy/install.sh
```

Lo script installa Docker e gVisor, chiede domini, token e dati del client Google (i segreti non vengono mostrati mentre li scrivi), controlla DNS e porte, costruisce e avvia i servizi, attiva il backup notturno. La configurazione finisce in `deploy/.env`, leggibile solo da root. Si può rilanciare senza danni.

Alla fine apri `https://<piattaforma>/app` e accedi con uno degli account indicati come creatori.

## 4. Collegare il tuo computer e gli agenti
Sul tuo PC (serve Node 20 o più recente), installa la CLI dal repository:

```bash
git clone https://github.com/zalaso/sharebox && cd sharebox && npm install && npm run build:cli && npm install -g ./packages/cli
```

Poi collegala alla tua istanza (si apre il browser per confermare):

```bash
sharebox login sharebox.tuodominio.it
```

Per Claude Code (su Windows anteponi `cmd /c` al comando):

```bash
claude mcp add --scope user sharebox -- sharebox mcp
```

Da qui un agente può costruire, pubblicare e condividere tool. Dettagli in [cli.md](cli.md).

## 5. Facoltativo: copia dei backup su Google Drive
I backup restano 7 giorni sul server. Per una copia cifrata fuori dal server (30 giorni) segui `deploy/backup/configura-drive.sh` e poi imposta `OFFSITE_BACKUP="google-drive"` in `deploy/.env`, così l'informativa privacy lo dichiara. Ripristino: `deploy/backup/RIPRISTINO.md`.

## Aggiornare
```bash
bash /opt/sharebox/deploy/aggiorna.sh
```
Scarica la versione nuova, ricostruisce e riavvia. Dati, configurazione e backup restano.

## Se qualcosa non va
| Sintomo | Dove guardare |
|---|---|
| La piattaforma non risponde in HTTPS | `cd /opt/sharebox/deploy && docker compose logs caddy`: di solito DNS non ancora propagato o token DuckDNS sbagliato |
| "Accesso non riuscito" dopo il login Google | `docker compose logs platform`: `invalid_client` = client secret sbagliato; `redirect_uri_mismatch` = URI di reindirizzamento diverso da `https://<piattaforma>/auth/callback` |
| Un tool non parte | Dashboard → il tool → *Stato* e *Log recenti* |
| Dubbi sull'isolamento | `bash /opt/sharebox/deploy/checks/isolamento.sh` (servono almeno due tool pubblicati) |

Il gestore di un'istanza è responsabile dei dati dei suoi utenti: le pagine `deploy/site/` (home e informativa privacy) sono un punto di partenza, da adattare con un consulente se l'istanza è aperta ad altre persone.
