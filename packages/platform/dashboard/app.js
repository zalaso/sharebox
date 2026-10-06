// Dashboard di ShareBox. Nessuna dipendenza; i dati degli utenti entrano nel DOM solo come testo.
"use strict";

const view = document.getElementById("view");
let me = null;

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
    throw new Error("Sessione scaduta");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Errore " + response.status);
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

const relative = new Intl.RelativeTimeFormat("it", { numeric: "auto" });
function ago(ms) {
  if (!ms) return "mai";
  const seconds = Math.round((ms - Date.now()) / 1000);
  const steps = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  return "adesso";
}
const dateTime = new Intl.DateTimeFormat("it", { dateStyle: "medium", timeStyle: "short" });

const ROLE = { use: "Può usare", manage: "Può gestire" };

function describeGrant(grant) {
  if (grant.type === "anyone") return "Chiunque abbia il link";
  if (grant.type === "domain") return "Tutti gli account @" + grant.value;
  return grant.value;
}

/** "anna@x.it" → persona, "@azienda.it" → dominio, "chiunque" → chiunque abbia il link. */
function parseTarget(text) {
  const value = text.trim().toLowerCase();
  if (["chiunque", "tutti", "anyone", "link"].includes(value)) return { type: "anyone" };
  if (value.startsWith("@")) return { type: "domain", value: value.slice(1) };
  if (value.includes("@")) return { type: "user", value };
  return null;
}

function statusBadge(tool) {
  if (tool.status === "suspended") return h("span", { class: "badge warn" }, "Sospeso");
  if (tool.version === null) return h("span", { class: "badge" }, "Mai pubblicato");
  return h("span", { class: "badge ok" }, "Attivo");
}

function containerBadge(status) {
  const labels = {
    running: ["ok", "In esecuzione"],
    restarting: ["danger", "Si riavvia in continuazione"],
    exited: ["warn", "Fermo"],
    created: ["warn", "Creato, non avviato"],
    missing: ["neutral", "Nessun container"],
  };
  const [kind, label] = labels[status.state] || ["warn", status.state];
  return h("span", { class: "badge " + kind }, label);
}

// ---------- home ----------

/** Comandi per collegare un computer o un agente a questa istanza (l'indirizzo è quello della pagina). */
function connectHelp(open) {
  const host = location.host;
  const steps = [
    ["Installa la CLI (serve Node 20 o più recente)", "npm install -g https://" + host + "/cli/sharebox.tgz"],
    ["Collega il computer a questa ShareBox: si apre il browser per confermare", "sharebox login " + host],
    ["Collega Claude Code agli strumenti di ShareBox (su Windows: … -- cmd /c sharebox mcp)", "claude mcp add --scope user sharebox -- sharebox mcp"],
  ];
  return h(
    "details",
    { class: "connect", open },
    h("summary", {}, "Come collegare un computer o un agente"),
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
            h("button", { class: "secondary", onclick: () => attempt(() => navigator.clipboard.writeText(command), "Comando copiato") }, "Copia"),
          ),
        ),
      ),
    ),
    h("p", { class: "hint" }, "Poi chiedi all'agente, per esempio: «creami un tracker delle ferie del team e pubblicalo su ShareBox»."),
  );
}

