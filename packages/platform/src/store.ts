import type { DatabaseSync } from "node:sqlite";
import type { Principal, Role } from "@sharebox/shared";
import type { ToolGrant } from "./access";
import { hashToken, randomId, randomToken } from "./crypto";

export interface User {
  sub: string;
  email: string;
  name: string;
  hostedDomain: string | null;
  isCreator: boolean;
}

export interface Tool {
  id: string;
  slug: string;
  name: string;
  ownerEmail: string;
  status: "active" | "suspended";
}

export type SessionKind = "platform" | "tool";

export interface LoginState {
  nonce: string;
  codeVerifier: string;
  next: string;
}

export interface ApiTokenInfo {
  id: string;
  email: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface Deployment {
  version: number;
  createdAt: number;
  actorEmail: string;
  files: number;
  bytes: number;
}

/** Prefisso dei token personali: li rende riconoscibili (es. se finiscono per errore in un repository). */
export const API_TOKEN_PREFIX = "sbx_";

type Row = Record<string, unknown>;

export class Store {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => number = Date.now,
  ) {}

  // Utenti

  /** Crea o aggiorna l'utente al login. Il flag creatore si può solo aggiungere, non togliere, da qui. */
  upsertUser(profile: Omit<User, "isCreator">, isCreator: boolean): User {
    const at = this.now();
    this.db
      .prepare(
        `INSERT INTO users (sub, email, name, hosted_domain, is_creator, created_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (sub) DO UPDATE SET
           email = excluded.email, name = excluded.name, hosted_domain = excluded.hosted_domain,
           is_creator = MAX(is_creator, excluded.is_creator), last_login_at = excluded.last_login_at`,
      )
      .run(profile.sub, profile.email, profile.name, profile.hostedDomain, isCreator ? 1 : 0, at, at);
    return this.userBySub(profile.sub)!;
  }

  userBySub(sub: string): User | null {
    const row = this.db.prepare("SELECT * FROM users WHERE sub = ?").get(sub) as Row | undefined;
    return row ? toUser(row) : null;
  }

