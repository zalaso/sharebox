import { describe, expect, it } from "vitest";
import { readCookie } from "../src/cookies";
import { escapeHtml, safePath } from "../src/html";

describe("safePath", () => {
  it.each(["/", "/pagina?x=1", "/auth/tool?tool=ferie&next=%2F"])("accetta %s", (path) => {
    expect(safePath(path)).toBe(path);
  });

  it.each([null, "", "https://evil.example", "//evil.example", "/\\evil.example", "pagina", "/" + "a".repeat(2001)])(
    "rifiuta %s",
    (path) => {
      expect(safePath(path)).toBe("/");
    },
  );
});

describe("readCookie", () => {
  it("legge il cookie richiesto tra molti", () => {
    expect(readCookie("a=1; __Host-sharebox=tok=en; b=2", "__Host-sharebox")).toBe("tok=en");
    expect(readCookie("a=1", "__Host-sharebox")).toBeNull();
    expect(readCookie(null, "a")).toBeNull();
  });
});

describe("escapeHtml", () => {
  it("neutralizza i caratteri speciali", () => {
    expect(escapeHtml(`<script>"'&`)).toBe("&lt;script&gt;&quot;&#39;&amp;");
  });
});
