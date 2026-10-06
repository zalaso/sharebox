import { describe, expect, it } from "vitest";
import { format, pickLang } from "../src/i18n";

describe("pickLang", () => {
  it.each([
    ["it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7", "it"],
    ["en-US,en;q=0.9,it;q=0.8", "en"],
    ["de-DE,de;q=0.9,it;q=0.8", "it"],
    ["fr-FR,fr;q=0.9", "en"],
    ["en;q=0.5,it;q=0.9", "it"],
    ["it;q=0", "en"],
    ["it_IT.UTF-8", "it"],
    ["C.UTF-8", "en"],
    ["", "en"],
    [null, "en"],
  ])("%s → %s", (header, lang) => {
    expect(pickLang(header)).toBe(lang);
  });
});

describe("format", () => {
  it("sostituisce i parametri e lascia quelli mancanti", () => {
    expect(format("Ciao {nome}, hai {n} tool e {altro}", { nome: "Anna", n: 3 })).toBe("Ciao Anna, hai 3 tool e {altro}");
  });
});
