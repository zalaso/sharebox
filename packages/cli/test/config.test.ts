import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clearCredentials, loadCredentials, normalizeUrl, saveCredentials } from "../src/config";

describe("credenziali", () => {
  it("normalizza l'indirizzo della ShareBox", () => {
    expect(normalizeUrl("sharebox.example.com")).toBe("https://sharebox.example.com");
    expect(normalizeUrl("https://sharebox.example.com/app/")).toBe("https://sharebox.example.com");
    expect(normalizeUrl("http://localhost:8790")).toBe("http://localhost:8790");
  });

  it("salva e rilegge indirizzo e token; le variabili d'ambiente hanno la precedenza", async () => {
    const env = { SHAREBOX_HOME: await mkdtemp(join(tmpdir(), "sharebox-cred-")) };
    expect(await loadCredentials(env)).toEqual({ url: null, token: null });
    await saveCredentials({ url: "https://a.example.com", token: "sbx_a" }, env);
    expect(await loadCredentials(env)).toEqual({ url: "https://a.example.com", token: "sbx_a" });
    expect(await loadCredentials({ ...env, SHAREBOX_URL: "b.example.com", SHAREBOX_TOKEN: "sbx_b" })).toEqual({
      url: "https://b.example.com",
      token: "sbx_b",
    });
    await clearCredentials(env);
    expect(await loadCredentials(env)).toEqual({ url: null, token: null });
  });
});
