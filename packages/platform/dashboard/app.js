// Dashboard di ShareBox. Nessuna dipendenza; i dati degli utenti entrano nel DOM solo come testo.
"use strict";

const view = document.getElementById("view");
let me = null;

// ---------- lingua ----------

// Italiano se il browser è in italiano, altrimenti inglese. Gli errori dell'API arrivano già
// nella stessa lingua, perché il browser manda Accept-Language.
const LANG = /^it\b/i.test(navigator.language || "") ? "it" : "en";

const TEXT = {
  it: {
    loading: "Caricamento…",
    logout: "Esci",
    session_expired: "Sessione scaduta",
    error_status: "Errore {status}",
    never: "mai",
    now: "adesso",
    role_use: "Può usare",
    role_manage: "Può gestire",
    grant_anyone: "Chiunque abbia il link",
    grant_domain: "Tutti gli account @{domain}",
    badge_suspended: "Sospeso",
    badge_never_published: "Mai pubblicato",
    badge_active: "Attivo",
    container_running: "In esecuzione",
    container_restarting: "Si riavvia in continuazione",
    container_exited: "Fermo",
    container_created: "Creato, non avviato",
    container_missing: "Nessun container",
    connect_install: "Installa la CLI (serve Node 20 o più recente)",
    connect_login: "Collega il computer a questa ShareBox: si apre il browser per confermare",
    connect_mcp: "Collega Claude Code agli strumenti di ShareBox (su Windows: … -- cmd /c sharebox mcp)",
    connect_title: "Come collegare un computer o un agente",
    copy: "Copia",
    command_copied: "Comando copiato",
    connect_hint: "Poi chiedi all'agente, per esempio: «creami un tracker delle ferie del team e pubblicalo su ShareBox».",
    published_ago: " · pubblicato {when}",
    by_owner: "di {owner}",
    no_tools_yet: "Non hai ancora pubblicato tool.",
    not_creator: "Il tuo account non è abilitato a pubblicare tool: puoi usare quelli condivisi con te.",
    publish_help_before: "Chiedi a un agente collegato a ShareBox di costruire e pubblicare un tool, oppure da terminale ",
    publish_help_folder: "cartella",
    publish_help_after: ". Per collegare il tuo computer vedi sotto.",
    your_tools: "I tuoi tool",
    tool_count: "{count} tool",
    shared_with_you: "Condivisi con te",
    nothing_shared: "Nessun tool condiviso con te per ora. Quando qualcuno ti condivide un tool, lo trovi qui.",
    computers: "Computer collegati",
    token_sub: "Collegato {created} · ultimo uso {used}",
    disconnect_confirm: "Scollegare \"{name}\"? Quel computer (o agente) non potrà più pubblicare finché non rifà sharebox login.",
    disconnected: "Computer scollegato",
    disconnect: "Scollega",
    no_computers: "Nessun computer collegato. Per collegarne uno: ",
    all_tools: "← Tutti i tool",
    link_copied: "Link copiato",
    copy_link: "Copia link",
    status: "Stato",
    activity: "Attività",
    share_placeholder: "email, @dominio.it oppure chiunque",
    share_with: "Con chi condividere",
    role: "Ruolo",
    share_invalid: "Scrivi un'email, @dominio.it oppure chiunque",
    shared_now: "Condiviso: vale da subito",
    you: " (tu)",
    owner: "Proprietario",
    role_of: "Ruolo di {who}",
    role_updated: "Ruolo aggiornato",
    remove_access: "Togli l'accesso",
    remove_access_to: "Togli l'accesso a {who}",
    access_removed: "Accesso tolto: vale da subito",
    sharing: "Condivisione",
    private_only_you: "Privato: lo vedi solo tu.",
    share: "Condividi",
    share_hint_1: "Tutti accedono con Google. @dominio.it vale solo per gli account Google Workspace di quel dominio. ",
    share_hint_2: "Chi può gestire può anche ripubblicare e cambiare la condivisione.",
    started: "Avviato",
    restarts: "Riavvii",
    version: "Versione",
    never_published: "mai pubblicato",
    published: "Pubblicato",
    oom_warning: "L'ultima volta il tool è stato fermato perché ha superato la memoria disponibile (128 MB).",
    restarting_warning: "Il tool va in errore all'avvio: guarda i log qui sotto.",
    no_messages: "Nessun messaggio.",
    recent_logs: "Log recenti",
    refresh: "Aggiorna",
    logs_hint: "Messaggi del tool e del suo eventuale worker, compresi gli errori (in rosso). Si azzerano a ogni pubblicazione.",
    act_create: "ha creato il tool",
    act_deploy: "ha pubblicato la versione {version}",
    act_suspend: "ha sospeso il tool",
    act_resume: "ha riattivato il tool",
    act_grant_set: "ha condiviso con {who} ({role})",
    act_grant_remove: "ha tolto l'accesso a {who}",
    channel_web: "dashboard",
    channel_cli: "terminale",
    channel_mcp: "agente",
    channel_admin: "amministrazione",
    admin: "Amministrazione",
    principal_anyone: "chiunque abbia il link",
    resumed: "Tool riattivato",
    suspended: "Tool sospeso",
    resume: "Riattiva",
    suspend: "Sospendi",
    type_name: "Scrivi il nome del tool per confermare",
    delete_forever: "Elimina definitivamente",
    delete_warning: "Eliminare il tool cancella anche tutti i suoi dati, senza ritorno. Per confermare scrivi il nome del tool:",
    deleted: "Tool eliminato",
    danger_title: "Sospensione ed eliminazione",
    suspended_note: "Il tool è sospeso: chi apre il link vede un avviso. I dati restano.",
    suspend_note: "Sospendere ferma il tool per tutti, senza toccare i dati. Puoi riattivarlo quando vuoi.",
    delete_ellipsis: "Elimina…",
    owner_only_delete: "Solo il proprietario può eliminare il tool.",
    back_to_list: "Torna all'elenco",
  },
  en: {
    loading: "Loading…",
    logout: "Sign out",
    session_expired: "Session expired",
    error_status: "Error {status}",
    never: "never",
    now: "now",
    role_use: "Can use",
    role_manage: "Can manage",
    grant_anyone: "Anyone with the link",
    grant_domain: "All @{domain} accounts",
    badge_suspended: "Suspended",
    badge_never_published: "Never published",
    badge_active: "Active",
    container_running: "Running",
    container_restarting: "Keeps restarting",
    container_exited: "Stopped",
    container_created: "Created, not started",
    container_missing: "No container",
    connect_install: "Install the CLI (requires Node 20 or newer)",
    connect_login: "Connect this computer to this ShareBox: a browser opens to confirm",
    connect_mcp: "Connect Claude Code to the ShareBox tools (on Windows: … -- cmd /c sharebox mcp)",
    connect_title: "How to connect a computer or an agent",
    copy: "Copy",
    command_copied: "Command copied",
    connect_hint: "Then ask the agent, for example: “build a team vacation tracker and publish it on ShareBox”.",
    published_ago: " · published {when}",
    by_owner: "by {owner}",
    no_tools_yet: "You haven't published any tools yet.",
    not_creator: "Your account is not enabled to publish tools: you can use the ones shared with you.",
    publish_help_before: "Ask an agent connected to ShareBox to build and publish a tool, or from a terminal ",
    publish_help_folder: "folder",
    publish_help_after: ". To connect your computer, see below.",
    your_tools: "Your tools",
    tool_count: "{count} tools",
    shared_with_you: "Shared with you",
    nothing_shared: "No tools shared with you yet. When someone shares a tool with you, you'll find it here.",
    computers: "Connected computers",
    token_sub: "Connected {created} · last used {used}",
    disconnect_confirm: "Disconnect \"{name}\"? That computer (or agent) won't be able to publish until it runs sharebox login again.",
    disconnected: "Computer disconnected",
    disconnect: "Disconnect",
    no_computers: "No computers connected. To connect one: ",
    all_tools: "← All tools",
    link_copied: "Link copied",
    copy_link: "Copy link",
    status: "Status",
    activity: "Activity",
    share_placeholder: "email, @domain.com or anyone",
    share_with: "Share with",
    role: "Role",
    share_invalid: "Type an email, @domain.com or anyone",
    shared_now: "Shared: effective immediately",
    you: " (you)",
    owner: "Owner",
    role_of: "Role of {who}",
    role_updated: "Role updated",
    remove_access: "Remove access",
    remove_access_to: "Remove access for {who}",
    access_removed: "Access removed: effective immediately",
    sharing: "Sharing",
    private_only_you: "Private: only you can see it.",
    share: "Share",
    share_hint_1: "Everyone signs in with Google. @domain.com only covers Google Workspace accounts of that domain. ",
    share_hint_2: "People who can manage can also republish and change sharing.",
    started: "Started",
    restarts: "Restarts",
    version: "Version",
    never_published: "never published",
    published: "Published",
    oom_warning: "Last time the tool was stopped because it exceeded the available memory (128 MB).",
    restarting_warning: "The tool fails on startup: check the logs below.",
    no_messages: "No messages.",
    recent_logs: "Recent logs",
    refresh: "Refresh",
    logs_hint: "Messages from the tool and its worker, if any, including errors (in red). They reset on every publish.",
    act_create: "created the tool",
    act_deploy: "published version {version}",
    act_suspend: "suspended the tool",
    act_resume: "resumed the tool",
    act_grant_set: "shared with {who} ({role})",
    act_grant_remove: "removed access for {who}",
    channel_web: "dashboard",
    channel_cli: "terminal",
    channel_mcp: "agent",
    channel_admin: "administration",
    admin: "Administration",
    principal_anyone: "anyone with the link",
    resumed: "Tool resumed",
    suspended: "Tool suspended",
    resume: "Resume",
    suspend: "Suspend",
    type_name: "Type the tool's name to confirm",
    delete_forever: "Delete permanently",
    delete_warning: "Deleting the tool also erases all its data, with no way back. To confirm, type the tool's name:",
    deleted: "Tool deleted",
    danger_title: "Suspend and delete",
    suspended_note: "The tool is suspended: people opening the link see a notice. The data is kept.",
    suspend_note: "Suspending stops the tool for everyone without touching the data. You can resume it at any time.",
    delete_ellipsis: "Delete…",
    owner_only_delete: "Only the owner can delete the tool.",
    back_to_list: "Back to the list",
  },
}[LANG];

