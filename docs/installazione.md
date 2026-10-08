# Installare la propria ShareBox

*[English version](install.md)*

Ogni installazione è indipendente: il tuo server, i tuoi domini, il tuo login Google, i tuoi utenti. Tempo: circa mezz'ora, quasi tutta di configurazione di DNS e Google.

## Cosa serve
| Cosa | Note | Costo |
|---|---|---|
| Un server Linux **Ubuntu 24.04** con IP pubblico, accesso root, porte 80 e 443 libere | Basta una VPS piccola: 2 GB di RAM reggono circa 25 tool accesi insieme. Meglio un server dedicato a ShareBox | da ~4 €/mese |
| Un **dominio per la piattaforma**, es. `sharebox.tuodominio.it` | Basta un sottodominio di un dominio che hai già | quello che hai |
| Un **dominio per i tool**, diverso da quello della piattaforma | Un sottodominio **DuckDNS** gratuito (es. `nome.duckdns.org`), oppure un dominio tuo gestito da **Cloudflare** (es. `strumenti-esempio.com`) | 0 € o quello che hai |
| Un **account Google** per creare il client OAuth | Il login degli utenti passa da Google | 0 € |

Perché due domini: ogni tool è un sito a sé (`nome-tool.<dominio dei tool>`) e non deve condividere i cookie con la piattaforma ([ADR 0002](adr/0002-domini-separati.md)).

## 1. DNS
1. **Piattaforma:** nel pannello DNS del tuo dominio crea un record `A` per il nome scelto (es. `sharebox`) con l'IP del server.
2. **Tool**, una delle due:
   - **DuckDNS:** su [duckdns.org](https://www.duckdns.org) accedi, crea un sottodominio e impostane l'IP su quello del server (attenzione: il campo si compila da solo con l'IP da cui navighi). Annota il **token** mostrato in alto. DuckDNS risolve da solo ogni `qualcosa.nome.duckdns.org`: non servono altri record.
   - **Cloudflare:** nella zona del dominio crea un record `A` `*` (e, se vuoi, anche quello del dominio nudo) con l'IP del server, **senza proxy** (nuvola grigia). Poi crea un token API con permesso *Zone → DNS → Edit* limitato a quella zona.

Il certificato HTTPS dei tool è un wildcard, ottenuto con la verifica DNS: per questo serve il token.

## 2. Login con Google
In [Google Cloud Console](https://console.cloud.google.com):
1. Crea un progetto (es. "ShareBox") e apri **Google Auth Platform**.
2. **Branding:** nome dell'app, email di assistenza, dominio autorizzato = il tuo dominio (es. `tuodominio.it`), home page `https://<piattaforma>/` e informativa privacy `https://<piattaforma>/privacy` (le pagine le pubblica ShareBox stessa).
3. **Pubblico:** tipo *Esterno*; poi **Pubblica app**. Con i soli scope di base non serve la verifica di Google.
4. **Accesso ai dati:** scope `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
5. **Client:** *Applicazione web*, URI di reindirizzamento `https://<piattaforma>/auth/callback`. Copia **ID client** e **client secret** (il secret si vede una volta sola).

## 3. Installazione sul server
Da root (se manca git: `apt install -y git`):

```bash
git clone https://github.com/zalaso/sharebox /opt/sharebox
```

```bash
cd /opt/sharebox && bash deploy/install.sh
```

Lo script installa Docker e gVisor, chiede domini, provider DNS, token e dati del client Google (i segreti non vengono mostrati mentre li scrivi), controlla DNS, porte e firewall, costruisce e avvia i servizi e attiva il backup notturno. La configurazione finisce in `deploy/.env`, leggibile solo da root. Si può rilanciare senza danni.

Alla fine apri `https://<piattaforma>/app` e accedi con uno degli account indicati come creatori.

## 4. Collegare il tuo computer e gli agenti
La dashboard mostra questi comandi già completi dell'indirizzo della tua istanza (sezione *Come collegare un computer o un agente*). Sul tuo PC serve Node 20 o più recente.

```bash
npm install -g https://<piattaforma>/cli/sharebox.tgz
```

(La stessa CLI è su npm come `sharebox-cli`; la copia servita dalla tua istanza è sempre allineata alla sua versione.)

```bash
sharebox login <piattaforma>
```

Si apre il browser per confermare. Per Claude Code (su Windows: `-- cmd /c sharebox mcp`):

```bash
claude mcp add --scope user sharebox -- sharebox mcp
```

Da qui un agente può costruire, pubblicare e condividere tool. Dettagli in [cli.md](cli.md).

## 5. Facoltativo: copia dei backup su Google Drive
I backup restano 7 giorni sul server. Per una copia cifrata fuori dal server (30 giorni) segui `deploy/backup/configura-drive.sh` e poi imposta `OFFSITE_BACKUP="google-drive"` in `deploy/.env`, così l'informativa privacy lo dichiara. Ripristino: [deploy/backup/RIPRISTINO.md](../deploy/backup/RIPRISTINO.md).

## Aggiornare
```bash
bash /opt/sharebox/deploy/aggiorna.sh
```
Scarica la versione nuova, ricostruisce e riavvia. Dati, configurazione e backup restano.

## Se qualcosa non va
| Sintomo | Dove guardare |
|---|---|
| La piattaforma o i tool non rispondono in HTTPS | `cd /opt/sharebox/deploy && docker compose logs caddy`: di solito DNS non ancora propagato, token DuckDNS/Cloudflare sbagliato o record Cloudflare con il proxy attivo |
| "Accesso non riuscito" dopo il login Google | `docker compose logs platform`: `invalid_client` = client secret sbagliato; `redirect_uri_mismatch` = URI di reindirizzamento diverso da `https://<piattaforma>/auth/callback` |
| Un tool non parte | Dashboard → il tool → *Stato* e *Log recenti* |
| Dubbi sull'isolamento | `bash /opt/sharebox/deploy/checks/isolamento.sh` (servono almeno due tool pubblicati) |

Per cambiare un valore della configurazione modifica `deploy/.env` e rilancia `docker compose up -d` da `/opt/sharebox/deploy`.

Il gestore di un'istanza è responsabile dei dati dei suoi utenti: le pagine `deploy/site/` (home e informativa privacy) sono un punto di partenza, da adattare con un consulente se l'istanza è aperta ad altre persone.
