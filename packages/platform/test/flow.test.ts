// Flusso completo in memoria: piattaforma + gateway, con Google e container del tool simulati.
import { createGateway } from "@sharebox/gateway";
import { beforeEach, describe, expect, it } from "vitest";
import { LOGIN_STATE_COOKIE, PLATFORM_SESSION_COOKIE } from "../src/cookies";
import { openDatabase } from "../src/db";
import { GOOGLE_TOKEN_URL } from "../src/google";
import { createPlatformApp, PLATFORM_SESSION_TTL } from "../src/platform-app";
import { Store } from "../src/store";
import { createToolAuthenticator } from "../src/tool-auth";
import { fakeIdToken, publishedTool, setCookieValue, testConfig } from "./helpers";

const PLATFORM = "https://sharebox.test";
const TOOL_SESSION = "__Host-sharebox";

interface Account {
  sub: string;
  email: string;
  name: string;
  hd?: string;
}

const guido: Account = { sub: "g-1", email: "guido@gmail.com", name: "Guido" };
const anna: Account = { sub: "a-1", email: "anna@azienda.com", name: "Anna Rossi", hd: "azienda.com" };
// Account Google personale registrato con un indirizzo @azienda.com: nessun claim hd.
const finto: Account = { sub: "f-1", email: "finto@azienda.com", name: "Finto" };

let clock: number;
let store: Store;
let platform: (request: Request) => Promise<Response>;
let gateway: (request: Request) => Promise<Response>;
let upstreamCalls: { url: string; headers: Headers }[];
let googleAccount: Account;
let googleNonce: string;

beforeEach(() => {
  clock = 1_800_000_000_000;
  const now = () => clock;
  store = new Store(openDatabase(":memory:"), now);
  const config = testConfig();

  const fakeGoogle = (async (url: string, init: RequestInit) => {
    expect(url).toBe(GOOGLE_TOKEN_URL);
    const form = new URLSearchParams(init.body as URLSearchParams);
    expect(form.get("client_secret")).toBe("secret-1");
    expect(form.get("code_verifier")).toBeTruthy();
    const { sub, email, name, hd } = googleAccount;
    return Response.json({
      id_token: fakeIdToken({
        iss: "https://accounts.google.com",
        aud: "client-1",
        exp: Math.floor(clock / 1000) + 3600,
        nonce: googleNonce,
        sub,
        email,
        email_verified: true,
        name,
        ...(hd ? { hd } : {}),
      }),
    });
  }) as typeof fetch;

  platform = createPlatformApp({ config, store, fetchFn: fakeGoogle, now });
  upstreamCalls = [];
  gateway = createGateway({
    toolsDomain: config.toolsDomain,
    authenticate: createToolAuthenticator({ config, store }),
    fetchUpstream: (async (url: URL, init: RequestInit) => {
      upstreamCalls.push({ url: String(url), headers: new Headers(init.headers) });
      return new Response("contenuto del tool");
    }) as typeof fetch,
  });

  publishedTool(store, { id: "t-ferie", slug: "ferie", name: "Ferie team", ownerEmail: guido.email });
});

function get(url: string, cookie?: string): Request {
  return new Request(url, cookie ? { headers: { cookie } } : undefined);
}

/** Login Google completo sulla piattaforma; restituisce il cookie di sessione della piattaforma. */
async function login(account: Account): Promise<string> {
  const start = await platform(get(`${PLATFORM}/auth/login?next=/`));
  expect(start.status).toBe(302);
  const google = new URL(start.headers.get("location")!);
  googleAccount = account;
  googleNonce = google.searchParams.get("nonce")!;
  const state = google.searchParams.get("state")!;
  const back = await platform(
    get(`${PLATFORM}/auth/callback?state=${state}&code=codice-google`, `${LOGIN_STATE_COOKIE}=${setCookieValue(start, LOGIN_STATE_COOKIE)}`),
  );
  expect(back.status).toBe(302);
  return `${PLATFORM_SESSION_COOKIE}=${setCookieValue(back, PLATFORM_SESSION_COOKIE)}`;
}

