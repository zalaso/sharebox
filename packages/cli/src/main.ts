// Comando `sharebox`.
import { ShareboxClient, ShareboxError } from "./client";
import { clearCredentials, loadCredentials, normalizeUrl, saveCredentials } from "./config";
import { guide } from "./guide";
import { lang, m } from "./i18n";
import { browserLogin } from "./login";
import { createMcpHandler, serveStdio } from "./mcp";
import { ProjectError } from "./project";
import { describeGrant, describeRole, formatBytes, parseRole, parseTarget, publish, resolveTool } from "./operations";
import { initProject } from "./template";

export const VERSION = "0.1.0";

const HELP = {
  it: `ShareBox ${VERSION} — pubblica e condividi tool web

  sharebox login <indirizzo>              collega questo computer a una ShareBox (apre il browser),
                                          es. sharebox login sharebox.example.com
  sharebox logout                         scollega questo computer
  sharebox whoami                         mostra l'account collegato
  sharebox init <cartella> [--name N]     crea un tool nuovo da un modello
  sharebox publish [cartella] [--name N]  pubblica o aggiorna (predefinita: cartella corrente)
  sharebox list                           i tool che puoi gestire
  sharebox info <tool>                    indirizzo, versione e condivisioni
  sharebox share <tool> <con> [--role use|manage]
                                          con: email, @dominio.it oppure chiunque
  sharebox unshare <tool> <con>           toglie una condivisione
  sharebox delete <tool> --yes            elimina tool e dati, senza ritorno
  sharebox guide                          istruzioni per costruire un tool (per agenti)
  sharebox mcp                            server MCP su stdio, per gli agenti

<tool> può essere la cartella del tool, l'id, l'indirizzo o il nome.
Opzioni: --json per l'output in JSON.
Variabili: SHAREBOX_URL, SHAREBOX_TOKEN, SHAREBOX_LANG (it oppure en).`,
  en: `ShareBox ${VERSION} — publish and share web tools

  sharebox login <address>                connect this computer to a ShareBox (opens the browser),
                                          e.g. sharebox login sharebox.example.com
  sharebox logout                         disconnect this computer
  sharebox whoami                         show the connected account
  sharebox init <folder> [--name N]       create a new tool from a template
  sharebox publish [folder] [--name N]    publish or update (default: current folder)
  sharebox list                           the tools you can manage
  sharebox info <tool>                    address, version and shares
  sharebox share <tool> <with> [--role use|manage]
                                          with: email, @domain.com or anyone
  sharebox unshare <tool> <with>          remove a share
  sharebox delete <tool> --yes            delete the tool and its data, for good
  sharebox guide                          how to build a tool (for agents)
  sharebox mcp                            MCP server on stdio, for agents

<tool> can be the tool's folder, id, address or name.
Options: --json for JSON output.
Variables: SHAREBOX_URL, SHAREBOX_TOKEN, SHAREBOX_LANG (it or en).`,
};

interface Parsed {
  positional: string[];
  flags: Record<string, string | true>;
}

function parseArgs(argv: string[]): Parsed {
  const parsed: Parsed = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      parsed.positional.push(arg);
      continue;
    }
    const [key, inline] = arg.slice(2).split("=", 2) as [string, string | undefined];
    if (inline !== undefined) parsed.flags[key] = inline;
    else if (["name", "role"].includes(key) && argv[i + 1] !== undefined) parsed.flags[key] = argv[++i]!;
    else parsed.flags[key] = true;
  }
  return parsed;
}

async function authenticatedClient(channel: "cli" | "mcp" = "cli"): Promise<ShareboxClient> {
  const { url, token } = await loadCredentials();
  if (!url || !token) throw new ProjectError(m("not_logged_in"));
  return new ShareboxClient(url, token, fetch, channel);
}

