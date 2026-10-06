import { beforeEach, describe, expect, it } from "vitest";
import { setLang } from "../src/i18n";
import { browserLogin } from "../src/login";

// I messaggi controllati qui sono quelli italiani; l'inglese ha i suoi test in i18n.test.ts.
beforeEach(() => setLang("it"));

describe("browserLogin", () => {
  it("apre la pagina della piattaforma e riceve il token sull'indirizzo locale", async () => {
    let opened = "";
    const token = await browserLogin("https://sharebox.test", {
      device: "PC di prova",
      open: (url) => {
        opened = url;
        // Simula la piattaforma che, dopo la conferma, rimanda il browser alla CLI.
        const { searchParams } = new URL(url);
        void fetch(`http://127.0.0.1:${searchParams.get("port")}/callback?state=${searchParams.get("state")}&token=sbx_nuovo`);
      },
    });
    expect(token).toBe("sbx_nuovo");
    const url = new URL(opened);
    expect(url.origin + url.pathname).toBe("https://sharebox.test/auth/cli");
    expect(url.searchParams.get("device")).toBe("PC di prova");
  });

  it("ignora richieste con uno state diverso", async () => {
    const result = browserLogin("https://sharebox.test", {
      timeoutMs: 300,
      open: (url) => {
        const port = new URL(url).searchParams.get("port");
        void fetch(`http://127.0.0.1:${port}/callback?state=sbagliato&token=sbx_rubato`);
      },
    });
    await expect(result).rejects.toThrow(/non completato/);
  });
});
