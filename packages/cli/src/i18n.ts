// Messaggi della CLI e del server MCP in italiano e inglese.
// Lingua: SHAREBOX_LANG, poi le variabili di locale (LC_ALL, LC_MESSAGES, LANG), poi la lingua del sistema.
// La stessa lingua va alla piattaforma con Accept-Language, così anche i suoi errori arrivano tradotti.
import { format, pickLang, type Lang } from "@sharebox/shared";

export function detectLang(env: NodeJS.ProcessEnv = process.env): Lang {
  const candidates = [env.SHAREBOX_LANG, env.LC_ALL, env.LC_MESSAGES, env.LANG];
  // "C" e "POSIX" non dicono niente sulla lingua: si passa alla successiva.
  const explicit = candidates.find((value) => value && !/^(C|POSIX)([.@]|$)/i.test(value));
  return pickLang(explicit ?? Intl.DateTimeFormat().resolvedOptions().locale);
}

let current: Lang = detectLang();

export function lang(): Lang {
  return current;
}

/** Per i test, e per chi incorpora la CLI. */
export function setLang(value: Lang): void {
  current = value;
}

const it = {
  // main.ts
  not_logged_in: "Questo computer non è collegato a ShareBox: esegui prima `sharebox login <indirizzo della tua ShareBox>`",
  missing: "Manca {what}. Vedi sharebox --help",
  what_new_folder: "la cartella del nuovo tool",
  what_tool: "il tool",
  what_share_target: "con chi condividere (email, @dominio o chiunque)",
  what_unshare_target: "la condivisione da togliere",
  login_which: "Indica la ShareBox a cui collegarti, es. sharebox login sharebox.example.com",
  login_opening: "Si apre il browser per confermare. Se non si apre, visita:\n{address}\n",
  logged_in: "Collegato a {url} come {email}{note}. Credenziali in {file}",
  logged_in_not_creator: " (questo account non può ancora pubblicare tool)",
  logged_out: "Computer scollegato da ShareBox.",
  whoami_creator: ", può pubblicare tool",
  init_done: "Creato {folder}. Modifica public/index.html, poi: sharebox publish {dir}",
  published: "Pubblicato {name}: {url}",
  updated: "Aggiornato {name}: {url}",
  version_line: "Versione {version} — {files} file ({size}){worker}",
  private_hint: "Il tool è privato. Per condividerlo: sharebox share {dir} anna@azienda.com",
  no_tools: "Nessun tool.",
  list_line: "id {id} · versione {version} · {status}",
  status_active: "attivo",
  status_suspended: "sospeso",
  info_line: "id {id} · versione {version} · proprietario {owner}",
  info_private: "Privato: non condiviso con nessuno",
  info_shared_with: "Condiviso con:",
  shared: "{name}: condiviso con {who} ({role}). Effetto immediato.",
  unshared: "{name}: tolto l'accesso a {who}. Effetto immediato.",
  delete_confirm: "Eliminare {name} ({url}) cancella anche tutti i suoi dati, senza ritorno.\nPer confermare: sharebox delete {ref} --yes",
  deleted: "Tool eliminato con i suoi dati.",
  unknown_command: "Comando sconosciuto: {command}",
  run_login: "Esegui `sharebox login`.",
  // client.ts
  unreachable: "ShareBox non raggiungibile ({url}): {error}",
  http_error: "Errore HTTP {status}",
  // login.ts
  login_invalid: "Login non valido: riprova con sharebox login.",
  login_done_title: "Fatto",
  login_done_body: "La CLI di ShareBox è collegata. Puoi chiudere questa finestra e tornare al terminale.",
  login_timeout: "Login non completato entro 5 minuti: riprova con sharebox login",
  // operations.ts
  folder_not_found: "Cartella non trovata: {folder}",
  nothing_to_publish: "{folder} non contiene né una cartella public/ né un worker.ts: non c'è niente da pubblicare",
  id_not_here:
    "Il tool {id} indicato in sharebox.json non esiste su questa ShareBox (eliminato, o cartella pubblicata su un'altra istanza). " +
    'Per crearne uno nuovo togli la riga "id" da {file} e ripubblica.',
  not_published_yet: "{folder} non è ancora stato pubblicato (manca l'id in sharebox.json)",
  ambiguous: 'Più tool si chiamano "{ref}": usa l\'id (sharebox list)',
  tool_not_found: "Tool non trovato: {ref}",
  bad_target: 'Non capisco con chi condividere "{target}": usa un\'email, @dominio.it oppure chiunque',
  bad_role: "Ruolo non valido: {role} (use oppure manage)",
  grant_anyone: "chiunque abbia il link",
  grant_domain: "tutti gli account @{domain}",
  role_manage: "può gestire",
  role_use: "può usare",
  // project.ts
  invalid_json: "{file} non è un JSON valido",
  bad_file_name: "public/{path}: {problem}. Rinomina il file (lettere, cifre, . _ -).",
  too_many_files: "Troppi file in public/ (massimo {max})",
  too_big: "public/ supera {mb} MB",
  not_a_folder: "{path} non è una cartella",
  worker_build_failed: "Il worker non si compila:\n{detail}",
  // template.ts
  folder_not_empty: "{folder} non è vuota: scegli una cartella nuova",
  // mcp.ts
  missing_param: "Parametro mancante: {name}",
  mcp_project_created: "Creata {folder}. Modifica public/index.html per costruire il tool, poi pubblicalo con sharebox_publish.",
  mcp_created: "Tool creato e pubblicato: {name}",
  mcp_updated: "Tool aggiornato: {name}",
  mcp_address: "Indirizzo: {url}",
  mcp_version: "Versione {version}: {files} file ({size}){worker}",
  mcp_private: "Il tool è privato: per ora lo vede solo chi l'ha pubblicato. Per condividerlo usa sharebox_share.",
  mcp_list_line: "{name} — {url} (versione {version}{suspended}, id {id})",
  never_published: "mai pubblicato",
  mcp_suspended: ", sospeso",
  mcp_shared: "Condiviso con {who} ({role}), con effetto immediato.",
  mcp_unshared: "Accesso tolto a {who}, con effetto immediato.",
  mcp_unknown_tool: "Strumento sconosciuto: {name}",
  mcp_unknown_method: "Metodo non supportato: {method}",
  mcp_tool_version: "Versione: {version}; proprietario: {owner}",
  mcp_shared_none: "Condiviso con: nessuno (privato)",
  mcp_shared_with: "Condiviso con:",
};