async function renderHome() {
  const [{ tools }, { tokens }] = await Promise.all([api("GET", "/api/tools?access=all"), api("GET", "/api/tokens")]);
  const mine = tools.filter((t) => t.role === "manage");
  const shared = tools.filter((t) => t.role === "use");

  const toolRow = (tool) =>
    h(
      "a",
      { class: "row", href: "#/tool/" + tool.id },
      h("span", { class: "row-title" }, tool.name),
      h("span", { class: "row-sub" }, tool.url.replace(/^https:\/\//, "").replace(/\/$/, ""), tool.publishedAt ? " · pubblicato " + ago(tool.publishedAt) : ""),
      h("span", { class: "row-side" }, tool.owner !== me.email ? h("span", { class: "badge neutral" }, "di " + tool.owner) : null, statusBadge(tool)),
    );

  const publishHelp = h(
    "div",
    { class: "empty" },
    h("p", {}, me.creator ? "Non hai ancora pubblicato tool." : "Il tuo account non è abilitato a pubblicare tool: puoi usare quelli condivisi con te."),
    me.creator
      ? h(
          "p",
          { class: "small" },
          "Chiedi a un agente collegato a ShareBox di costruire e pubblicare un tool, oppure da terminale ",
          h("code", {}, "sharebox publish cartella"),
          ". Per collegare il tuo computer vedi sotto.",
        )
      : null,
  );

  view.replaceChildren(
    h(
      "section",
      {},
      h("div", { class: "section-head" }, h("h2", {}, "I tuoi tool"), h("span", { class: "muted small" }, mine.length ? mine.length + (mine.length === 1 ? " tool" : " tool") : "")),
      mine.length ? h("div", { class: "list" }, mine.map(toolRow)) : publishHelp,
    ),
    h(
      "section",
      {},
      h("div", { class: "section-head" }, h("h2", {}, "Condivisi con te")),
      shared.length
        ? h(
            "div",
            { class: "list" },
            shared.map((tool) =>
              h(
                "a",
                { class: "row", href: tool.url, target: "_blank", rel: "noopener" },
                h("span", { class: "row-title" }, tool.name),
                h("span", { class: "row-sub" }, "di " + tool.owner),
                h("span", { class: "row-side" }, statusBadge(tool)),
              ),
            ),
          )
        : h("div", { class: "empty" }, "Nessun tool condiviso con te per ora. Quando qualcuno ti condivide un tool, lo trovi qui."),
    ),
    h(
      "section",
      {},
      h("div", { class: "section-head" }, h("h2", {}, "Computer collegati")),
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
                h("span", { class: "row-sub" }, "Collegato " + ago(token.createdAt) + " · ultimo uso " + ago(token.lastUsedAt)),
                h(
                  "span",
                  { class: "row-side" },
                  h(
                    "button",
                    {
                      class: "secondary",
                      onclick: async () => {
                        if (!confirm(`Scollegare "${token.name}"? Quel computer (o agente) non potrà più pubblicare finché non rifà sharebox login.`)) return;
                        if (await attempt(() => api("DELETE", "/api/tokens/" + token.id), "Computer scollegato")) render();
                      },
                    },
                    "Scollega",
                  ),
                ),
              ),
            ),
          )
        : h("div", { class: "empty" }, "Nessun computer collegato. Per collegarne uno: ", h("code", {}, "sharebox login"), "."),
    ),
  );
}

// ---------- dettaglio di un tool ----------

