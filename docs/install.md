# Install your own ShareBox

*[Versione italiana](installazione.md)*

Every installation is independent: your server, your domains, your Google login, your users. It takes about half an hour, mostly DNS and Google setup.

> The ShareBox user interface (dashboard, CLI, installer prompts) is currently in **Italian**. This guide tells you what each prompt means.

## What you need
| What | Notes | Cost |
|---|---|---|
| An **Ubuntu 24.04** server with a public IP, root access, ports 80 and 443 free | A small VPS is enough: 2 GB of RAM run about 25 tools at once. Preferably a server dedicated to ShareBox | from ~4 €/month |
| A **platform domain**, e.g. `sharebox.example.com` | A subdomain of a domain you already own is fine | what you have |
| A **tools domain**, different from the platform's | A free **DuckDNS** subdomain (e.g. `name.duckdns.org`), or a domain of yours managed by **Cloudflare** (e.g. `tools-example.com`) | 0 € or what you have |
| A **Google account** to create the OAuth client | Users sign in with Google | 0 € |

Why two domains: each tool is its own site (`tool-name.<tools domain>`) and must not share cookies with the platform ([ADR 0002](adr/0002-domini-separati.md)).

## 1. DNS
1. **Platform:** in your domain's DNS panel, create an `A` record for the chosen name (e.g. `sharebox`) pointing to the server's IP.
2. **Tools**, one of:
   - **DuckDNS:** sign in at [duckdns.org](https://www.duckdns.org), create a subdomain and set its IP to the server's (careful: the field pre-fills with the IP you are browsing from). Note the **token** shown at the top. DuckDNS resolves any `something.name.duckdns.org` on its own: no other record needed.
   - **Cloudflare:** in the domain's zone create an `A` record `*` pointing to the server, **not proxied** (grey cloud). Then create an API token with *Zone → DNS → Edit* permission on that zone only.

The tools' HTTPS certificate is a wildcard obtained through DNS validation: that is what the token is for.

## 2. Google sign-in
In the [Google Cloud Console](https://console.cloud.google.com):
1. Create a project (e.g. "ShareBox") and open **Google Auth Platform**.
2. **Branding:** app name, support email, authorized domain = your domain (e.g. `example.com`), home page `https://<platform>/` and privacy policy `https://<platform>/privacy` (ShareBox serves both pages itself).
3. **Audience:** *External*, then **Publish app**. With basic scopes only, no Google verification is required.
4. **Data access:** scopes `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
5. **Clients:** *Web application*, authorized redirect URI `https://<platform>/auth/callback`. Copy the **client ID** and **client secret** (the secret is shown only once).

## 3. Install on the server
As root (if git is missing: `apt install -y git`):

```bash
git clone https://github.com/zalaso/sharebox /opt/sharebox
```

```bash
cd /opt/sharebox && bash deploy/install.sh
```

The script installs Docker and gVisor, then asks for (in English, or in Italian if the server's locale is Italian or `SHAREBOX_LANG=it`):

| Prompt | Meaning |
|---|---|
| *Public IP of the server* | Detected automatically: press Enter to accept |
| *Platform domain* | e.g. `sharebox.example.com` |
| *Tool certificate: duckdns or cloudflare* | DNS provider for the tools' wildcard certificate |
| *DuckDNS subdomain* / *Tools domain on Cloudflare* | Tools domain |
| *DuckDNS token* / *Cloudflare API token* | Provider token (not echoed) |
| *Google OAuth: client ID* / *client secret* | Google OAuth client (secret not echoed) |
| *Emails of the people who can publish tools* | Comma separated |
| *Name of the instance operator*, *Contact email for privacy matters*, *Where the server is* | Shown in the privacy policy |

It then checks DNS, ports and firewall, builds and starts the services and schedules the nightly backup. The configuration is written to `deploy/.env`, readable by root only. Running it again is safe.

When it finishes, open `https://<platform>/app` and sign in with one of the creator accounts.

## 4. Connect your computer and agents
The dashboard shows these commands with your instance's address filled in (*How to connect a computer or an agent*). You need Node 20 or newer.

```bash
npm install -g https://<platform>/cli/sharebox.tgz
```

(The same CLI is on npm as `sharebox-cli`; the copy served by your instance always matches its version.)

```bash
sharebox login <platform>
```

Your browser opens to confirm: click **Authorize**. For Claude Code (on Windows: `-- cmd /c sharebox mcp`):

```bash
claude mcp add --scope user sharebox -- sharebox mcp
```

From now on an agent can build, publish and share tools. CLI reference: [cli.md](cli.md) (Italian); `sharebox --help` lists every command.

## 5. Optional: copy backups to Google Drive
Backups stay on the server for 7 days. For an encrypted off-site copy (30 days) run `deploy/backup/configura-drive.sh`, then set `OFFSITE_BACKUP="google-drive"` in `deploy/.env` so the privacy policy mentions it. Restore: [deploy/backup/RIPRISTINO.md](../deploy/backup/RIPRISTINO.md) (Italian).

## Updating
```bash
bash /opt/sharebox/deploy/aggiorna.sh
```
Pulls the new version, rebuilds and restarts. Data, configuration and backups are kept.

## Troubleshooting
| Symptom | Where to look |
|---|---|
| Platform or tools not answering over HTTPS | `cd /opt/sharebox/deploy && docker compose logs caddy`: usually DNS not propagated yet, a wrong DuckDNS/Cloudflare token, or a proxied Cloudflare record |
| "Accesso non riuscito" after Google sign-in | `docker compose logs platform`: `invalid_client` = wrong client secret; `redirect_uri_mismatch` = redirect URI is not exactly `https://<platform>/auth/callback` |
| A tool does not start | Dashboard → the tool → *Stato* (status) and *Log recenti* (recent logs) |
| Doubts about isolation | `bash /opt/sharebox/deploy/checks/isolamento.sh` (needs at least two published tools) |

To change a setting, edit `deploy/.env` and run `docker compose up -d` from `/opt/sharebox/deploy`.

The operator of an instance is responsible for its users' data: the pages in `deploy/site/` (home and privacy policy, in English and Italian) are a starting point to adapt — with legal advice if the instance is open to other people.
