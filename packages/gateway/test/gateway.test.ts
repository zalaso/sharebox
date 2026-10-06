import { describe, expect, it } from "vitest";
import { createGateway, type Authentication } from "../src/gateway";

const identity = { email: "anna@azienda.com", name: "Anna Rossi" };
const allowed: Authentication = { ok: true, identity, role: "use", upstream: "http://tool-t1:8080" };

function setup(
  upstreamResponse: (init: RequestInit) => Response | Promise<Response> = () => new Response("ok"),
  authenticate: () => Promise<Authentication> = async () => allowed,
  timeoutMs?: number,
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const handle = createGateway({
    toolsDomain: "sbx.duckdns.org",
    authenticate,
    timeoutMs,
    fetchUpstream: (async (url: URL, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return upstreamResponse(init);
    }) as typeof fetch,
  });
  return { handle, calls };
}

describe("createGateway", () => {
  it("inoltra al container indicato dal controllo di accesso, con percorso e query", async () => {
    const { handle, calls } = setup();
    const res = await handle(new Request("https://ferie.sbx.duckdns.org/api/giorni?anno=2026"));
    expect(res.status).toBe(200);
    expect(calls[0]!.url).toBe("http://tool-t1:8080/api/giorni?anno=2026");
  });

  it("passa identità e ruolo, toglie cookie di sessione e header di trasporto", async () => {
    const { handle, calls } = setup();
    await handle(
      new Request("https://ferie.sbx.duckdns.org/", {
        headers: {
          cookie: "__Host-sharebox=segreto; tema=scuro",
          "x-sharebox-email": "finto@x.com",
          "accept-encoding": "gzip",
          connection: "keep-alive",
        },
      }),
    );
    const sent = new Headers(calls[0]!.init.headers);
    expect(sent.get("x-sharebox-email")).toBe("anna@azienda.com");
    expect(sent.get("x-sharebox-role")).toBe("use");
    expect(sent.get("cookie")).toBe("tema=scuro");
    expect(sent.has("accept-encoding")).toBe(false);
    expect(sent.has("connection")).toBe(false);
  });

  it("inoltra il corpo delle richieste che modificano dati", async () => {
    const { handle, calls } = setup();
    await handle(
      new Request("https://ferie.sbx.duckdns.org/api", {
        method: "POST",
        body: '{"giorni":3}',
        headers: { "sec-fetch-site": "same-origin" },
      }),
    );
    expect(calls[0]!.init.method).toBe("POST");
    expect(await new Response(calls[0]!.init.body).text()).toBe('{"giorni":3}');
  });

  it("risponde 404 per host che non sono tool", async () => {
    const { handle, calls } = setup();
    expect((await handle(new Request("https://sbx.duckdns.org/"))).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("blocca le richieste che modificano dati partite da un altro tool", async () => {
    const { handle, calls } = setup();
    const res = await handle(
      new Request("https://ferie.sbx.duckdns.org/api", { method: "POST", headers: { "sec-fetch-site": "same-site" } }),
    );
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("restituisce la risposta del controllo di accesso senza chiamare il tool", async () => {
    const login = new Response(null, { status: 302, headers: { location: "https://sharebox.example/auth/tool" } });
    const { handle, calls } = setup(undefined, async () => ({ ok: false, response: login }));
    const res = await handle(new Request("https://ferie.sbx.duckdns.org/"));
    expect(res.status).toBe(302);
    expect(calls).toHaveLength(0);
  });

  it("impedisce al tool di impostare il cookie di sessione", async () => {
    const upstreamHeaders = new Headers({ "content-type": "text/html", "content-encoding": "gzip" });
    upstreamHeaders.append("set-cookie", "__Host-sharebox=dell-attaccante; Path=/; Secure");
    upstreamHeaders.append("set-cookie", "__host-SHAREBOX=variante; Path=/; Secure");
    upstreamHeaders.append("set-cookie", "tema=scuro; Path=/");
    const { handle } = setup(() => new Response("<p>ciao</p>", { status: 201, headers: upstreamHeaders }));

    const res = await handle(new Request("https://ferie.sbx.duckdns.org/"));
    expect(res.status).toBe(201);
    expect(res.headers.getSetCookie()).toEqual(["tema=scuro; Path=/"]);
    expect(res.headers.has("content-encoding")).toBe(false);
    expect(res.headers.get("content-type")).toBe("text/html");
    expect(await res.text()).toBe("<p>ciao</p>");
  });

  it("risponde 502 se il container non risponde", async () => {
    const { handle } = setup(() => Promise.reject(new TypeError("fetch failed")));
    expect((await handle(new Request("https://ferie.sbx.duckdns.org/"))).status).toBe(502);
  });

  it("risponde 504 se il tool non manda la risposta entro il timeout", async () => {
    const hang = (init: RequestInit) =>
      new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted"))));
    const { handle } = setup(hang, undefined, 20);
    expect((await handle(new Request("https://ferie.sbx.duckdns.org/"))).status).toBe(504);
  });
});
