import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { COLLECTION_LIMITS, Collections, type Actor, type RecordView, type Result, type Sql } from "../src/collections";

/** Stessa interfaccia di ctx.storage.sql di workerd, sopra node:sqlite. */
function nodeSql(db: DatabaseSync): Sql {
  return {
    exec(query, ...bindings) {
      const statement = db.prepare(query);
      const params = bindings as SQLInputValue[];
      if (/^\s*select/i.test(query)) {
        const rows = statement.all(...params) as Record<string, unknown>[];
        return { toArray: () => rows };
      }
      statement.run(...params);
      return { toArray: () => [] };
    },
  };
}

const anna: Actor = { email: "anna@azienda.com", name: "Anna", role: "use" };
const bruno: Actor = { email: "bruno@azienda.com", name: "Bruno", role: "use" };
const capo: Actor = { email: "capo@azienda.com", name: "Capo", role: "manage" };

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`atteso ok, ricevuto ${result.status} ${result.error}`);
  return result.value;
}

let clock: number;
let size: number;
let ferie: Collections;

beforeEach(() => {
  clock = 1_000;
  size = 0;
  ferie = new Collections(nodeSql(new DatabaseSync(":memory:")), () => clock++, () => size);
});

describe("Collections", () => {
  it("aggiunge e legge record con il proprietario", () => {
    const added = value(ferie.add("ferie", { dal: "2026-08-01", al: "2026-08-15" }, anna));
    expect(added).toMatchObject({ data: { dal: "2026-08-01", al: "2026-08-15" }, owner: { email: anna.email, name: "Anna" }, canEdit: true });
    expect(added.id).toMatch(/^[0-9a-f-]{36}$/);

    const visti = value(ferie.list("ferie", bruno));
    expect(visti).toHaveLength(1);
    expect(visti[0]!.canEdit).toBe(false);
  });

  it("le collezioni sono separate", () => {
    value(ferie.add("ferie", { a: 1 }, anna));
    expect(value(ferie.list("permessi", anna))).toEqual([]);
  });

  it("con 'può usare' si modificano ed eliminano solo i propri record", () => {
    const record = value(ferie.add("ferie", { giorni: 3 }, anna));
    expect(ferie.update("ferie", record.id, { giorni: 99 }, bruno)).toMatchObject({ ok: false, status: 403 });
    expect(ferie.remove("ferie", record.id, bruno)).toMatchObject({ ok: false, status: 403 });

    const updated = value(ferie.update("ferie", record.id, { giorni: 4 }, anna));
    expect(updated.data).toEqual({ giorni: 4 });
    expect(updated.updatedAt).toBeGreaterThan(updated.createdAt);
    expect(updated.owner.email).toBe(anna.email);
  });

  it("con 'può gestire' si modificano ed eliminano tutti i record, senza cambiarne il proprietario", () => {
    const record = value(ferie.add("ferie", { giorni: 3 }, anna));
    expect(value(ferie.list("ferie", capo))[0]!.canEdit).toBe(true);
    expect(value(ferie.update("ferie", record.id, { giorni: 2 }, capo)).owner.email).toBe(anna.email);
    value(ferie.remove("ferie", record.id, capo));
    expect(value(ferie.list("ferie", anna))).toEqual([]);
  });

  it("record inesistente: 404", () => {
    expect(ferie.update("ferie", "nessuno", { a: 1 }, capo)).toMatchObject({ ok: false, status: 404 });
    expect(ferie.remove("ferie", "nessuno", capo)).toMatchObject({ ok: false, status: 404 });
  });

  it.each([null, [1, 2], "testo", 42])("rifiuta dati che non sono un oggetto: %j", (data) => {
    expect(ferie.add("ferie", data, anna)).toMatchObject({ ok: false, status: 400 });
  });

  it.each(["", "con spazio", "../x", "x".repeat(41)])("rifiuta il nome di collezione %j", (name) => {
    expect(ferie.list(name, anna)).toMatchObject({ ok: false, status: 400 });
  });

  it("rifiuta record troppo grandi", () => {
    const big = { testo: "x".repeat(COLLECTION_LIMITS.maxRecordBytes) };
    expect(ferie.add("ferie", big, anna)).toMatchObject({ ok: false, status: 413 });
  });

  it("smette di accettare scritture quando lo spazio del tool è esaurito", () => {
    const record = value(ferie.add("ferie", { a: 1 }, anna));
    size = COLLECTION_LIMITS.maxDatabaseBytes + 1;
    expect(ferie.add("ferie", { a: 2 }, anna)).toMatchObject({ ok: false, status: 507 });
    expect(ferie.update("ferie", record.id, { a: 3 }, anna)).toMatchObject({ ok: false, status: 507 });
    // Eliminare resta possibile, così si può liberare spazio.
    expect(ferie.remove("ferie", record.id, anna).ok).toBe(true);
  });

  it("elenca in ordine di creazione", () => {
    for (const n of [1, 2, 3]) value(ferie.add("ferie", { n }, anna));
    expect(value(ferie.list("ferie", anna)).map((r: RecordView) => (r.data as { n: number }).n)).toEqual([1, 2, 3]);
  });
});
