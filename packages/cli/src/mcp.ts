// Server MCP su stdio (`sharebox mcp`): JSON-RPC 2.0, un messaggio per riga.
// Non c'è uno strumento per eliminare i tool: cancella i dati, quindi resta solo nella CLI con conferma.
// Nomi e descrizioni degli strumenti sono in inglese (li legge l'agente); i risultati seguono la lingua della CLI.
import { createInterface } from "node:readline";
import type { ShareboxClient } from "./client";
import { MCP_INSTRUCTIONS, guide } from "./guide";
import { lang, m } from "./i18n";
import { describeGrant, describeRole, formatBytes, parseRole, parseTarget, publish, resolveTool } from "./operations";
import { initProject } from "./template";

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const TOOL_REF = "The tool: absolute path of its folder, or its id, address or name.";

export const TOOLS = [
  {
    name: "sharebox_guide",
    description: "How to build a tool for ShareBox: folder layout, SDK for identity and data, optional worker, limits. Read it before writing the tool.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sharebox_create_project",
    description: "Create a starter folder for a new tool (sharebox.json and a public/index.html example that uses the SDK).",
    inputSchema: {
      type: "object",
      properties: {
        folder: { type: "string", description: "Absolute path of a new or empty folder." },
        name: { type: "string", description: "Name of the tool, shown to its users." },
      },
      required: ["folder", "name"],
    },
  },
  {
    name: "sharebox_publish",
    description:
      "Publish a tool's folder. The first time it creates the tool with its own HTTPS address; later it updates the same tool, keeping address and data. New tools are private.",
    inputSchema: {
      type: "object",
      properties: {
        folder: { type: "string", description: "Absolute path of the tool's folder." },
        name: { type: "string", description: "Name of the tool, only on the first publish (otherwise the one in sharebox.json)." },
      },
      required: ["folder"],
    },
  },
  {
    name: "sharebox_list",
    description: "List the tools the user can manage, with address and version.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sharebox_info",
    description: "Details of a tool: address, version and who it is shared with.",
    inputSchema: { type: "object", properties: { tool: { type: "string", description: TOOL_REF } }, required: ["tool"] },
  },
  {
    name: "sharebox_share",
    description: "Share a tool (or change the role of an existing share). Takes effect immediately.",
    inputSchema: {
      type: "object",
      properties: {
        tool: { type: "string", description: TOOL_REF },
        with: {
          type: "string",
          description:
            'An email ("anna@company.com"), a domain ("@company.com": every Google Workspace account of that domain) or "anyone" (anyone with the link, still signing in with Google).',
        },
        role: { type: "string", enum: ["use", "manage"], description: '"use" = can use (default); "manage" = can also republish and share.' },
      },
      required: ["tool", "with"],
    },
  },
  {
    name: "sharebox_unshare",
    description: "Remove a share. Takes effect immediately.",
    inputSchema: {
      type: "object",
      properties: {
        tool: { type: "string", description: TOOL_REF },
        with: { type: "string", description: 'The email, "@domain" or "anyone", as in the share.' },
      },
      required: ["tool", "with"],
    },
  },
] as const;

// Nomi della prima versione, in italiano: restano accettati per chi ha già configurato un agente.
const LEGACY_TOOLS: Record<string, string> = {
  sharebox_guida: "sharebox_guide",
  sharebox_crea_progetto: "sharebox_create_project",
  sharebox_pubblica: "sharebox_publish",
  sharebox_elenco: "sharebox_list",
  sharebox_dettagli: "sharebox_info",
  sharebox_condividi: "sharebox_share",
  sharebox_revoca: "sharebox_unshare",
};
const LEGACY_ARGS: Record<string, string> = { cartella: "folder", nome: "name", con: "with", ruolo: "role" };

export interface McpDeps {
  /** Client autenticato; lancia un errore comprensibile se manca il login. */
  client: () => Promise<ShareboxClient>;
  version: string;
}

export function createMcpHandler(deps: McpDeps) {
  async function callTool(requested: string, rawArgs: Record<string, unknown>): Promise<string> {
    const name = LEGACY_TOOLS[requested] ?? requested;
    const args: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawArgs)) args[LEGACY_ARGS[key] ?? key] = value;
    const text = (key: string) => {
      const value = args[key];
      if (typeof value !== "string" || !value.trim()) throw new Error(m("missing_param", { name: key }));
      return value.trim();
    };
    const optional = (key: string) => (typeof args[key] === "string" && (args[key] as string).trim() ? (args[key] as string).trim() : undefined);

    switch (name) {
      case "sharebox_guide":
        return guide(lang());
      case "sharebox_create_project": {
        const folder = await initProject(text("folder"), text("name"));
        return m("mcp_project_created", { folder });
      }
      case "sharebox_publish": {
        const client = await deps.client();
        const r = await publish(client, text("folder"), { name: optional("name") });
        const parts = [
          m(r.created ? "mcp_created" : "mcp_updated", { name: r.tool.name }),
          m("mcp_address", { url: r.tool.url }),
          m("mcp_version", { version: r.tool.version ?? "-", files: r.files, size: formatBytes(r.bytes), worker: r.worker ? " + worker" : "" }),
        ];
        if (r.created) parts.push(m("mcp_private"));
        return parts.join("\n");
      }
      case "sharebox_list": {
        const tools = await (await deps.client()).listTools();
        if (tools.length === 0) return m("no_tools");
        return tools
          .map((t) =>
            m("mcp_list_line", {
              name: t.name,
              url: t.url,
              version: t.version ?? m("never_published"),
              suspended: t.status === "suspended" ? m("mcp_suspended") : "",
              id: t.id,
            }),
          )
          .join("\n");
      }
      case "sharebox_info": {
        const client = await deps.client();
        return describeTool(await client.getTool(await resolveTool(client, text("tool"))));
      }
      case "sharebox_share": {
        // Prima i parametri, poi le chiamate: gli errori devono indicare cosa manca davvero.
        const target = parseTarget(text("with"));
        const role = parseRole(optional("role"));
        const client = await deps.client();
        const id = await resolveTool(client, text("tool"));
        const tool = await client.share(id, target, role);
        return `${m("mcp_shared", { who: describeGrant(target), role: describeRole(role) })}\n\n${describeTool(tool)}`;
      }
      case "sharebox_unshare": {
        const target = parseTarget(text("with"));
        const client = await deps.client();
        const id = await resolveTool(client, text("tool"));
        const tool = await client.unshare(id, target);
        return `${m("mcp_unshared", { who: describeGrant(target) })}\n\n${describeTool(tool)}`;
      }
      default:
        throw new Error(m("mcp_unknown_tool", { name: requested }));
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
        return { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: m("mcp_unknown_method", { method: String(message.method) }) } };
    }
  };
}

function describeTool(tool: { name: string; url: string; version: number | null; owner: string; grants?: { type: "user" | "domain" | "anyone"; value?: string; role: "use" | "manage" }[] }): string {
  const grants = tool.grants ?? [];
  const lines = [
    `${tool.name} — ${tool.url}`,
    m("mcp_tool_version", { version: tool.version ?? m("never_published"), owner: tool.owner }),
    grants.length === 0 ? m("mcp_shared_none") : m("mcp_shared_with"),
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
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
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