  userByEmail(email: string): User | null {
    const row = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase()) as Row | undefined;
    return row ? toUser(row) : null;
  }

  // Token personali (CLI, agenti). Il token si mostra una volta sola; nel database c'è il suo hash.

  createApiToken(userSub: string, name: string): { id: string; token: string } {
    const id = randomId(8);
    const token = API_TOKEN_PREFIX + randomToken();
    this.db
      .prepare("INSERT INTO api_tokens (id, token_hash, user_sub, name, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, hashToken(token), userSub, name, this.now());
    return { id, token };
  }

  userByApiToken(token: string): User | null {
    const hash = hashToken(token);
    const row = this.db
      .prepare("SELECT users.* FROM api_tokens JOIN users ON users.sub = api_tokens.user_sub WHERE token_hash = ?")
      .get(hash) as Row | undefined;
    if (!row) return null;
    this.db.prepare("UPDATE api_tokens SET last_used_at = ? WHERE token_hash = ?").run(this.now(), hash);
    return toUser(row);
  }

  listApiTokens(): ApiTokenInfo[] {
    const rows = this.db
      .prepare(
        `SELECT api_tokens.id, users.email, api_tokens.name, api_tokens.created_at, api_tokens.last_used_at
         FROM api_tokens JOIN users ON users.sub = api_tokens.user_sub ORDER BY api_tokens.created_at`,
      )
      .all() as Row[];
    return rows.map((row) => ({
      id: row.id as string,
      email: row.email as string,
      name: row.name as string,
      createdAt: row.created_at as number,
      lastUsedAt: (row.last_used_at as number | null) ?? null,
    }));
  }

  revokeApiToken(id: string): boolean {
    return this.db.prepare("DELETE FROM api_tokens WHERE id = ?").run(id).changes > 0;
  }

  /** Token di un utente, senza il valore (che non è più recuperabile). */
  apiTokensOf(userSub: string): Omit<ApiTokenInfo, "email">[] {
    const rows = this.db
      .prepare("SELECT id, name, created_at, last_used_at FROM api_tokens WHERE user_sub = ? ORDER BY created_at DESC")
      .all(userSub) as Row[];
    return rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      createdAt: row.created_at as number,
      lastUsedAt: (row.last_used_at as number | null) ?? null,
    }));
  }

  /** Revoca un token solo se appartiene all'utente. */
  revokeApiTokenOf(userSub: string, id: string): boolean {
    return this.db.prepare("DELETE FROM api_tokens WHERE id = ? AND user_sub = ?").run(id, userSub).changes > 0;
  }

  revokeApiTokenValue(token: string): void {
    this.db.prepare("DELETE FROM api_tokens WHERE token_hash = ?").run(hashToken(token));
  }

  // Sessioni: il token va solo nel cookie, nel database c'è il suo hash.

  createSession(kind: SessionKind, userSub: string, toolId: string | null, ttlMs: number): string {
    const token = randomToken();
    this.db
      .prepare("INSERT INTO sessions (token_hash, kind, user_sub, tool_id, expires_at) VALUES (?, ?, ?, ?, ?)")
      .run(hashToken(token), kind, userSub, toolId, this.now() + ttlMs);
    return token;
  }

  /** Utente della sessione, se il token è valido, non scaduto e (per i tool) emesso per quel tool. */
  sessionUser(kind: SessionKind, token: string, toolId: string | null = null): User | null {
    const row = this.db
      .prepare(
        `SELECT users.* FROM sessions JOIN users ON users.sub = sessions.user_sub
         WHERE token_hash = ? AND kind = ? AND tool_id IS ? AND expires_at > ?`,
      )
      .get(hashToken(token), kind, toolId, this.now()) as Row | undefined;
    return row ? toUser(row) : null;
  }

  deleteSession(token: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  }

  // Login Google in corso

  createLoginState(state: string, value: LoginState, ttlMs: number): void {
    this.db
      .prepare("INSERT INTO login_states (state, nonce, code_verifier, next, expires_at) VALUES (?, ?, ?, ?, ?)")
      .run(state, value.nonce, value.codeVerifier, value.next, this.now() + ttlMs);
  }

  /** Legge e cancella lo stato: ogni login si completa una volta sola. */
  takeLoginState(state: string): LoginState | null {
    const row = this.db.prepare("DELETE FROM login_states WHERE state = ? RETURNING *").get(state) as Row | undefined;
    if (!row || (row.expires_at as number) <= this.now()) return null;
    return { nonce: row.nonce as string, codeVerifier: row.code_verifier as string, next: row.next as string };
  }

  // Codici monouso per portare il login dalla piattaforma al dominio del tool

  createToolCode(userSub: string, toolId: string, next: string, ttlMs: number): string {
    const code = randomToken();
    this.db
      .prepare("INSERT INTO tool_codes (code_hash, user_sub, tool_id, next, expires_at) VALUES (?, ?, ?, ?, ?)")
      .run(hashToken(code), userSub, toolId, next, this.now() + ttlMs);
    return code;
  }

  /** Legge e cancella il codice. Valido solo per il tool per cui è stato emesso. */
  takeToolCode(code: string, toolId: string): { userSub: string; next: string } | null {
    const row = this.db.prepare("DELETE FROM tool_codes WHERE code_hash = ? RETURNING *").get(hashToken(code)) as
      | Row
      | undefined;
    if (!row || row.tool_id !== toolId || (row.expires_at as number) <= this.now()) return null;
    return { userSub: row.user_sub as string, next: row.next as string };
  }

  // Tool e condivisioni

  createTool(tool: Omit<Tool, "status">): Tool {
    this.db
      .prepare("INSERT INTO tools (id, slug, name, owner_email, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(tool.id, tool.slug, tool.name, tool.ownerEmail, this.now());
    return this.toolBySlug(tool.slug)!;
  }

  toolBySlug(slug: string): Tool | null {
    const row = this.db.prepare("SELECT * FROM tools WHERE slug = ?").get(slug) as Row | undefined;
    return row ? toTool(row) : null;
  }

  toolById(id: string): Tool | null {
    const row = this.db.prepare("SELECT * FROM tools WHERE id = ?").get(id) as Row | undefined;
    return row ? toTool(row) : null;
  }

  listTools(): Tool[] {
    return (this.db.prepare("SELECT * FROM tools ORDER BY slug").all() as Row[]).map(toTool);
  }

  countToolsOwnedBy(email: string): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM tools WHERE owner_email = ?").get(email) as { n: number }).n;
  }

  /** Elimina il tool; condivisioni, sessioni e pubblicazioni se ne vanno con lui. */
  deleteTool(id: string): void {
    this.db.prepare("DELETE FROM tools WHERE id = ?").run(id);
  }

  // Pubblicazioni

  nextVersion(toolId: string): number {
    const row = this.db.prepare("SELECT MAX(version) AS v FROM deployments WHERE tool_id = ?").get(toolId) as { v: number | null };
    return (row.v ?? 0) + 1;
  }

  recordDeployment(toolId: string, deployment: Omit<Deployment, "createdAt">): void {
    this.db
      .prepare("INSERT INTO deployments (tool_id, version, created_at, actor_email, files, bytes) VALUES (?, ?, ?, ?, ?, ?)")
      .run(toolId, deployment.version, this.now(), deployment.actorEmail, deployment.files, deployment.bytes);
  }

  latestDeployment(toolId: string): Deployment | null {
    const row = this.db.prepare("SELECT * FROM deployments WHERE tool_id = ? ORDER BY version DESC LIMIT 1").get(toolId) as
      | Row
      | undefined;
    if (!row) return null;
    return {
      version: row.version as number,
      createdAt: row.created_at as number,
      actorEmail: row.actor_email as string,
      files: row.files as number,
      bytes: row.bytes as number,
    };
  }

  setToolStatus(toolId: string, status: Tool["status"]): void {
    this.db.prepare("UPDATE tools SET status = ? WHERE id = ?").run(status, toolId);
  }

  grantsFor(toolId: string): ToolGrant[] {
    const rows = this.db
      .prepare("SELECT principal_type, principal_value, role FROM grants WHERE tool_id = ? ORDER BY principal_type, principal_value")
      .all(toolId) as Row[];
    return rows.map((row) => ({
      principal: toPrincipal(row.principal_type as Principal["type"], row.principal_value as string),
      role: row.role as Role,
    }));
  }

  /** Aggiunge la condivisione o ne cambia il ruolo. */
  setGrant(toolId: string, principal: Principal, role: Role): void {
    this.db
      .prepare(
        `INSERT INTO grants (tool_id, principal_type, principal_value, role) VALUES (?, ?, ?, ?)
         ON CONFLICT (tool_id, principal_type, principal_value) DO UPDATE SET role = excluded.role`,
      )
      .run(toolId, principal.type, principalValue(principal), role);
  }

  removeGrant(toolId: string, principal: Principal): boolean {
    const result = this.db
      .prepare("DELETE FROM grants WHERE tool_id = ? AND principal_type = ? AND principal_value = ?")
      .run(toolId, principal.type, principalValue(principal));
    return result.changes > 0;
  }

  // Registro delle attività (solo aggiunta)

  audit(event: { actor: string; channel: "web" | "cli" | "mcp" | "admin"; action: string; toolId: string | null; details: object }): void {
    this.db
      .prepare("INSERT INTO audit_events (at, actor, channel, action, tool_id, details) VALUES (?, ?, ?, ?, ?, ?)")
      .run(this.now(), event.actor, event.channel, event.action, event.toolId, JSON.stringify(event.details));
  }

  activityOf(toolId: string, limit = 50): { at: number; actor: string; channel: string; action: string; details: unknown }[] {
    const rows = this.db
      .prepare("SELECT at, actor, channel, action, details FROM audit_events WHERE tool_id = ? ORDER BY id DESC LIMIT ?")
      .all(toolId, limit) as Row[];
    return rows.map((row) => ({
      at: row.at as number,
      actor: row.actor as string,
      channel: row.channel as string,
      action: row.action as string,
      details: JSON.parse(row.details as string),
    }));
  }

  /** Cancella sessioni, login e codici scaduti. */
  purgeExpired(): void {
    const now = this.now();
    for (const table of ["sessions", "login_states", "tool_codes"]) {
      this.db.prepare(`DELETE FROM ${table} WHERE expires_at <= ?`).run(now);
    }
  }
}

function toUser(row: Row): User {
  return {
    sub: row.sub as string,
    email: row.email as string,
    name: row.name as string,
    hostedDomain: (row.hosted_domain as string | null) ?? null,
    isCreator: row.is_creator === 1,
  };
}

function toTool(row: Row): Tool {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    ownerEmail: row.owner_email as string,
    status: row.status as Tool["status"],
  };
}

function principalValue(principal: Principal): string {
  switch (principal.type) {
    case "user":
      return principal.email;
    case "domain":
      return principal.domain;
    case "anyone":
      return "";
  }
}

function toPrincipal(type: Principal["type"], value: string): Principal {
  switch (type) {
    case "user":
      return { type, email: value };
    case "domain":
      return { type, domain: value };
    case "anyone":
      return { type };
  }
}
