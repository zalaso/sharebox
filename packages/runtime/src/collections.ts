// Dati dei tool statici: collezioni di record JSON nel database SQLite del tool.
// Regole (applicate qui, lato server): tutti quelli che hanno accesso al tool leggono tutti i record;
// con "può usare" si modificano ed eliminano solo i propri, con "può gestire" tutti.

import type { ErrorCode } from "./messages";

export interface Sql {
  exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] };
}

export interface Actor {
  email: string;
  name: string;
  role: "use" | "manage";
}

export interface RecordView {
  id: string;
  data: unknown;
  owner: { email: string; name: string };
  createdAt: number;
  updatedAt: number;
  /** Se chi chiede può modificare o eliminare questo record: utile per l'interfaccia. */
  canEdit: boolean;
}

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: ErrorCode };

export const COLLECTION_LIMITS = {
  maxRecordBytes: 64 * 1024,
  maxList: 1000,
  maxDatabaseBytes: 100 * 1024 * 1024,
} as const;

const NAME = /^[A-Za-z0-9_-]{1,40}$/;

export class Collections {
  constructor(
    private readonly sql: Sql,
    private readonly now: () => number = Date.now,
    /** Dimensione attuale del database in byte. */
    private readonly databaseSize: () => number = () => 0,
  ) {
    sql.exec(`CREATE TABLE IF NOT EXISTS sharebox_records (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (collection, id)
    )`);
  }

  list(collection: string, actor: Actor): Result<RecordView[]> {
    if (!NAME.test(collection)) return invalidName();
    const rows = this.sql
      .exec(
        "SELECT * FROM sharebox_records WHERE collection = ? ORDER BY created_at, id LIMIT ?",
        collection,
        COLLECTION_LIMITS.maxList,
      )
      .toArray();
    return { ok: true, value: rows.map((row) => view(row, actor)) };
  }

  add(collection: string, data: unknown, actor: Actor): Result<RecordView> {
    if (!NAME.test(collection)) return invalidName();
    const problem = this.writeProblem(data);
    if (problem) return problem;
    const at = this.now();
    const id = crypto.randomUUID();
    this.sql.exec(
      "INSERT INTO sharebox_records (collection, id, data, owner_email, owner_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      collection,
      id,
      JSON.stringify(data),
      actor.email,
      actor.name,
      at,
      at,
    );
    return { ok: true, value: this.get(collection, id, actor)! };
  }

  update(collection: string, id: string, data: unknown, actor: Actor): Result<RecordView> {
    const found = this.editable(collection, id, actor);
    if (!found.ok) return found;
    const problem = this.writeProblem(data);
    if (problem) return problem;
    this.sql.exec(
      "UPDATE sharebox_records SET data = ?, updated_at = ? WHERE collection = ? AND id = ?",
      JSON.stringify(data),
      this.now(),
      collection,
      id,
    );
    return { ok: true, value: this.get(collection, id, actor)! };
  }

  remove(collection: string, id: string, actor: Actor): Result<{ id: string }> {
    const found = this.editable(collection, id, actor);
    if (!found.ok) return found;
    this.sql.exec("DELETE FROM sharebox_records WHERE collection = ? AND id = ?", collection, id);
    return { ok: true, value: { id } };
  }

  private get(collection: string, id: string, actor: Actor): RecordView | null {
    const [row] = this.sql.exec("SELECT * FROM sharebox_records WHERE collection = ? AND id = ?", collection, id).toArray();
    return row ? view(row, actor) : null;
  }

  private editable(collection: string, id: string, actor: Actor): Result<RecordView> {
    if (!NAME.test(collection)) return invalidName();
    const record = this.get(collection, id, actor);
    if (!record) return { ok: false, status: 404, error: "record_not_found" };
    if (!record.canEdit) return { ok: false, status: 403, error: "not_yours" };
    return { ok: true, value: record };
  }

  private writeProblem(data: unknown): { ok: false; status: number; error: ErrorCode } | null {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return { ok: false, status: 400, error: "not_object" };
    }
    if (new TextEncoder().encode(JSON.stringify(data)).byteLength > COLLECTION_LIMITS.maxRecordBytes) {
      return { ok: false, status: 413, error: "record_too_big" };
    }
    if (this.databaseSize() > COLLECTION_LIMITS.maxDatabaseBytes) {
      return { ok: false, status: 507, error: "storage_full" };
    }
    return null;
  }
}

function view(row: Record<string, unknown>, actor: Actor): RecordView {
  const ownerEmail = row.owner_email as string;
  return {
    id: row.id as string,
    data: JSON.parse(row.data as string),
    owner: { email: ownerEmail, name: row.owner_name as string },
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    canEdit: actor.role === "manage" || ownerEmail === actor.email,
  };
}

function invalidName(): { ok: false; status: number; error: ErrorCode } {
  return { ok: false, status: 400, error: "invalid_collection" };
}
