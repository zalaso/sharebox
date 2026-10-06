import { DatabaseSync } from "node:sqlite";

// Una voce per versione dello schema, mai modificata dopo il deploy: le modifiche vanno in una voce nuova.
const MIGRATIONS = [
  `
  CREATE TABLE users (
    sub TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    hosted_domain TEXT,
    is_creator INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER NOT NULL
  );

  CREATE TABLE tools (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    created_at INTEGER NOT NULL
  );

  CREATE TABLE grants (
    tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'domain', 'anyone')),
    principal_value TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('use', 'manage')),
    PRIMARY KEY (tool_id, principal_type, principal_value)
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('platform', 'tool')),
    user_sub TEXT NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
    tool_id TEXT REFERENCES tools(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE login_states (
    state TEXT PRIMARY KEY,
    nonce TEXT NOT NULL,
    code_verifier TEXT NOT NULL,
    next TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE tool_codes (
    code_hash TEXT PRIMARY KEY,
    user_sub TEXT NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
    tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    next TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    actor TEXT NOT NULL,
    channel TEXT NOT NULL,
    action TEXT NOT NULL,
    tool_id TEXT,
    details TEXT NOT NULL
  );
  `,
  `
  -- Token personali per CLI e agenti. L'id è pubblico (per elencarli e revocarli), il token no.
  CREATE TABLE api_tokens (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    user_sub TEXT NOT NULL REFERENCES users(sub) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER
  );

  CREATE TABLE deployments (
    tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    actor_email TEXT NOT NULL,
    files INTEGER NOT NULL,
    bytes INTEGER NOT NULL,
    PRIMARY KEY (tool_id, version)
  );
  `,
];

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let next = version; next < MIGRATIONS.length; next++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[next]!);
      db.exec(`PRAGMA user_version = ${next + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return db;
}
