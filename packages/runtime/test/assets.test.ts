import { describe, expect, it } from "vitest";
import { assetCandidates, contentType, serveAsset, type AssetFetcher } from "../src/assets";

describe("contentType", () => {
  it.each([
    ["/index.html", "text/html; charset=utf-8"],
    ["/app.JS", "text/javascript; charset=utf-8"],
    ["/img/logo.svg", "image/svg+xml"],
    ["/dati", "application/octet-stream"],
    ["/.nascosto", "application/octet-stream"],
  ])("%s → %s", (path, type) => {
    expect(contentType(path)).toBe(type);
  });
});

describe("assetCandidates", () => {
  it.each([
    ["/", ["/index.html"]],
    ["/doc/", ["/doc/index.html"]],
    ["/style.css", ["/style.css"]],
    ["/calendario", ["/calendario", "/calendario.html", "/calendario/index.html"]],
    ["/caff%C3%A8.html", ["/caffè.html"]],
  ])("%s", (pathname, expected) => {
    expect(assetCandidates(pathname)).toEqual(expected);
  });

  it.each(["/%2e%2e/segreto", "/a/%2E%2E/b.html", "/x%5Cy", "/%E0%A4%A"])("non cerca %s", (pathname) => {
    expect(assetCandidates(pathname)).toEqual([]);
  });
});

describe("serveAsset", () => {
  const files: Record<string, string> = {
    "/index.html": "<h1>ciao</h1>",
    "/calendario.html": "<p>cal</p>",
    "/doc/index.html": "<p>doc</p>",
  };
  const disk: AssetFetcher = {
    fetch: async (input) => {
      const path = decodeURIComponent(new URL(String(input)).pathname);
      // Come workerd: chiedere una cartella genera un'eccezione.
      if (path === "/doc") throw new Error("is a directory");
      return path in files
        ? new Response(files[path], { headers: { "content-type": "application/octet-stream", "last-modified": "x" } })
        : new Response("", { status: 404 });
    },
  };

  it("serve la pagina con tipo e cache corretti", async () => {
    const res = (await serveAsset(disk, new Request("https://t.test/")))!;
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toBe("<h1>ciao</h1>");
  });

  it("trova la pagina senza estensione", async () => {
    expect(await (await serveAsset(disk, new Request("https://t.test/calendario")))!.text()).toBe("<p>cal</p>");
  });

  it("trova l'index di una cartella anche senza barra finale", async () => {
    expect(await (await serveAsset(disk, new Request("https://t.test/doc")))!.text()).toBe("<p>doc</p>");
  });

  it("restituisce null se il file non c'è o se la richiesta non è GET/HEAD", async () => {
    expect(await serveAsset(disk, new Request("https://t.test/api/giorni"))).toBeNull();
    expect(await serveAsset(disk, new Request("https://t.test/", { method: "POST" }))).toBeNull();
  });
});