export type CliMessage = keyof typeof it;

const en: Record<CliMessage, string> = {
  not_logged_in: "This computer is not connected to ShareBox: run `sharebox login <your ShareBox address>` first",
  missing: "Missing {what}. See sharebox --help",
  what_new_folder: "the folder for the new tool",
  what_tool: "the tool",
  what_share_target: "who to share with (email, @domain or anyone)",
  what_unshare_target: "the share to remove",
  login_which: "Say which ShareBox to connect to, e.g. sharebox login sharebox.example.com",
  login_opening: "A browser opens to confirm. If it doesn't, visit:\n{address}\n",
  logged_in: "Connected to {url} as {email}{note}. Credentials in {file}",
  logged_in_not_creator: " (this account cannot publish tools yet)",
  logged_out: "Computer disconnected from ShareBox.",
  whoami_creator: ", can publish tools",
  init_done: "Created {folder}. Edit public/index.html, then: sharebox publish {dir}",
  published: "Published {name}: {url}",
  updated: "Updated {name}: {url}",
  version_line: "Version {version} — {files} files ({size}){worker}",
  private_hint: "The tool is private. To share it: sharebox share {dir} anna@company.com",
  no_tools: "No tools.",
  list_line: "id {id} · version {version} · {status}",
  status_active: "active",
  status_suspended: "suspended",
  info_line: "id {id} · version {version} · owner {owner}",
  info_private: "Private: not shared with anyone",
  info_shared_with: "Shared with:",
  shared: "{name}: shared with {who} ({role}). Effective immediately.",
  unshared: "{name}: removed access for {who}. Effective immediately.",
  delete_confirm: "Deleting {name} ({url}) also erases all its data, with no way back.\nTo confirm: sharebox delete {ref} --yes",
  deleted: "Tool deleted along with its data.",
  unknown_command: "Unknown command: {command}",
  run_login: "Run `sharebox login`.",
  unreachable: "ShareBox unreachable ({url}): {error}",
  http_error: "HTTP error {status}",
  login_invalid: "Invalid sign-in: try again with sharebox login.",
  login_done_title: "Done",
  login_done_body: "The ShareBox CLI is connected. You can close this window and go back to the terminal.",
  login_timeout: "Sign-in not completed within 5 minutes: try again with sharebox login",
  folder_not_found: "Folder not found: {folder}",
  nothing_to_publish: "{folder} contains neither a public/ folder nor a worker.ts: there is nothing to publish",
  id_not_here:
    "The tool {id} named in sharebox.json does not exist on this ShareBox (deleted, or a folder published on another instance). " +
    'To create a new one, remove the "id" line from {file} and publish again.',
  not_published_yet: "{folder} has not been published yet (sharebox.json has no id)",
  ambiguous: 'Several tools are called "{ref}": use the id (sharebox list)',
  tool_not_found: "Tool not found: {ref}",
  bad_target: 'Don\'t know who to share with: "{target}". Use an email, @domain.com or anyone',
  bad_role: "Invalid role: {role} (use or manage)",
  grant_anyone: "anyone with the link",
  grant_domain: "all @{domain} accounts",
  role_manage: "can manage",
  role_use: "can use",
  invalid_json: "{file} is not valid JSON",
  bad_file_name: "public/{path}: {problem}. Rename the file (letters, digits, . _ -).",
  too_many_files: "Too many files in public/ (at most {max})",
  too_big: "public/ exceeds {mb} MB",
  not_a_folder: "{path} is not a folder",
  worker_build_failed: "The worker does not compile:\n{detail}",
  folder_not_empty: "{folder} is not empty: choose a new folder",
  missing_param: "Missing parameter: {name}",
  mcp_project_created: "Created {folder}. Edit public/index.html to build the tool, then publish it with sharebox_publish.",
  mcp_created: "Tool created and published: {name}",
  mcp_updated: "Tool updated: {name}",
  mcp_address: "Address: {url}",
  mcp_version: "Version {version}: {files} files ({size}){worker}",
  mcp_private: "The tool is private: for now only its publisher can see it. To share it use sharebox_share.",
  mcp_list_line: "{name} — {url} (version {version}{suspended}, id {id})",
  never_published: "never published",
  mcp_suspended: ", suspended",
  mcp_shared: "Shared with {who} ({role}), effective immediately.",
  mcp_unshared: "Removed access for {who}, effective immediately.",
  mcp_unknown_tool: "Unknown tool: {name}",
  mcp_unknown_method: "Method not supported: {method}",
  mcp_tool_version: "Version: {version}; owner: {owner}",
  mcp_shared_none: "Shared with: nobody (private)",
  mcp_shared_with: "Shared with:",
};

const MESSAGES: Record<Lang, Record<CliMessage, string>> = { it, en };

export function m(key: CliMessage, params?: Record<string, string | number>): string {
  return format(MESSAGES[current][key], params);
}
