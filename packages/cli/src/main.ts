// Comando `sharebox`.
import { ShareboxClient, ShareboxError } from "./client";
import { clearCredentials, loadCredentials, normalizeUrl, saveCredentials } from "./config";
import { GUIDE } from "./guide";
import { browserLogin } from "./login";
import { createMcpHandler, serveStdio } from "./mcp";
import { ProjectError } from "./project";
import { describeGrant, describeRole, formatBytes, parseRole, parseTarget, publish, resolveTool } from "./operations";
import { initProject } from "./template";

export const VERSION = "0.1.0";

const HELP = `ShareBox ${VERSION} — pubblica e condividi tool web

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
Opzioni: --json per l'output in JSON. Variabili: SHAREBOX_URL, SHAREBOX_TOKEN.`;

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
  if (!url || !token) throw new ProjectError("Questo computer non è collegato a ShareBox: esegui prima `sharebox login <indirizzo della tua ShareBox>`");
  return new ShareboxClient(url, token, fetch, channel);
}

export async function main(argv: string[]): Promise<number> {
  const { positional, flags } = parseArgs(argv);
  const [command, ...args] = flags.version === true ? ["version"] : flags.help === true ? ["help"] : positional;
  const json = flags.json === true;
  const print = (human: string, data?: unknown) => console.log(json && data !== undefined ? JSON.stringify(data, null, 2) : human);
  const flag = (name: string) => (typeof flags[name] === "string" ? (flags[name] as string) : undefined);
  const need = (value: string | undefined, what: string) => {
    if (!value) throw new ProjectError(`Manca ${what}. Vedi sharebox --help`);
    return value;
  };

  switch (command) {
    case undefined:
    case "help":
      console.log(HELP);
      return 0;

    case "version":
      console.log(VERSION);
      return 0;

    case "login": {
      const saved = await loadCredentials();
      const target = args[0] ?? saved.url;
      if (!target) throw new ProjectError("Indica la ShareBox a cui collegarti, es. sharebox login sharebox.example.com");
      const url = normalizeUrl(target);
      const token = await browserLogin(url, {
        onUrl: (address) => console.error(`Si apre il browser per confermare. Se non si apre, visita:\n${address}\n`),
      });
      const file = await saveCredentials({ url, token });
      const me = await new ShareboxClient(url, token).me();
      print(`Collegato a ${url} come ${me.email}${me.creator ? "" : " (questo account non può ancora pubblicare tool)"}. Credenziali in ${file}`, { url, ...me });
      return 0;
    }

    case "logout": {
      const { url, token } = await loadCredentials();
      if (url && token) await new ShareboxClient(url, token).revokeToken().catch(() => undefined);
      await clearCredentials();
      print("Computer scollegato da ShareBox.");
      return 0;
    }

    case "whoami": {
      const me = await (await authenticatedClient()).me();
      print(`${me.name} <${me.email}>${me.creator ? ", può pubblicare tool" : ""}`, me);
      return 0;
    }

    case "init": {
      const dir = need(args[0], "la cartella del nuovo tool");
      const folder = await initProject(dir, flag("name") ?? dir.split(/[\\/]/).filter(Boolean).pop()!);
      print(`Creato ${folder}. Modifica public/index.html, poi: sharebox publish ${dir}`, { folder });
      return 0;
    }

    case "publish": {
      const result = await publish(await authenticatedClient(), args[0] ?? ".", { name: flag("name") });
      const lines = [
        `${result.created ? "Pubblicato" : "Aggiornato"} ${result.tool.name}: ${result.tool.url}`,
        `Versione ${result.tool.version} — ${result.files} file (${formatBytes(result.bytes)})${result.worker ? " + worker" : ""}`,
      ];
      if (result.created) lines.push(`Il tool è privato. Per condividerlo: sharebox share ${args[0] ?? "."} anna@azienda.com`);
      print(lines.join("\n"), result);
      return 0;
    }

    case "list": {
      const tools = await (await authenticatedClient()).listTools();
      print(
        tools.length === 0
          ? "Nessun tool."
          : tools.map((t) => `${t.name}\n  ${t.url}\n  id ${t.id} · versione ${t.version ?? "-"} · ${t.status === "active" ? "attivo" : "sospeso"}`).join("\n"),
        tools,
      );
      return 0;
    }

    case "info": {
      const client = await authenticatedClient();
      const tool = await client.getTool(await resolveTool(client, need(args[0], "il tool")));
      const grants = tool.grants ?? [];
      print(
        [
          `${tool.name} — ${tool.url}`,
          `id ${tool.id} · versione ${tool.version ?? "-"} · proprietario ${tool.owner}`,
          grants.length === 0 ? "Privato: non condiviso con nessuno" : "Condiviso con:",
          ...grants.map((g) => `  ${describeGrant(g)}: ${describeRole(g.role)}`),
        ].join("\n"),
        tool,
      );
      return 0;
    }

    case "share": {
      const client = await authenticatedClient();
      const id = await resolveTool(client, need(args[0], "il tool"));
      const target = parseTarget(need(args[1], "con chi condividere (email, @dominio o chiunque)"));
      const role = parseRole(flag("role"));
      const tool = await client.share(id, target, role);
      print(`${tool.name}: condiviso con ${describeGrant(target)} (${describeRole(role)}). Effetto immediato.`, tool);
      return 0;
    }

    case "unshare": {
      const client = await authenticatedClient();
      const id = await resolveTool(client, need(args[0], "il tool"));
      const target = parseTarget(need(args[1], "la condivisione da togliere"));
      const tool = await client.unshare(id, target);
      print(`${tool.name}: tolto l'accesso a ${describeGrant(target)}. Effetto immediato.`, tool);
      return 0;
    }

    case "delete": {
      const client = await authenticatedClient();
      const id = await resolveTool(client, need(args[0], "il tool"));
      if (flags.yes !== true) {
        const tool = await client.getTool(id);
        console.error(`Eliminare ${tool.name} (${tool.url}) cancella anche tutti i suoi dati, senza ritorno.\nPer confermare: sharebox delete ${args[0]} --yes`);
        return 1;
      }
      await client.deleteTool(id);
      print("Tool eliminato con i suoi dati.", { deleted: id });
      return 0;
    }

    case "guide":
      console.log(GUIDE);
      return 0;

    case "mcp":
      serveStdio(createMcpHandler({ client: () => authenticatedClient("mcp"), version: VERSION }));
      return -1; // resta in esecuzione

    default:
      console.error(`Comando sconosciuto: ${command}\n\n${HELP}`);
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
      if (error instanceof ShareboxError && error.status === 401) console.error("Esegui `sharebox login`.");
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  }
}