/** Testo nella lingua della pagina; {nome} viene sostituito con params.nome. */
function t(key, params = {}) {
  return TEXT[key].replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

// ---------- utilità ----------

/** Crea un elemento: h("a", { href: "/" }, "testo", altroNodo). Gli attributi on* diventano listener. */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "class") el.className = value;
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

async function api(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401) {
    location.href = "/auth/login?next=" + encodeURIComponent(location.pathname + location.hash);
    throw new Error(t("session_expired"));
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || t("error_status", { status: response.status }));
  return data;
}

let toastTimer;
function toast(message, isError = false) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = isError ? "error" : "";
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), isError ? 6000 : 3000);
}

/** Esegue un'azione mostrando l'errore all'utente invece di perderlo. */
async function attempt(action, success) {
  try {
    const result = await action();
    if (success) toast(success);
    return result;
  } catch (error) {
    toast(error.message, true);
    return undefined;
  }
}

const relative = new Intl.RelativeTimeFormat(LANG, { numeric: "auto" });
function ago(ms) {
  if (!ms) return t("never");
  const seconds = Math.round((ms - Date.now()) / 1000);
  const steps = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  return t("now");
}
const dateTime = new Intl.DateTimeFormat(LANG, { dateStyle: "medium", timeStyle: "short" });

