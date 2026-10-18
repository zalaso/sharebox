import { describe, expect, it } from "vitest";
import { describeNetworkProblem, hostAllowed, parseNetworkAllow } from "../src/network";

describe("parseNetworkAllow", () => {
  it("accetta domini e sottodomini con *., normalizzati e senza doppioni", () => {
    expect(parseNetworkAllow([" API.Example.com ", "*.example.org", "api.example.com"])).toEqual({ allow: ["api.example.com", "*.example.org"] });
    expect(parseNetworkAllow(undefined)).toEqual({ allow: [] });
  });

  it.each(["https://api.example.com", "api.example.com/v1", "1.2.3.4", "localhost", "api.example.com:8443", "*", "*.com.", "a..b.com", "ex ample.com"])(
    "rifiuta %s",
    (host) => {
      expect(parseNetworkAllow([host])).toEqual({ problem: { code: "invalid_host", host } });
    },
  );

  it("rifiuta valori che non sono elenchi o troppo lunghi", () => {
    expect(parseNetworkAllow("api.example.com")).toEqual({ problem: { code: "not_list" } });
    expect(parseNetworkAllow(Array.from({ length: 21 }, (_, i) => `h${i}.example.com`))).toEqual({ problem: { code: "too_many" } });
  });

  it("descrive il problema in italiano e in inglese", () => {
    const problem = { code: "invalid_host" as const, host: "https://x.com" };
    expect(describeNetworkProblem(problem, "it")).toContain("non è un dominio valido");
    expect(describeNetworkProblem(problem, "en")).toContain("is not a valid domain");
  });
});

describe("hostAllowed", () => {
  it("confronta i nomi esatti e i sottodomini di *.", () => {
    const allow = ["api.example.com", "*.example.org"];
    expect(hostAllowed("api.example.com", allow)).toBe(true);
    expect(hostAllowed("API.EXAMPLE.COM.", allow)).toBe(true);
    expect(hostAllowed("other.example.com", allow)).toBe(false);
    expect(hostAllowed("x.example.org", allow)).toBe(true);
    expect(hostAllowed("a.b.example.org", allow)).toBe(true);
    expect(hostAllowed("example.org", allow)).toBe(false);
    expect(hostAllowed("evilexample.org", allow)).toBe(false);
  });
});
