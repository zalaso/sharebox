import { describe, expect, it } from "vitest";
import { BUNDLE_LIMITS, bundleProblem, describeBundleProblem, pathProblem } from "../src/bundle";

describe("pathProblem", () => {
  it.each(["public/index.html", "public/img/logo-2.png", "_sharebox/entry.js", "a.b_c-d"])("accetta %s", (path) => {
    expect(pathProblem(path)).toBeNull();
  });

  it.each([
    "",
    "/etc/passwd",
    "../fuori",
    "public/../../fuori",
    "public/./x",
    "public//x",
    "public\\x",
    "con spazio.html",
    "public/%2e%2e/x",
    "a".repeat(201),
  ])("rifiuta %s", (path) => {
    expect(pathProblem(path)).not.toBeNull();
  });
});

describe("bundleProblem", () => {
  const file = (size = 10) => new Uint8Array(size);

  it("accetta un insieme valido", () => {
    expect(bundleProblem(new Map([["public/index.html", file()]]))).toBeNull();
  });

  it("rifiuta un insieme vuoto, troppi file o troppi byte", () => {
    expect(bundleProblem(new Map())).toEqual({ code: "empty" });
    const many = new Map(Array.from({ length: BUNDLE_LIMITS.maxFiles + 1 }, (_, i) => [`f${i}`, file(1)] as const));
    expect(bundleProblem(many)).toEqual({ code: "too_many_files" });
    expect(bundleProblem(new Map([["grande", file(BUNDLE_LIMITS.maxBytes + 1)]]))).toEqual({ code: "too_big" });
  });

  it("segnala il file con il percorso non valido, in italiano e in inglese", () => {
    const problem = bundleProblem(new Map([["foto vacanze.png", file()]]))!;
    expect(describeBundleProblem(problem, "it")).toBe('foto vacanze.png: caratteri non ammessi in "foto vacanze.png" (solo lettere, cifre, . _ -)');
    expect(describeBundleProblem(problem, "en")).toBe('foto vacanze.png: characters not allowed in "foto vacanze.png" (letters, digits, . _ - only)');
  });
});