/** Dalla piattaforma al tool: restituisce la risposta di /auth/tool e, se l'accesso è concesso, il cookie del tool. */
async function enterTool(slug: string, platformCookie: string, next = "/") {
  const entry = await platform(get(`${PLATFORM}/auth/tool?tool=${slug}&next=${encodeURIComponent(next)}`, platformCookie));
  if (entry.status !== 302) return { entry, toolCookie: null, landing: null };
  const callback = entry.headers.get("location")!;
  expect(callback.startsWith(`https://${slug}.sbx.test/__sharebox/auth/callback?`)).toBe(true);
  const landing = await gateway(get(callback));
  return { entry, landing, toolCookie: `${TOOL_SESSION}=${setCookieValue(landing, TOOL_SESSION)}`, callback };
}

describe("flusso completo", () => {
  it("login Google, ingresso nel tool, identità e ruolo inoltrati al container", async () => {
    const { landing, toolCookie } = await enterTool("ferie", await login(guido), "/calendario?anno=2026");
    expect(landing!.status).toBe(302);
    expect(landing!.headers.get("location")).toBe("/calendario?anno=2026");

    const res = await gateway(get("https://ferie.sbx.test/calendario?anno=2026", toolCookie!));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("contenuto del tool");
    expect(upstreamCalls[0]!.url).toBe("http://tool-t-ferie:8080/calendario?anno=2026");
    expect(upstreamCalls[0]!.headers.get("x-sharebox-email")).toBe("guido@gmail.com");
    expect(upstreamCalls[0]!.headers.get("x-sharebox-role")).toBe("manage");
    expect(upstreamCalls[0]!.headers.has("cookie")).toBe(false);
  });

  it("senza sessione: la navigazione va al login, le chiamate dal codice ricevono 401", async () => {
    const nav = await gateway(get("https://ferie.sbx.test/pagina?x=1"));
    expect(nav.status).toBe(302);
    const location = new URL(nav.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(`${PLATFORM}/auth/tool`);
    expect(location.searchParams.get("next")).toBe("/pagina?x=1");

    const api = await gateway(new Request("https://ferie.sbx.test/api", { method: "POST", headers: { "sec-fetch-site": "same-origin" } }));
    expect(api.status).toBe(401);
    expect(upstreamCalls).toHaveLength(0);
  });

  it("/auth/tool senza sessione della piattaforma avvia il login e poi torna al tool", async () => {
    const res = await platform(get(`${PLATFORM}/auth/tool?tool=ferie&next=/x`));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/auth/login?next=${encodeURIComponent("/auth/tool?tool=ferie&next=/x")}`);
  });
});

describe("permessi", () => {
  it("chi non ha una condivisione riceve 403 e nessun codice", async () => {
    const { entry } = await enterTool("ferie", await login(anna));
    expect(entry.status).toBe(403);
    expect(await entry.text()).toContain("anna@azienda.com");
  });

  it("la condivisione di dominio vale per gli account Workspace, non per chi ha solo l'email", async () => {
    store.setGrant("t-ferie", { type: "domain", domain: "azienda.com" }, "use");
    const ok = await enterTool("ferie", await login(anna));
    expect(ok.landing!.status).toBe(302);
    await gateway(get("https://ferie.sbx.test/", ok.toolCookie!));
    expect(upstreamCalls[0]!.headers.get("x-sharebox-role")).toBe("use");

    const denied = await enterTool("ferie", await login(finto));
    expect(denied.entry.status).toBe(403);
  });

  it("la revoca vale dalla richiesta successiva", async () => {
    store.setGrant("t-ferie", { type: "user", email: anna.email }, "use");
    const { toolCookie } = await enterTool("ferie", await login(anna));
    expect((await gateway(get("https://ferie.sbx.test/", toolCookie!))).status).toBe(200);

    store.removeGrant("t-ferie", { type: "user", email: anna.email });
    const after = await gateway(get("https://ferie.sbx.test/", toolCookie!));
    expect(after.status).toBe(403);
    expect(upstreamCalls).toHaveLength(1);
  });

  it("un tool creato ma mai pubblicato mostra una pagina di attesa, nella lingua del browser", async () => {
    store.createTool({ id: "t-nuovo", slug: "nuovo", name: "Nuovo", ownerEmail: guido.email });
    const res = await gateway(get("https://nuovo.sbx.test/"));
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("not been published yet");
    const italiano = await gateway(new Request("https://nuovo.sbx.test/", { headers: { "accept-language": "it-IT,it;q=0.9,en;q=0.8" } }));
    const html = await italiano.text();
    expect(html).toContain('<html lang="it">');
    expect(html).toContain("non è ancora stato pubblicato");
  });

  it("un tool sospeso non è raggiungibile nemmeno dal proprietario", async () => {
    const { toolCookie } = await enterTool("ferie", await login(guido));
    store.setToolStatus("t-ferie", "suspended");
    expect((await gateway(get("https://ferie.sbx.test/", toolCookie!))).status).toBe(503);
    expect(upstreamCalls).toHaveLength(0);
  });
});

describe("sessioni e codici", () => {
  it("il codice monouso non si può riusare", async () => {
    const { callback } = await enterTool("ferie", await login(guido));
    expect((await gateway(get(callback!))).status).toBe(400);
  });

  it("il codice emesso per un tool non vale per un altro", async () => {
    publishedTool(store, { id: "t-altro", slug: "altro", name: "Altro", ownerEmail: guido.email });
    const entry = await platform(get(`${PLATFORM}/auth/tool?tool=ferie`, await login(guido)));
    const code = new URL(entry.headers.get("location")!).searchParams.get("code")!;
    expect((await gateway(get(`https://altro.sbx.test/__sharebox/auth/callback?code=${code}`))).status).toBe(400);
  });

  it("la sessione di un tool non apre un altro tool", async () => {
    publishedTool(store, { id: "t-altro", slug: "altro", name: "Altro", ownerEmail: guido.email });
    const { toolCookie } = await enterTool("ferie", await login(guido));
    expect((await gateway(get("https://altro.sbx.test/", toolCookie!))).status).toBe(302);
    expect(upstreamCalls).toHaveLength(0);
  });

  it("il codice scade dopo un minuto", async () => {
    const entry = await platform(get(`${PLATFORM}/auth/tool?tool=ferie`, await login(guido)));
    clock += 61_000;
    expect((await gateway(get(entry.headers.get("location")!))).status).toBe(400);
  });

  it("la sessione della piattaforma scade", async () => {
    const cookie = await login(guido);
    clock += PLATFORM_SESSION_TTL + 1;
    const res = await platform(get(`${PLATFORM}/auth/tool?tool=ferie`, cookie));
    expect(res.headers.get("location")!.startsWith("/auth/login")).toBe(true);
  });
});

describe("login della CLI", () => {
  const params = "port=53123&state=stato-casuale-abcdefgh&device=PC%20di%20Guido";
  const post = (cookie: string, origin: string | null, fetchSite?: string) =>
    platform(
      new Request(`${PLATFORM}/auth/cli`, {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/x-www-form-urlencoded",
          ...(origin ? { origin } : {}),
          ...(fetchSite ? { "sec-fetch-site": fetchSite } : {}),
        },
        body: params,
      }),
    );

  it("senza sessione passa dal login Google", async () => {
    const res = await platform(get(`${PLATFORM}/auth/cli?${params}`));
    expect(res.headers.get("location")!.startsWith("/auth/login?next=")).toBe(true);
  });

  it("chiede conferma, poi consegna un token valido solo all'indirizzo locale della CLI", async () => {
    const cookie = await login(guido);
    const confirm = await platform(get(`${PLATFORM}/auth/cli?${params}`, cookie));
    expect(confirm.status).toBe(200);
    expect(await confirm.text()).toContain("PC di Guido");

    const res = await post(cookie, PLATFORM);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe("http://127.0.0.1:53123");
    expect(location.searchParams.get("state")).toBe("stato-casuale-abcdefgh");
    expect(store.userByApiToken(location.searchParams.get("token")!)!.email).toBe(guido.email);
  });

  it("rifiuta un modulo inviato da un altro sito", async () => {
    const cookie = await login(guido);
    expect((await post(cookie, "https://evil.example")).status).toBe(403);
    expect((await post(cookie, "https://evil.example", "cross-site")).status).toBe(403);
    expect((await post(cookie, "null", "same-site")).status).toBe(403);
    expect((await post(cookie, null)).status).toBe(403);
  });

  it("accetta il modulo della propria pagina anche con Origin null (referrer-policy no-referrer)", async () => {
    const cookie = await login(guido);
    const res = await post(cookie, "null", "same-origin");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")!.startsWith("http://127.0.0.1:53123/callback?")).toBe(true);
  });

  it.each(["port=80&state=stato-casuale-abcdefgh", "port=53123&state=corto", "port=abc&state=stato-casuale-abcdefgh"])(
    "rifiuta parametri non validi: %s",
    async (query) => {
      expect((await platform(get(`${PLATFORM}/auth/cli?${query}`, await login(guido)))).status).toBe(400);
    },
  );
});

