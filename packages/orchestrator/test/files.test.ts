import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pruneVersions, removeToolFiles, writeVersion } from "../src/files";

let dir: string;
const text = (s: string) => new TextEncoder().encode(s);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sharebox-files-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("writeVersion", () => {
  it("scrive i file nella cartella della versione", async () => {
    await writeVersion(dir, "abc", 1, new Map([["public/index.html", text("<h1>1</h1>")], ["_sharebox/user.js", text("x")]]));
    expect(await readFile(join(dir, "abc", "v1", "public", "index.html"), "utf8")).toBe("<h1>1</h1>");
  });

  it("riscrivere la stessa versione non lascia file vecchi", async () => {
    await writeVersion(dir, "abc", 1, new Map([["vecchio.txt", text("x")]]));
    await writeVersion(dir, "abc", 1, new Map([["nuovo.txt", text("y")]]));
    expect((await readdir(join(dir, "abc", "v1"))).sort()).toEqual(["nuovo.txt", "public"]);
  });

  it("crea sempre public/, anche per un tool fatto solo di worker (workerd non parte senza)", async () => {
    await writeVersion(dir, "abc", 1, new Map([["_sharebox/user.js", text("export default {}")]]));
    expect(await readdir(join(dir, "abc", "v1", "public"))).toEqual([]);
  });

  it.each(["../fuori.txt", "public/../../fuori.txt", "/assoluto.txt"])("rifiuta %s senza scrivere nulla fuori", async (path) => {
    await expect(writeVersion(dir, "abc", 1, new Map([[path, text("x")]]))).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]);
  });
});

describe("pruneVersions e removeToolFiles", () => {
  it("tiene solo le versioni indicate", async () => {
    for (const v of [1, 2, 3]) await writeVersion(dir, "abc", v, new Map([["f.txt", text(String(v))]]));
    await pruneVersions(dir, "abc", [3, 2]);
    expect((await readdir(join(dir, "abc"))).sort()).toEqual(["v2", "v3"]);
  });

  it("cancella tutti i file del tool", async () => {
    await writeVersion(dir, "abc", 1, new Map([["f.txt", text("1")]]));
    await removeToolFiles(dir, "abc");
    expect(await readdir(dir)).toEqual([]);
  });
});