async function renderTool(id) {
  const tool = await api("GET", "/api/tools/" + id);
  const isOwner = tool.owner === me.email;
  document.title = tool.name + " — ShareBox";

  const statusCard = h("div", { class: "card" }, h("h2", {}, "Stato"), h("p", { class: "muted" }, "Caricamento…"));
  const logsCard = h("div", { class: "card wide" });
  const activityCard = h("div", { class: "card" }, h("h2", {}, "Attività"), h("p", { class: "muted" }, "Caricamento…"));

  view.replaceChildren(
    h("a", { class: "back", href: "#/" }, "← Tutti i tool"),
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
          h("button", { class: "secondary", onclick: () => attempt(() => navigator.clipboard.writeText(tool.url), "Link copiato") }, "Copia link"),
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
  const input = h("input", { name: "con", placeholder: "email, @dominio.it oppure chiunque", autocomplete: "off", required: true, "aria-label": "Con chi condividere" });
  const role = h("select", { "aria-label": "Ruolo" }, h("option", { value: "use" }, ROLE.use), h("option", { value: "manage" }, ROLE.manage));

  const share = async (event) => {
    event.preventDefault();
    const target = parseTarget(input.value);
    if (!target) return toast("Scrivi un'email, @dominio.it oppure chiunque", true);
    if (await attempt(() => api("PUT", `/api/tools/${tool.id}/grants`, { ...target, role: role.value }), "Condiviso: vale da subito")) render();
  };

  const rows = [
    h("li", {}, h("span", { class: "who" }, tool.owner, isOwner ? " (tu)" : ""), h("span", { class: "muted small" }, "Proprietario")),
    ...tool.grants.map((grant) => {
      const select = h(
        "select",
        {
          "aria-label": "Ruolo di " + describeGrant(grant),
          onchange: async () => {
            const { type, value } = grant;
            if (await attempt(() => api("PUT", `/api/tools/${tool.id}/grants`, { type, value, role: select.value }), "Ruolo aggiornato")) render();
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
            title: "Togli l'accesso",
            "aria-label": "Togli l'accesso a " + describeGrant(grant),
            onclick: async () => {
              const { type, value } = grant;
              if (await attempt(() => api("DELETE", `/api/tools/${tool.id}/grants`, { type, value }), "Accesso tolto: vale da subito")) render();
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
    h("h2", {}, "Condivisione"),
    tool.grants.length === 0 ? h("p", { class: "muted small" }, "Privato: lo vedi solo tu.") : null,
    h("ul", { class: "grants" }, rows),
    h("form", { class: "inline", onsubmit: share }, input, role, h("button", { type: "submit" }, "Condividi")),
    h(
      "p",
      { class: "hint" },
      "Tutti accedono con Google. @dominio.it vale solo per gli account Google Workspace di quel dominio. ",
      "Chi può gestire può anche ripubblicare e cambiare la condivisione.",
    ),
  );
}

async function fillStatus(tool, card) {
  const status = await api("GET", `/api/tools/${tool.id}/status`).catch((error) => ({ error: error.message }));
  const facts = h("dl", { class: "facts" });
  const add = (label, value) => facts.append(h("dt", {}, label), h("dd", {}, value));
  if (status.error) add("Container", status.error);
  else {
    add("Container", containerBadge(status));
    if (status.state === "running" && status.startedAt) add("Avviato", ago(Date.parse(status.startedAt)));
    if (status.restarts > 0) add("Riavvii", String(status.restarts));
  }
  add("Versione", tool.version === null ? "mai pubblicato" : String(tool.version));
  if (tool.publishedAt) add("Pubblicato", dateTime.format(tool.publishedAt));
  const warnings = [];
  if (status.oomKilled) warnings.push("L'ultima volta il tool è stato fermato perché ha superato la memoria disponibile (128 MB).");
  if (status.state === "restarting") warnings.push("Il tool va in errore all'avvio: guarda i log qui sotto.");
  card.replaceChildren(h("h2", {}, "Stato"), facts, ...warnings.map((text) => h("p", { class: "hint" }, text)));
}

async function fillLogs(tool, card) {
  const pre = h("pre", { class: "logs" }, "Caricamento…");
  const load = async () => {
    const result = await api("GET", `/api/tools/${tool.id}/logs?tail=200`).catch((error) => ({ error: error.message }));
    if (result.error) return pre.replaceChildren(result.error);
    if (result.lines.length === 0) return pre.replaceChildren("Nessun messaggio.");
    pre.replaceChildren(
      ...result.lines.map((line) =>
        h("div", { class: line.stream }, h("time", { datetime: line.time }, line.time ? dateTime.format(Date.parse(line.time)) : ""), line.text),
      ),
    );
    pre.scrollTop = pre.scrollHeight;
  };
  card.replaceChildren(
    h("div", { class: "section-head" }, h("h2", {}, "Log recenti"), h("button", { class: "secondary", onclick: load }, "Aggiorna")),
    pre,
    h("p", { class: "hint" }, "Messaggi del tool e del suo eventuale worker, compresi gli errori (in rosso). Si azzerano a ogni pubblicazione."),
  );
  await load();
}

const ACTIONS = {
  "tool.create": () => "ha creato il tool",
  "tool.deploy": (d) => `ha pubblicato la versione ${d.version}`,
  "tool.suspend": () => "ha sospeso il tool",
  "tool.resume": () => "ha riattivato il tool",
  "grant.set": (d) => `ha condiviso con ${describePrincipal(d.principal)} (${ROLE[d.role].toLowerCase()})`,
  "grant.remove": (d) => `ha tolto l'accesso a ${describePrincipal(d.principal)}`,
};
const CHANNELS = { web: "dashboard", cli: "terminale", mcp: "agente", admin: "amministrazione" };

function describePrincipal(principal) {
  if (principal.type === "anyone") return "chiunque abbia il link";
  if (principal.type === "domain") return "@" + principal.domain;
  return principal.email;
}

async function fillActivity(tool, card) {
  const result = await api("GET", `/api/tools/${tool.id}/activity`).catch((error) => ({ error: error.message }));
  if (result.error) return card.replaceChildren(h("h2", {}, "Attività"), h("p", { class: "muted" }, result.error));
  card.replaceChildren(
    h("h2", {}, "Attività"),
    h(
      "ul",
      { class: "events" },
      result.events.map((event) =>
        h(
          "li",
          {},
          h("div", {}, event.actor === "admin" ? "Amministrazione" : event.actor, " ", (ACTIONS[event.action] || (() => event.action))(event.details)),
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
        const ok = await attempt(() => api("POST", `/api/tools/${tool.id}/${suspended ? "resume" : "suspend"}`), suspended ? "Tool riattivato" : "Tool sospeso");
        toggle.disabled = false;
        if (ok) render();
      },
    },
    suspended ? "Riattiva" : "Sospendi",
  );

  const typed = h("input", { placeholder: tool.name, autocomplete: "off", "aria-label": "Scrivi il nome del tool per confermare" });
  const remove = h("button", { class: "danger", type: "submit", disabled: true }, "Elimina definitivamente");
  typed.addEventListener("input", () => (remove.disabled = typed.value.trim() !== tool.name));
  confirmBox.append(
    h("p", {}, "Eliminare il tool cancella anche tutti i suoi dati, senza ritorno. Per confermare scrivi il nome del tool:"),
    h(
      "form",
      {
        class: "inline",
        onsubmit: async (event) => {
          event.preventDefault();
          remove.disabled = true;
          if (await attempt(() => api("DELETE", "/api/tools/" + tool.id), "Tool eliminato")) location.hash = "#/";
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
    h("h2", {}, "Sospensione ed eliminazione"),
    h(
      "p",
      { class: "muted small" },
      suspended
        ? "Il tool è sospeso: chi apre il link vede un avviso. I dati restano."
        : "Sospendere ferma il tool per tutti, senza toccare i dati. Puoi riattivarlo quando vuoi.",
    ),
    h(
      "div",
      { class: "danger-actions" },
      toggle,
      isOwner
        ? h("button", { class: "secondary", onclick: () => ((confirmBox.hidden = !confirmBox.hidden), typed.focus()) }, "Elimina…")
        : h("span", { class: "muted small" }, "Solo il proprietario può eliminare il tool."),
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
    view.replaceChildren(h("div", { class: "empty" }, error.message, " ", h("a", { href: "#/" }, "Torna all'elenco")));
  }
}

window.addEventListener("hashchange", () => {
  render();
  window.scrollTo(0, 0);
});

(async () => {
  try {
    me = await api("GET", "/api/me");
  } catch (error) {
    view.replaceChildren(h("p", {}, error.message));
    return;
  }
  document.getElementById("account-name").textContent = me.name ? `${me.name} · ${me.email}` : me.email;
  render();
})();