const ROLE = { use: t("role_use"), manage: t("role_manage") };

function describeGrant(grant) {
  if (grant.type === "anyone") return t("grant_anyone");
  if (grant.type === "domain") return t("grant_domain", { domain: grant.value });
  return grant.value;
}

/** "anna@x.it" → persona, "@azienda.it" → dominio, "chiunque"/"anyone" → chiunque abbia il link. */
function parseTarget(text) {
  const value = text.trim().toLowerCase();
  if (["chiunque", "tutti", "anyone", "everyone", "link"].includes(value)) return { type: "anyone" };
  if (value.startsWith("@")) return { type: "domain", value: value.slice(1) };
  if (value.includes("@")) return { type: "user", value };
  return null;
}

function statusBadge(tool) {
  if (tool.status === "suspended") return h("span", { class: "badge warn" }, t("badge_suspended"));
  if (tool.version === null) return h("span", { class: "badge" }, t("badge_never_published"));
  return h("span", { class: "badge ok" }, t("badge_active"));
}

function containerBadge(status) {
  const labels = {
    running: ["ok", t("container_running")],
    restarting: ["danger", t("container_restarting")],
    exited: ["warn", t("container_exited")],
    created: ["warn", t("container_created")],
    missing: ["neutral", t("container_missing")],
  };
  const [kind, label] = labels[status.state] || ["warn", status.state];
  return h("span", { class: "badge " + kind }, label);
}

