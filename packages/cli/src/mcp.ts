// Server MCP su stdio (`sharebox mcp`): JSON-RPC 2.0, un messaggio per riga.
// Non c'è uno strumento per eliminare i tool: cancella i dati, quindi resta solo nella CLI con conferma.
import { createInterface } from "node:readline";
import type { ShareboxClient } from "./client";
import { GUIDE, MCP_INSTRUCTIONS } from "./guide";
import { describeGrant, describeRole, formatBytes, parseRole, parseTarget, publish, resolveTool } from "./operations";
import { initProject } from "./template";

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const TOOL_REF = "Il tool: percorso assoluto della sua cartella, oppure id, indirizzo o nome.";

export const TOOLS = [
  {
    name: "sharebox_guida",
    description: "Istruzioni per costruire un tool per ShareBox: struttura, SDK per identità e dati, worker opzionale, limiti. Da leggere prima di scrivere il tool.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sharebox_crea_progetto",
    description: "Crea una cartella di partenza per un tool nuovo (sharebox.json e public/index.html con un esempio che usa l'SDK).",
    inputSchema: {
      type: "object",
      properties: {
        cartella: { type: "string", description: "Percorso assoluto di una cartella nuova o vuota." },
        nome: { type: "string", description: "Nome del tool, visibile agli utenti." },
      },
      required: ["cartella", "nome"],
    },
  },
  {
    name: "sharebox_pubblica",
    description:
      "Pubblica la cartella di un tool. La prima volta crea il tool e un indirizzo HTTPS proprio; le volte successive aggiorna lo stesso tool mantenendo indirizzo e dati. Il tool nasce privato.",
    inputSchema: {
      type: "object",
      properties: {
        cartella: { type: "string", description: "Percorso assoluto della cartella del tool." },
        nome: { type: "string", description: "Nome del tool, solo alla prima pubblicazione (altrimenti quello di sharebox.json)." },
      },
      required: ["cartella"],
    },
  },
  {
    name: "sharebox_elenco",
    description: "Elenca i tool che l'utente può gestire, con indirizzo e versione.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sharebox_dettagli",
    description: "Dettagli di un tool: indirizzo, versione e con chi è condiviso.",
    inputSchema: { type: "object", properties: { tool: { type: "string", description: TOOL_REF } }, required: ["tool"] },
  },
  {
    name: "sharebox_condividi",
    description: "Condivide un tool (o cambia il ruolo di una condivisione esistente). Ha effetto immediato.",
    inputSchema: {
      type: "object",
      properties: {
        tool: { type: "string", description: TOOL_REF },
        con: {
          type: "string",
          description: 'Un\'email ("anna@azienda.com"), un dominio ("@azienda.com": tutti gli account Google Workspace di quel dominio) oppure "chiunque" (chiunque abbia il link, con login Google).',
        },
        ruolo: { type: "string", enum: ["use", "manage"], description: '"use" = può usare (predefinito); "manage" = può anche ripubblicare e condividere.' },
      },
      required: ["tool", "con"],
    },
  },
  {
    name: "sharebox_revoca",
    description: "Toglie una condivisione. Ha effetto immediato.",
    inputSchema: {
      type: "object",
      properties: {
        tool: { type: "string", description: TOOL_REF },
        con: { type: "string", description: 'L\'email, "@dominio" oppure "chiunque", come indicato nella condivisione.' },
      },
      required: ["tool", "con"],
    },
  },
] as const;

export interface McpDeps {
  /** Client autenticato; lancia un errore comprensibile se manca il login. */
  client: () => Promise<ShareboxClient>;
  version: string;
}

