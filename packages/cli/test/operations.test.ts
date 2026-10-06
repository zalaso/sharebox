import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRole, parseTarget, publish, resolveTool } from "../src/operations";
import { bundleWorker, collectPublic, findWorker } from "../src/project";
import { fakePlatform, tempProject } from "./helpers";

const unb64 = (s: string) => Buffer.from(s, "base64").toString("utf8");

describe("collectPublic", () => {
  it("legge public/ in base64, saltando file nascosti e node_modules", async () => {
    const dir = await tempProject({
      "public/index.html": "<h1>ciao</h1>",
      "public/css/app.css": "a{}",
      "public/.DS_Store": "x",
      "public/node_modules/lib.js": "x",
      "README.md": "fuori da public",
    });
    const result = await collectPublic(dir);
    expect(Object.keys(result.files).sort()).toEqual(["css/app.css", "index.html"]);
    expect(unb64(result.files["index.html"]!)).toBe("<h1>ciao</h1>");
    expect(result.bytes).toBe(16);
  });

  it("spiega quale file ha un nome non accettato", async () => {
    const dir = await tempProject({ "public/foto vacanze.png": "x" });
    await expect(collectPublic(dir)).rejects.toThrow(/foto vacanze\.png.*Rinomina/);
  });
});

describe("worker", () => {
  it("impacchetta un worker TypeScript con i suoi import in un solo modulo", async () => {
    const dir = await tempProject({
      "worker.ts": `import { saluto } from "./lib/saluto";\nexport default { fetch: (): Response => new Response(saluto("Anna")) };`,
      "lib/saluto.ts": "export const saluto = (nome: string): string => `Ciao ${nome}`;",
    });
    const entry = findWorker(dir)!;
    expect(entry).toBe(join(dir, "worker.ts"));
    const code = unb64(await bundleWorker(entry));
    expect(code).toContain("Ciao ");
    expect(code).toMatch(/export\s*\{/);
    expect(code).not.toMatch(/import .* from "\.\/lib/);
  });

  it("riporta gli errori di compilazione", async () => {
    const dir = await tempProject({ "worker.ts": "export default { fetch( }" });
    await expect(bundleWorker(join(dir, "worker.ts"))).rejects.toThrow(/non si compila/);
  });
});

describe("publish", () => {
  it("la prima volta crea il tool e scrive l'id; poi aggiorna lo stesso tool", async () => {
    const platform = fakePlatform();
    const dir = await tempProject({ "sharebox.json": '{ "name": "Ferie" }', "public/index.html": "v1" });

    const first = await publish(platform.client, dir);
    expect(first.created).toBe(true);
    expect(first.tool.version).toBe(1);
    const manifest = JSON.parse(await readFile(join(dir, "sharebox.json"), "utf8"));
    expect(manifest).toEqual({ name: "Ferie", id: first.tool.id });

    const second = await publish(platform.client, dir);
    expect(second.created).toBe(false);
    expect(second.tool.id).toBe(first.tool.id);
    expect(second.tool.version).toBe(2);
    expect(platform.tools.size).toBe(1);
  });

  it("usa il nome della cartella se manca sharebox.json, e invia il worker", async () => {
    const platform = fakePlatform();
    const dir = await tempProject({ "worker.js": "export default { fetch: () => new Response('ok') };" });
    const result = await publish(platform.client, dir);
    expect(result.tool.name).toMatch(/^sharebox-cli-/);
    expect(result.worker).toBe(true);
    expect(unb64(platform.deploys[0]!.worker!)).toContain("ok");
  });

  it("rifiuta una cartella senza niente da pubblicare, senza creare tool", async () => {
    const platform = fakePlatform();
    const dir = await tempProject({ "README.md": "x" });
    await expect(publish(platform.client, dir)).rejects.toThrow(/niente da pubblicare/);
    expect(platform.tools.size).toBe(0);
  });
});

describe("resolveTool", () => {
  it("accetta cartella, id, indirizzo e nome", async () => {
    const platform = fakePlatform();
    const dir = await tempProject({ "sharebox.json": '{ "name": "Ferie" }', "public/index.html": "x" });
    const { tool } = await publish(platform.client, dir);
    expect(await resolveTool(platform.client, dir)).toBe(tool.id);
    expect(await resolveTool(platform.client, tool.id)).toBe(tool.id);
    expect(await resolveTool(platform.client, `https://${tool.slug}.sbx.test/`)).toBe(tool.id);
    expect(await resolveTool(platform.client, "ferie")).toBe(tool.id);
    await expect(resolveTool(platform.client, "inesistente")).rejects.toThrow(/non trovato/);
  });
});

describe("parseTarget e parseRole", () => {
  it.each([
    ["Anna@Azienda.com", { type: "user", value: "anna@azienda.com" }],
    ["@azienda.com", { type: "domain", value: "azienda.com" }],
    ["chiunque", { type: "anyone" }],
    ["anyone", { type: "anyone" }],
  ])("%s", (input, expected) => {
    expect(parseTarget(input)).toEqual(expected);
  });

  it("rifiuta destinatari e ruoli incomprensibili", () => {
    expect(() => parseTarget("anna")).toThrow();
    expect(() => parseRole("admin")).toThrow();
    expect(parseRole(undefined)).toBe("use");
    expect(parseRole("gestisci")).toBe("manage");
  });
});

describe("publish con un id che non esiste su questa istanza", () => {
  it("spiega come ripartire invece di mostrare un 404", async () => {
    const platform = fakePlatform();
    const dir = await tempProject({ "sharebox.json": '{ "name": "Copiato", "id": "idsconosciuto" }', "public/index.html": "x" });
    await expect(publish(platform.client, dir)).rejects.toThrow(/non esiste su questa ShareBox.*togli la riga "id"/s);
  });
});
