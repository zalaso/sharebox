import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMcpHandler } from "../src/mcp";
import { fakePlatform, tempProject } from "./helpers";

function setup() {
  const platform = fakePlatform();
  const handle = createMcpHandler({ client: async () => platform.client, version: "0.1.0" });
  let id = 0;
  const call = async (name: string, args: Record<string, unknown> = {}) =>
    (await handle({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } })) as {
      result: { content: { text: string }[]; isError?: boolean };
    };
  return { platform, handle, call };
}

describe("server MCP", () => {
  it("initialize dichiara gli strumenti e le istruzioni", async () => {
    const { handle } = setup();
    const res = (await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })) as {
      result: { protocolVersion: string; capabilities: object; instructions: string };
    };
    expect(res.result.protocolVersion).toBe("2025-06-18");
    expect(res.result.capabilities).toEqual({ tools: {} });
    expect(res.result.instructions).toContain("sharebox_guida");
  });

  it("elenca gli strumenti, senza uno per eliminare", async () => {
    const { handle } = setup();
    const res = (await handle({ jsonrpc: "2.0", id: 1, method: "tools/list" })) as { result: { tools: { name: string }[] } };
    const names = res.result.tools.map((t) => t.name);
    expect(names).toEqual([
      "sharebox_guida",
      "sharebox_crea_progetto",
      "sharebox_pubblica",
      "sharebox_elenco",
      "sharebox_dettagli",
      "sharebox_condividi",
      "sharebox_revoca",
    ]);
    expect(names.some((n) => /elimina|delete/.test(n))).toBe(false);
  });

  it("le notifiche non ricevono risposta; i metodi sconosciuti un errore", async () => {
    const { handle } = setup();
    expect(await handle({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect(await handle({ jsonrpc: "2.0", id: 7, method: "resources/list" })).toMatchObject({ id: 7, error: { code: -32601 } });
  });

  it("crea un progetto, lo pubblica, lo condivide e mostra le condivisioni", async () => {
    const { call, platform } = setup();
    const dir = join(await tempProject({}), "ferie");

    expect((await call("sharebox_crea_progetto", { cartella: dir, nome: "Ferie del team" })).result.content[0]!.text).toContain("Creata");
    expect(await readFile(join(dir, "public", "index.html"), "utf8")).toContain("/__sharebox/sdk.js");

    const published = await call("sharebox_pubblica", { cartella: dir });
    expect(published.result.isError).toBeUndefined();
    expect(published.result.content[0]!.text).toMatch(/Tool creato e pubblicato: Ferie del team\nIndirizzo: https:\/\//);
    expect(published.result.content[0]!.text).toContain("privato");

    const shared = await call("sharebox_condividi", { tool: dir, con: "@azienda.com" });
    expect(shared.result.content[0]!.text).toContain("Condiviso con tutti gli account @azienda.com (può usare)");
    expect([...platform.tools.values()][0]!.grants).toEqual([{ type: "domain", value: "azienda.com", role: "use" }]);

    const revoked = await call("sharebox_revoca", { tool: dir, con: "@azienda.com" });
    expect(revoked.result.content[0]!.text).toContain("privato");
  });

  it("gli errori diventano risultati isError con un messaggio comprensibile", async () => {
    const { call } = setup();
    const res = await call("sharebox_pubblica", { cartella: "/cartella/che/non/esiste" });
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0]!.text).toContain("Cartella non trovata");
    expect((await call("sharebox_condividi", { tool: "x" })).result.content[0]!.text).toContain("Parametro mancante: con");
  });

  it("la guida spiega SDK e limiti", async () => {
    const { call } = setup();
    const text = (await call("sharebox_guida")).result.content[0]!.text;
    expect(text).toContain("sharebox.collection");
    expect(text).toContain("canEdit");
    expect(text).toContain("non può raggiungere internet");
  });
});
