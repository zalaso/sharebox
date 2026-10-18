import { beforeEach, describe, expect, it } from "vitest";
import { encryptSecret, hashToken, secretsKey } from "../src/crypto";
import { openDatabase } from "../src/db";
import { EgressError, isPublicAddress, prepareRequest, resolvePublic } from "../src/egress";
import { Store } from "../src/store";

const KEY = secretsKey("chiave-di-prova");
const TOKEN = "token-di-prova-abcdefghijklmnopqrstuvwxyz0123";
let store: Store;

beforeEach(() => {
  store = new Store(openDatabase(":memory:"));
  store.createTool({ id: "t1", slug: "meteo", name: "Meteo", ownerEmail: "guido@gmail.com" });
  store.setNetworkAllow("t1", ["api.meteo.example", "*.cdn.example"]);
  store.setEgressToken("t1", hashToken(TOKEN));
  store.setSecret("t1", { name: "METEO_KEY", host: "api.meteo.example", value: encryptSecret(KEY, "chiave-vera") }, "guido@gmail.com");
});

const prepare = (target: string, headers: Record<string, string> = {}, body?: string, token = TOKEN) =>
  prepareRequest(store, KEY, {
    method: body ? "POST" : "GET",
    headers: { "x-sharebox-egress-token": token, "x-sharebox-egress-target": target, ...headers },
    body: body === undefined ? undefined : Buffer.from(body),
  });

const failure = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    if (error instanceof EgressError) return { status: error.status, message: error.message };
    throw error;
  }
  throw new Error("nessun errore");
};

describe("prepareRequest", () => {
  it("lascia passare solo HTTPS verso i domini dichiarati", () => {
    expect(prepare("https://api.meteo.example/v1/oggi").target.href).toBe("https://api.meteo.example/v1/oggi");
    expect(prepare("https://img.cdn.example/a.png").target.hostname).toBe("img.cdn.example");
    expect(failure(() => prepare("https://altro.example/"))).toMatchObject({ status: 403, message: expect.stringContaining("network.allow") });
    expect(failure(() => prepare("http://api.meteo.example/"))).toMatchObject({ status: 403 });
    expect(failure(() => prepare("https://api.meteo.example:8443/"))).toMatchObject({ status: 403 });
    expect(failure(() => prepare("https://1.1.1.1/"))).toMatchObject({ status: 403 });
  });

  it("rifiuta token sconosciuti e tool sospesi", () => {
    expect(failure(() => prepare("https://api.meteo.example/", {}, undefined, "sbagliato"))).toMatchObject({ status: 403 });
    store.setToolStatus("t1", "suspended");
    expect(failure(() => prepare("https://api.meteo.example/"))).toMatchObject({ status: 403 });
  });

  it("inserisce i segreti nell'indirizzo, negli header e nel corpo, anche codificati nel percorso", () => {
    const viaQuery = prepare("https://api.meteo.example/v1?key={{secret:METEO_KEY}}");
    expect(viaQuery.target.search).toBe("?key=chiave-vera");
    const viaPath = prepare("https://api.meteo.example/k/%7B%7Bsecret:METEO_KEY%7D%7D/oggi");
    expect(viaPath.target.pathname).toBe("/k/chiave-vera/oggi");
    expect(prepare("https://api.meteo.example/", { authorization: "Bearer {{secret:METEO_KEY}}" }).headers.authorization).toBe("Bearer chiave-vera");
    expect(prepare("https://api.meteo.example/", {}, '{"key":"{{secret:METEO_KEY}}"}').body!.toString()).toBe('{"key":"chiave-vera"}');
  });

  it("un segreto non va mai verso un dominio diverso dal suo, e uno mancante dà un errore chiaro", () => {
    expect(failure(() => prepare("https://img.cdn.example/?k={{secret:METEO_KEY}}"))).toMatchObject({
      status: 403,
      message: expect.stringContaining("only for api.meteo.example"),
    });
    expect(failure(() => prepare("https://api.meteo.example/?k={{secret:ALTRA}}"))).toMatchObject({ status: 403, message: expect.stringContaining("not set") });
  });

  it("non inoltra gli header interni di ShareBox né quelli di connessione", () => {
    const prepared = prepare("https://api.meteo.example/", { "x-sharebox-email": "finto@x.it", connection: "keep-alive", accept: "application/json" });
    expect(prepared.headers).toEqual({ accept: "application/json" });
  });
});

describe("indirizzi non pubblici", () => {
  it.each(["10.1.2.3", "172.20.0.2", "192.168.1.1", "127.0.0.1", "100.91.0.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"])(
    "%s è bloccato",
    (address) => {
      expect(isPublicAddress(address)).toBe(false);
    },
  );

  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])("%s è pubblico", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it("un dominio che risolve anche solo in parte verso un indirizzo interno viene rifiutato", async () => {
    await expect(resolvePublic("ok.example", async () => [{ address: "1.1.1.1", family: 4 }])).resolves.toEqual({ address: "1.1.1.1", family: 4 });
    await expect(
      resolvePublic("misto.example", async () => [
        { address: "1.1.1.1", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    ).rejects.toMatchObject({ status: 403 });
    await expect(resolvePublic("nessuno.example", async () => Promise.reject(new Error("ENOTFOUND")))).rejects.toMatchObject({ status: 502 });
  });
});
