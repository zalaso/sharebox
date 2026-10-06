import { describe, expect, it } from "vitest";
import { detectLang } from "../src/i18n";

describe("detectLang", () => {
  it("SHAREBOX_LANG ha la precedenza sul locale", () => {
    expect(detectLang({ SHAREBOX_LANG: "en", LANG: "it_IT.UTF-8" })).toBe("en");
    expect(detectLang({ SHAREBOX_LANG: "it", LANG: "en_US.UTF-8" })).toBe("it");
  });

  it("usa le variabili di locale nell'ordine di POSIX", () => {
    expect(detectLang({ LC_ALL: "it_IT.UTF-8", LANG: "en_US.UTF-8" })).toBe("it");
    expect(detectLang({ LANG: "it_IT.UTF-8" })).toBe("it");
    expect(detectLang({ LANG: "de_DE.UTF-8" })).toBe("en");
  });

  it("ignora C e POSIX e passa alla variabile successiva", () => {
    expect(detectLang({ LC_ALL: "C.UTF-8", LANG: "it_IT.UTF-8" })).toBe("it");
    expect(detectLang({ LC_ALL: "POSIX", LANG: "it_IT.UTF-8" })).toBe("it");
  });
});