export function createMcpHandler(deps: McpDeps) {
  async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const text = (key: string) => {
      const value = args[key];
      if (typeof value !== "string" || !value.trim()) throw new Error(`Parametro mancante: ${key}`);
      return value.trim();
    };
    const optional = (key: string) => (typeof args[key] === "string" && (args[key] as string).trim() ? (args[key] as string).trim() : undefined);

    switch (name) {
      case "sharebox_guida":
        return GUIDE;
      case "sharebox_crea_progetto": {
        const folder = await initProject(text("cartella"), text("nome"));
        return `Creata ${folder}. Modifica public/index.html per costruire il tool, poi pubblicalo con sharebox_pubblica.`;
      }
      case "sharebox_pubblica": {
        const client = await deps.client();
        const r = await publish(client, text("cartella"), { name: optional("nome") });
        const parts = [
          `${r.created ? "Tool creato e pubblicato" : "Tool aggiornato"}: ${r.tool.name}`,
          `Indirizzo: ${r.tool.url}`,
          `Versione ${r.tool.version}: ${r.files} file (${formatBytes(r.bytes)})${r.worker ? " + worker" : ""}`,
        ];
        if (r.created) parts.push("Il tool è privato: per ora lo vede solo chi l'ha pubblicato. Per condividerlo usa sharebox_condividi.");
        return parts.join("\n");
      }
      case "sharebox_elenco": {
        const tools = await (await deps.client()).listTools();
        if (tools.length === 0) return "Nessun tool.";
        return tools.map((t) => `${t.name} — ${t.url} (versione ${t.version ?? "mai pubblicato"}${t.status === "suspended" ? ", sospeso" : ""}, id ${t.id})`).join("\n");
      }
      case "sharebox_dettagli": {
        const client = await deps.client();
        return describeTool(await client.getTool(await resolveTool(client, text("tool"))));
      }
      case "sharebox_condividi": {
        // Prima i parametri, poi le chiamate: gli errori devono indicare cosa manca davvero.
        const target = parseTarget(text("con"));
        const role = parseRole(optional("ruolo"));
        const client = await deps.client();
        const id = await resolveTool(client, text("tool"));
        const tool = await client.share(id, target, role);
        return `Condiviso con ${describeGrant(target)} (${describeRole(role)}), con effetto immediato.\n\n${describeTool(tool)}`;
      }
      case "sharebox_revoca": {
        const target = parseTarget(text("con"));
        const client = await deps.client();
        const id = await resolveTool(client, text("tool"));
        const tool = await client.unshare(id, target);
        return `Accesso tolto a ${describeGrant(target)}, con effetto immediato.\n\n${describeTool(tool)}`;
      }
      default:
        throw new Error(`Strumento sconosciuto: ${name}`);
    }
  }

  return async function handle(message: JsonRpcMessage): Promise<object | null> {
    const reply = (result: object) => ({ jsonrpc: "2.0", id: message.id, result });
    const isNotification = message.id === undefined || message.id === null;

    switch (message.method) {
      case "initialize":
        return reply({
          protocolVersion: (message.params?.protocolVersion as string | undefined) ?? "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "sharebox", version: deps.version },
          instructions: MCP_INSTRUCTIONS,
        });
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: TOOLS });
      case "tools/call": {
        const name = String(message.params?.name ?? "");
        const args = (message.params?.arguments ?? {}) as Record<string, unknown>;
        try {
          return reply({ content: [{ type: "text", text: await callTool(name, args) }] });
        } catch (error) {
          return reply({ content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true });
        }
      }
      default:
        if (isNotification) return null;
        return { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `Metodo non supportato: ${message.method}` } };
    }
  };
}

function describeTool(tool: { name: string; url: string; version: number | null; owner: string; grants?: { type: "user" | "domain" | "anyone"; value?: string; role: "use" | "manage" }[] }): string {
  const grants = tool.grants ?? [];
  const lines = [
    `${tool.name} — ${tool.url}`,
    `Versione: ${tool.version ?? "mai pubblicato"}; proprietario: ${tool.owner}`,
    grants.length === 0 ? "Condiviso con: nessuno (privato)" : "Condiviso con:",
    ...grants.map((g) => `- ${describeGrant(g)}: ${describeRole(g.role)}`),
  ];
  return lines.join("\n");
}

/** Legge messaggi JSON-RPC da stdin e scrive le risposte su stdout. I log vanno solo su stderr. */
export function serveStdio(handle: (message: JsonRpcMessage) => Promise<object | null>): void {
  const lines = createInterface({ input: process.stdin });
  lines.on("line", (line) => {
    if (!line.trim()) return;
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line) as JsonRpcMessage;
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON non valido" } })}\n`);
      return;
    }
    handle(message).then(
      (response) => {
        if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
      },
      (error: unknown) => console.error(error),
    );
  });
}