// ---------- home ----------

/** Comandi per collegare un computer o un agente a questa istanza (l'indirizzo è quello della pagina). */
function connectHelp(open) {
  const host = location.host;
  const steps = [
    [t("connect_install"), "npm install -g https://" + host + "/cli/sharebox.tgz"],
    [t("connect_login"), "sharebox login " + host],
    [t("connect_mcp"), "claude mcp add --scope user sharebox -- sharebox mcp"],
  ];
  return h(
    "details",
    { class: "connect", open },
    h("summary", {}, t("connect_title")),
    h(
      "ol",
      {},
      steps.map(([label, command]) =>
        h(
          "li",
          {},
          h("div", { class: "small muted" }, label),
          h(
            "div",
            { class: "cmd" },
            h("code", {}, command),
            h("button", { class: "secondary", onclick: () => attempt(() => navigator.clipboard.writeText(command), t("command_copied")) }, t("copy")),
          ),
        ),
      ),
    ),
    h("p", { class: "hint" }, t("connect_hint")),
  );
}

async function renderHome() {
  const [{ tools }, { tokens }] = await Promise.all([api("GET", "/api/tools?access=all"), api("GET", "/api/tokens")]);
  const mine = tools.filter((tool) => tool.role === "manage");
  const shared = tools.filter((tool) => tool.role === "use");

  const toolRow = (tool) =>
    h(
      "a",
      { class: "row", href: "#/tool/" + tool.id },
      h("span", { class: "row-title" }, tool.name),
      h("span", { class: "row-sub" }, tool.url.replace(/^https:\/\//, "").replace(/\/$/, ""), tool.publishedAt ? t("published_ago", { when: ago(tool.publishedAt) }) : ""),
      h("span", { class: "row-side" }, tool.owner !== me.email ? h("span", { class: "badge neutral" }, t("by_owner", { owner: tool.owner })) : null, statusBadge(tool)),
    );

  const publishHelp = h(
    "div",
    { class: "empty" },
    h("p", {}, me.creator ? t("no_tools_yet") : t("not_creator")),
    me.creator
      ? h(
          "p",
          { class: "small" },
          t("publish_help_before"),
          h("code", {}, "sharebox publish " + t("publish_help_folder")),
          t("publish_help_after"),
        )
      : null,
  );

  view.replaceChildren(
    h(
      "section",
      {},
      h("div", { class: "section-head" }, h("h2", {}, t("your_tools")), h("span", { class: "muted small" }, mine.length ? t("tool_count", { count: mine.length }) : "")),
      mine.length ? h("div", { class: "list" }, mine.map(toolRow)) : publishHelp,
    ),
    h(
      "section",
      {},
      h("div", { class: "section-head" }, h("h2", {}, t("shared_with_you"))),
      shared.length
        ? h(
            "div",
            { class: "list" },
            shared.map((tool) =>
              h(
                "a",
                { class: "row", href: tool.url, target: "_blank", rel: "noopener" },
                h("span", { class: "row-title" }, tool.name),
                h("span", { class: "row-sub" }, t("by_owner", { owner: tool.owner })),
                h("span", { class: "row-side" }, statusBadge(tool)),
              ),
            ),
          )
        : h("div", { class: "empty" }, t("nothing_shared")),
    ),
    h(
      "section",
      {},
      h("div", { class: "section-head" }, h("h2", {}, t("computers"))),
      me.creator ? connectHelp(tokens.length === 0) : null,
      tokens.length
        ? h(
            "div",
            { class: "list" },
            tokens.map((token) =>
              h(
                "div",
                { class: "row" },
                h("span", { class: "row-title" }, token.name),
                h("span", { class: "row-sub" }, t("token_sub", { created: ago(token.createdAt), used: ago(token.lastUsedAt) })),
                h(
                  "span",
                  { class: "row-side" },
                  h(
                    "button",
                    {
                      class: "secondary",
                      onclick: async () => {
                        if (!confirm(t("disconnect_confirm", { name: token.name }))) return;
                        if (await attempt(() => api("DELETE", "/api/tokens/" + token.id), t("disconnected"))) render();
                      },
                    },
                    t("disconnect"),
                  ),
                ),
              ),
            ),
          )
        : h("div", { class: "empty" }, t("no_computers"), h("code", {}, "sharebox login"), "."),
    ),
  );
}

// ---------- dettaglio di un tool ----------

async function renderTool(id) {
  const tool = await api("GET", "/api/tools/" + id);
  const isOwner = tool.owner === me.email;
  document.title = tool.name + " — ShareBox";

  const statusCard = h("div", { class: "card" }, h("h2", {}, t("status")), h("p", { class: "muted" }, t("loading")));
  const logsCard = h("div", { class: "card wide" });
  const activityCard = h("div", { class: "card" }, h("h2", {}, t("activity")), h("p", { class: "muted" }, t("loading")));

  view.replaceChildren(
    h("a", { class: "back", href: "#/" }, t("all_tools")),
    h(
      "div",
      { class: "tool-head" },
      h(
        "div",
        {},
        h("h1", {}, tool.name),
        h(
          "div",
          { class: "tool-url" },
          h("a", { href: tool.url, target: "_blank", rel: "noopener" }, tool.url),
          h("button", { class: "secondary", onclick: () => attempt(() => navigator.clipboard.writeText(tool.url), t("link_copied")) }, t("copy_link")),
        ),
      ),
      statusBadge(tool),
    ),
    h("div", { class: "grid" }, sharingCard(tool, isOwner), statusCard, logsCard, activityCard, dangerCard(tool, isOwner)),
  );

  void fillStatus(tool, statusCard);
  void fillLogs(tool, logsCard);
  void fillActivity(tool, activityCard);
}

function sharingCard(tool, isOwner) {
  const input = h("input", { name: "con", placeholder: t("share_placeholder"), autocomplete: "off", required: true, "aria-label": t("share_with") });
  const role = h("select", { "aria-label": t("role") }, h("option", { value: "use" }, ROLE.use), h("option", { value: "manage" }, ROLE.manage));

  const share = async (event) => {
    event.preventDefault();
    const target = parseTarget(input.value);
    if (!target) return toast(t("share_invalid"), true);
    if (await attempt(() => api("PUT", `/api/tools/${tool.id}/grants`, { ...target, role: role.value }), t("shared_now"))) render();
  };

  const rows = [
    h("li", {}, h("span", { class: "who" }, tool.owner, isOwner ? t("you") : ""), h("span", { class: "muted small" }, t("owner"))),
    ...tool.grants.map((grant) => {
      const select = h(
        "select",
        {
          "aria-label": t("role_of", { who: describeGrant(grant) }),
          onchange: async () => {
            const { type, value } = grant;
            if (await attempt(() => api("PUT", `/api/tools/${tool.id}/grants`, { type, value, role: select.value }), t("role_updated"))) render();
          },
        },
        h("option", { value: "use", selected: grant.role === "use" }, ROLE.use),
        h("option", { value: "manage", selected: grant.role === "manage" }, ROLE.manage),
      );
      return h(
        "li",
        {},
        h("span", { class: "who", title: describeGrant(grant) }, describeGrant(grant)),
        select,
        h(
          "button",
          {
            class: "icon",
            title: t("remove_access"),
            "aria-label": t("remove_access_to", { who: describeGrant(grant) }),
            onclick: async () => {
              const { type, value } = grant;
              if (await attempt(() => api("DELETE", `/api/tools/${tool.id}/grants`, { type, value }), t("access_removed"))) render();
            },
          },
          "✕",
        ),
      );
    }),
  ];

  return h(
    "div",
    { class: "card" },
    h("h2", {}, t("sharing")),
    tool.grants.length === 0 ? h("p", { class: "muted small" }, t("private_only_you")) : null,
    h("ul", { class: "grants" }, rows),
    h("form", { class: "inline", onsubmit: share }, input, role, h("button", { type: "submit" }, t("share"))),
    h("p", { class: "hint" }, t("share_hint_1"), t("share_hint_2")),
  );
}

async function fillStatus(tool, card) {
  const status = await api("GET", `/api/tools/${tool.id}/status`).catch((error) => ({ error: error.message }));
  const facts = h("dl", { class: "facts" });
  const add = (label, value) => facts.append(h("dt", {}, label), h("dd", {}, value));
  if (status.error) add("Container", status.error);
  else {
    add("Container", containerBadge(status));
    if (status.state === "running" && status.startedAt) add(t("started"), ago(Date.parse(status.startedAt)));
    if (status.restarts > 0) add(t("restarts"), String(status.restarts));
  }
  add(t("version"), tool.version === null ? t("never_published") : String(tool.version));
  if (tool.publishedAt) add(t("published"), dateTime.format(tool.publishedAt));
  const warnings = [];
  if (status.oomKilled) warnings.push(t("oom_warning"));
  if (status.state === "restarting") warnings.push(t("restarting_warning"));
  card.replaceChildren(h("h2", {}, t("status")), facts, ...warnings.map((text) => h("p", { class: "hint" }, text)));
}

async function fillLogs(tool, card) {
  const pre = h("pre", { class: "logs" }, t("loading"));
  const load = async () => {
    const result = await api("GET", `/api/tools/${tool.id}/logs?tail=200`).catch((error) => ({ error: error.message }));
    if (result.error) return pre.replaceChildren(result.error);
    if (result.lines.length === 0) return pre.replaceChildren(t("no_messages"));
    pre.replaceChildren(
      ...result.lines.map((line) =>
        h("div", { class: line.stream }, h("time", { datetime: line.time }, line.time ? dateTime.format(Date.parse(line.time)) : ""), line.text),
      ),
    );
    pre.scrollTop = pre.scrollHeight;
  };
  card.replaceChildren(
    h("div", { class: "section-head" }, h("h2", {}, t("recent_logs")), h("button", { class: "secondary", onclick: load }, t("refresh"))),
    pre,
    h("p", { class: "hint" }, t("logs_hint")),
  );
  await load();
}

const ACTIONS = {
  "tool.create": () => t("act_create"),
  "tool.deploy": (d) => t("act_deploy", { version: d.version }),
  "tool.suspend": () => t("act_suspend"),
  "tool.resume": () => t("act_resume"),
  "grant.set": (d) => t("act_grant_set", { who: describePrincipal(d.principal), role: ROLE[d.role].toLowerCase() }),
  "grant.remove": (d) => t("act_grant_remove", { who: describePrincipal(d.principal) }),
};
const CHANNELS = { web: t("channel_web"), cli: t("channel_cli"), mcp: t("channel_mcp"), admin: t("channel_admin") };

function describePrincipal(principal) {
  if (principal.type === "anyone") return t("principal_anyone");
  if (principal.type === "domain") return "@" + principal.domain;
  return principal.email;
}

async function fillActivity(tool, card) {
  const result = await api("GET", `/api/tools/${tool.id}/activity`).catch((error) => ({ error: error.message }));
  if (result.error) return card.replaceChildren(h("h2", {}, t("activity")), h("p", { class: "muted" }, result.error));
  card.replaceChildren(
    h("h2", {}, t("activity")),
    h(
      "ul",
      { class: "events" },
      result.events.map((event) =>
        h(
          "li",
          {},
          h("div", {}, event.actor === "admin" ? t("admin") : event.actor, " ", (ACTIONS[event.action] || (() => event.action))(event.details)),
          h("div", { class: "when" }, ago(event.at), " · ", CHANNELS[event.channel] || event.channel),
        ),
      ),
    ),
  );
}

function dangerCard(tool, isOwner) {
  const suspended = tool.status === "suspended";
  const confirmBox = h("div", { class: "confirm", hidden: true });

  const toggle = h(
    "button",
    {
      class: "secondary",
      onclick: async () => {
        toggle.disabled = true;
        const ok = await attempt(() => api("POST", `/api/tools/${tool.id}/${suspended ? "resume" : "suspend"}`), suspended ? t("resumed") : t("suspended"));
        toggle.disabled = false;
        if (ok) render();
      },
    },
    suspended ? t("resume") : t("suspend"),
  );

  const typed = h("input", { placeholder: tool.name, autocomplete: "off", "aria-label": t("type_name") });
  const remove = h("button", { class: "danger", type: "submit", disabled: true }, t("delete_forever"));
  typed.addEventListener("input", () => (remove.disabled = typed.value.trim() !== tool.name));
  confirmBox.append(
    h("p", {}, t("delete_warning")),
    h(
      "form",
      {
        class: "inline",
        onsubmit: async (event) => {
          event.preventDefault();
          remove.disabled = true;
          if (await attempt(() => api("DELETE", "/api/tools/" + tool.id), t("deleted"))) location.hash = "#/";
          else remove.disabled = false;
        },
      },
      typed,
      remove,
    ),
  );

  return h(
    "div",
    { class: "card wide danger" },
    h("h2", {}, t("danger_title")),
    h("p", { class: "muted small" }, suspended ? t("suspended_note") : t("suspend_note")),
    h(
      "div",
      { class: "danger-actions" },
      toggle,
      isOwner
        ? h("button", { class: "secondary", onclick: () => ((confirmBox.hidden = !confirmBox.hidden), typed.focus()) }, t("delete_ellipsis"))
        : h("span", { class: "muted small" }, t("owner_only_delete")),
    ),
    confirmBox,
  );
}

// ---------- avvio e navigazione ----------

async function render() {
  document.title = "ShareBox";
  const match = /^#\/tool\/([a-z0-9]+)$/.exec(location.hash);
  try {
    if (match) await renderTool(match[1]);
    else await renderHome();
  } catch (error) {
    view.replaceChildren(h("div", { class: "empty" }, error.message, " ", h("a", { href: "#/" }, t("back_to_list"))));
  }
}

window.addEventListener("hashchange", () => {
  render();
  window.scrollTo(0, 0);
});

(async () => {
  document.documentElement.lang = LANG;
  document.getElementById("logout").textContent = t("logout");
  view.replaceChildren(h("p", { class: "muted" }, t("loading")));
  try {
    me = await api("GET", "/api/me");
  } catch (error) {
    view.replaceChildren(h("p", {}, error.message));
    return;
  }
  document.getElementById("account-name").textContent = me.name ? `${me.name} · ${me.email}` : me.email;
  render();
})();
