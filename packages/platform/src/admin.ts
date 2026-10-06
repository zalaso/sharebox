// Comandi di amministrazione, da lanciare sul server:
//   docker compose exec platform node /app/platform.mjs admin <comando>
// Servono finché la dashboard (Fase 1, passo 5) non gestisce tool, condivisioni e token.
import type { Principal, Role } from "@sharebox/shared";
import type { Orchestrator } from "./orchestrator-client";
import type { Store, Tool } from "./store";

export const ADMIN_USAGE = `Comandi:
  tools
  tool-delete <slug>
  share <slug> user <email> use|manage
  share <slug> domain <dominio> use|manage
  share <slug> anyone use|manage
  unshare <slug> user <email> | domain <dominio> | anyone
  suspend <slug>
  resume <slug>
  tokens
  token-create <email> <nome>
  token-revoke <id>`;

export async function runAdmin(args: string[], store: Store, orchestrator: Orchestrator): Promise<string> {
  const [command, ...rest] = args;
  const actor = { actor: "admin", channel: "admin" as const };

  switch (command) {
    case "tools":
      return (
        store
          .listTools()
          .map((tool) => {
            const version = store.latestDeployment(tool.id)?.version;
            const grants = store.grantsFor(tool.id).map((g) => `${describe(g.principal)}: ${g.role}`);
            return `${tool.slug} (${tool.id}) "${tool.name}" — proprietario ${tool.ownerEmail}, ${tool.status}, ${version ? `versione ${version}` : "mai pubblicato"}\n  ${grants.join("\n  ") || "nessuna condivisione"}`;
          })
          .join("\n") || "Nessun tool"
      );

    case "tool-delete": {
      const tool = requireTool(store, rest[0]);
      await orchestrator.remove(tool.id);
      store.deleteTool(tool.id);
      store.audit({ ...actor, action: "tool.delete", toolId: tool.id, details: { slug: tool.slug, name: tool.name } });
      return `Eliminato ${tool.slug} (${tool.id}) con i suoi dati`;
    }

    case "share": {
      const tool = requireTool(store, rest[0]);
      const { principal, remaining } = parsePrincipal(rest.slice(1));
      const role = remaining[0];
      if (role !== "use" && role !== "manage") throw new Error(ADMIN_USAGE);
      store.setGrant(tool.id, principal, role as Role);
      store.audit({ ...actor, action: "grant.set", toolId: tool.id, details: { principal, role } });
      return `${tool.slug}: ${describe(principal)} → ${role}`;
    }

    case "unshare": {
      const tool = requireTool(store, rest[0]);
      const { principal } = parsePrincipal(rest.slice(1));
      const removed = store.removeGrant(tool.id, principal);
      if (removed) store.audit({ ...actor, action: "grant.remove", toolId: tool.id, details: { principal } });
      return removed ? `${tool.slug}: tolto l'accesso a ${describe(principal)}` : "Condivisione non trovata";
    }

    case "suspend":
    case "resume": {
      const tool = requireTool(store, rest[0]);
      const status = command === "suspend" ? "suspended" : "active";
      store.setToolStatus(tool.id, status);
      store.audit({ ...actor, action: `tool.${command}`, toolId: tool.id, details: {} });
      return `${tool.slug}: ${status}`;
    }

    case "tokens":
      return (
        store
          .listApiTokens()
          .map((t) => `${t.id}  ${t.email}  "${t.name}"  creato ${iso(t.createdAt)}, ultimo uso ${t.lastUsedAt ? iso(t.lastUsedAt) : "mai"}`)
          .join("\n") || "Nessun token"
      );

    case "token-create": {
      const [email, ...nameParts] = rest;
      const name = nameParts.join(" ");
      if (!email || !name) throw new Error(ADMIN_USAGE);
      const user = store.userByEmail(email);
      if (!user) throw new Error(`${email} non ha mai fatto login su ShareBox: serve almeno un accesso con Google`);
      const { id, token } = store.createApiToken(user.sub, name);
      store.audit({ ...actor, action: "token.create", toolId: null, details: { id, email: user.email, name } });
      return `Token ${id} per ${user.email} (mostrato una sola volta):\n${token}`;
    }

    case "token-revoke": {
      const id = rest[0];
      if (!id) throw new Error(ADMIN_USAGE);
      const revoked = store.revokeApiToken(id);
      if (revoked) store.audit({ ...actor, action: "token.revoke", toolId: null, details: { id } });
      return revoked ? `Token ${id} revocato` : "Token non trovato";
    }

    default:
      throw new Error(ADMIN_USAGE);
  }
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

function requireTool(store: Store, slug: string | undefined): Tool {
  const tool = slug ? store.toolBySlug(slug) : null;
  if (!tool) throw new Error(`Tool non trovato: ${slug ?? "(manca lo slug)"}`);
  return tool;
}

function parsePrincipal(args: string[]): { principal: Principal; remaining: string[] } {
  const [type, value, ...remaining] = args;
  if (type === "anyone") return { principal: { type }, remaining: value === undefined ? [] : [value, ...remaining] };
  if (type === "user" && value) return { principal: { type, email: value.toLowerCase() }, remaining };
  if (type === "domain" && value) return { principal: { type, domain: value.toLowerCase().replace(/^@/, "") }, remaining };
  throw new Error(ADMIN_USAGE);
}

function describe(principal: Principal): string {
  switch (principal.type) {
    case "user":
      return principal.email;
    case "domain":
      return `@${principal.domain}`;
    case "anyone":
      return "chiunque abbia il link";
  }
}