describe("protezioni del login", () => {
  it("rifiuta il ritorno da Google senza il cookie del browser che ha avviato il login", async () => {
    const start = await platform(get(`${PLATFORM}/auth/login`));
    const state = new URL(start.headers.get("location")!).searchParams.get("state");
    const res = await platform(get(`${PLATFORM}/auth/callback?state=${state}&code=x`));
    expect(res.status).toBe(400);
  });

  it("lo stato del login si usa una volta sola", async () => {
    const start = await platform(get(`${PLATFORM}/auth/login`));
    const google = new URL(start.headers.get("location")!);
    googleAccount = guido;
    googleNonce = google.searchParams.get("nonce")!;
    const callback = get(
      `${PLATFORM}/auth/callback?state=${google.searchParams.get("state")}&code=x`,
      `${LOGIN_STATE_COOKIE}=${setCookieValue(start, LOGIN_STATE_COOKIE)}`,
    );
    expect((await platform(callback.clone())).status).toBe(302);
    expect((await platform(callback)).status).toBe(400);
  });

  it("ignora destinazioni esterne dopo il login e dopo l'ingresso nel tool", async () => {
    const start = await platform(get(`${PLATFORM}/auth/login?next=${encodeURIComponent("https://evil.example")}`));
    const google = new URL(start.headers.get("location")!);
    googleAccount = guido;
    googleNonce = google.searchParams.get("nonce")!;
    const back = await platform(
      get(`${PLATFORM}/auth/callback?state=${google.searchParams.get("state")}&code=x`, `${LOGIN_STATE_COOKIE}=${setCookieValue(start, LOGIN_STATE_COOKIE)}`),
    );
    expect(back.headers.get("location")).toBe("/");

    const { landing } = await enterTool("ferie", `${PLATFORM_SESSION_COOKIE}=${setCookieValue(back, PLATFORM_SESSION_COOKIE)}`, "//evil.example");
    expect(landing!.headers.get("location")).toBe("/");
  });

  it("segna come creatore solo le email configurate", async () => {
    await login(guido);
    await login(anna);
    expect(store.userBySub(guido.sub)!.isCreator).toBe(true);
    expect(store.userBySub(anna.sub)!.isCreator).toBe(false);
  });
});