export async function main(argv: string[]): Promise<number> {
  const { positional, flags } = parseArgs(argv);
  const [command, ...args] = flags.version === true ? ["version"] : flags.help === true ? ["help"] : positional;
  const json = flags.json === true;
  const print = (human: string, data?: unknown) => console.log(json && data !== undefined ? JSON.stringify(data, null, 2) : human);
  const flag = (name: string) => (typeof flags[name] === "string" ? (flags[name] as string) : undefined);
  const need = (value: string | undefined, what: Parameters<typeof m>[0]) => {
    if (!value) throw new ProjectError(m("missing", { what: m(what) }));
    return value;
  };

  switch (command) {
    case undefined:
    case "help":
      console.log(HELP[lang()]);
      return 0;

    case "version":
      console.log(VERSION);
      return 0;

    case "login": {
      const saved = await loadCredentials();
      const target = args[0] ?? saved.url;
      if (!target) throw new ProjectError(m("login_which"));
      const url = normalizeUrl(target);
      const token = await browserLogin(url, {
        onUrl: (address) => console.error(m("login_opening", { address })),
      });
      const file = await saveCredentials({ url, token });
      const me = await new ShareboxClient(url, token).me();
      print(m("logged_in", { url, email: me.email, note: me.creator ? "" : m("logged_in_not_creator"), file }), { url, ...me });
      return 0;
    }

    case "logout": {
      const { url, token } = await loadCredentials();
      if (url && token) await new ShareboxClient(url, token).revokeToken().catch(() => undefined);
      await clearCredentials();
      print(m("logged_out"));
      return 0;
    }

    case "whoami": {
      const me = await (await authenticatedClient()).me();
      print(`${me.name} <${me.email}>${me.creator ? m("whoami_creator") : ""}`, me);
      return 0;
    }

    case "init": {
      const dir = need(args[0], "what_new_folder");
      const folder = await initProject(dir, flag("name") ?? dir.split(/[\\/]/).filter(Boolean).pop()!);
      print(m("init_done", { folder, dir }), { folder });
      return 0;
    }

    case "publish": {
      const dir = args[0] ?? ".";
      const result = await publish(await authenticatedClient(), dir, { name: flag("name") });
      const lines = [
        m(result.created ? "published" : "updated", { name: result.tool.name, url: result.tool.url }),
        m("version_line", { version: result.tool.version ?? "-", files: result.files, size: formatBytes(result.bytes), worker: result.worker ? " + worker" : "" }),
      ];
      if (result.created) lines.push(m("private_hint", { dir }));
      print(lines.join("\n"), result);
      return 0;
    }

    case "list": {
      const tools = await (await authenticatedClient()).listTools();
      print(
        tools.length === 0
          ? m("no_tools")
          : tools
              .map((t) => {
                const status = m(t.status === "active" ? "status_active" : "status_suspended");
                return `${t.name}\n  ${t.url}\n  ${m("list_line", { id: t.id, version: t.version ?? "-", status })}`;
              })
              .join("\n"),
        tools,
      );
      return 0;
    }

    case "info": {
      const client = await authenticatedClient();
      const tool = await client.getTool(await resolveTool(client, need(args[0], "what_tool")));
      const grants = tool.grants ?? [];
      print(
        [
          `${tool.name} — ${tool.url}`,
          m("info_line", { id: tool.id, version: tool.version ?? "-", owner: tool.owner }),
          grants.length === 0 ? m("info_private") : m("info_shared_with"),
          ...grants.map((g) => `  ${describeGrant(g)}: ${describeRole(g.role)}`),
        ].join("\n"),
        tool,
      );
      return 0;
    }

    case "share": {
      const client = await authenticatedClient();
      const id = await resolveTool(client, need(args[0], "what_tool"));
      const target = parseTarget(need(args[1], "what_share_target"));
      const role = parseRole(flag("role"));
      const tool = await client.share(id, target, role);
      print(m("shared", { name: tool.name, who: describeGrant(target), role: describeRole(role) }), tool);
      return 0;
    }

    case "unshare": {
      const client = await authenticatedClient();
      const id = await resolveTool(client, need(args[0], "what_tool"));
      const target = parseTarget(need(args[1], "what_unshare_target"));
      const tool = await client.unshare(id, target);
      print(m("unshared", { name: tool.name, who: describeGrant(target) }), tool);
      return 0;
    }

    case "delete": {
      const client = await authenticatedClient();
      const ref = need(args[0], "what_tool");
      const id = await resolveTool(client, ref);
      if (flags.yes !== true) {
        const tool = await client.getTool(id);
        console.error(m("delete_confirm", { name: tool.name, url: tool.url, ref }));
        return 1;
      }
      await client.deleteTool(id);
      print(m("deleted"), { deleted: id });
      return 0;
    }

    case "guide":
      console.log(guide(lang()));
      return 0;

    case "mcp":
      serveStdio(createMcpHandler({ client: () => authenticatedClient("mcp"), version: VERSION }));
      return -1; // resta in esecuzione

    default:
      console.error(`${m("unknown_command", { command })}\n\n${HELP[lang()]}`);
      return 1;
  }
}

export async function run(argv: string[]): Promise<void> {
  try {
    const code = await main(argv);
    if (code >= 0) process.exitCode = code;
  } catch (error) {
    if (error instanceof ShareboxError || error instanceof ProjectError) {
      console.error(error.message);
      if (error instanceof ShareboxError && error.status === 401) console.error(m("run_login"));
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  }
}
