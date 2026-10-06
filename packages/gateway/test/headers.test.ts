import { describe, expect, it } from "vitest";
import { forwardedHeaders } from "../src/headers";

const identity = { email: "anna@azienda.com", name: "Anna Rossi" };
const SESSION = "__Host-sharebox";

describe("forwardedHeaders", () => {
  it("sostituisce gli header di identità mandati dal client", () => {
    const incoming = new Headers({
      "x-sharebox-email": "capo@azienda.com",
      "X-ShareBox-Name": "Capo",
      "x-sharebox-role": "manage",
      "x-sharebox-altro": "x",
    });
    const out = forwardedHeaders(incoming, identity, "use", SESSION);
    expect(out.get("x-sharebox-email")).toBe("anna@azienda.com");
    expect(out.get("x-sharebox-name")).toBe("Anna%20Rossi");
    expect(out.get("x-sharebox-role")).toBe("use");
    expect(out.has("x-sharebox-altro")).toBe(false);
  });

  it("toglie il cookie di sessione e lascia quelli del tool", () => {
    const incoming = new Headers({ cookie: `${SESSION}=segreto; tema=scuro; lingua=it` });
    expect(forwardedHeaders(incoming, identity, "use", SESSION).get("cookie")).toBe("tema=scuro; lingua=it");
  });

  it("non inoltra un header cookie vuoto", () => {
    const incoming = new Headers({ cookie: `${SESSION}=segreto` });
    expect(forwardedHeaders(incoming, identity, "use", SESSION).has("cookie")).toBe(false);
  });

  it("codifica i nomi non ASCII", () => {
    const out = forwardedHeaders(new Headers(), { ...identity, name: "Niccolò Bianchi" }, "use", SESSION);
    expect(decodeURIComponent(out.get("x-sharebox-name")!)).toBe("Niccolò Bianchi");
  });

  it("inoltra gli altri header", () => {
    const incoming = new Headers({ "content-type": "application/json", accept: "text/html" });
    const out = forwardedHeaders(incoming, identity, "use", SESSION);
    expect(out.get("content-type")).toBe("application/json");
    expect(out.get("accept")).toBe("text/html");
  });
});