describe("dashboard", () => {
  const files = { html: "<html>dashboard</html>", js: "console.log(1)", css: "body{}" };
  const app = () => createPlatformApp({ config: testConfig(), store, dashboard: files, now: () => clock });

  it("senza sessione porta al login, poi torna alla dashboard", async () => {
    const res = await app()(get(`${PLATFORM}/app`));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth/login?next=%2Fapp");
  });

  it("con sessione serve la pagina con una CSP rigida", async () => {
    const res = await app()(get(`${PLATFORM}/app`, await login(guido)));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(files.html);
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-inline");
  });

  it("serve script e stili con il tipo giusto", async () => {
    const js = await app()(get(`${PLATFORM}/app/app.js`));
    expect(js.headers.get("content-type")).toContain("text/javascript");
    expect((await app()(get(`${PLATFORM}/app/app.css`))).headers.get("content-type")).toContain("text/css");
    expect((await app()(get(`${PLATFORM}/app/altro.js`))).status).toBe(404);
  });
});

describe("distribuzione della CLI", () => {
  it("serve il pacchetto npm della CLI a chiunque, se presente", async () => {
    const tarball = new Uint8Array([31, 139, 8, 0]);
    const withCli = createPlatformApp({ config: testConfig(), store, cliTarball: tarball });
    const res = await withCli(get(`${PLATFORM}/cli/sharebox.tgz`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/gzip");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(tarball);

    const without = createPlatformApp({ config: testConfig(), store });
    expect((await without(get(`${PLATFORM}/cli/sharebox.tgz`))).status).toBe(404);
  });
});
