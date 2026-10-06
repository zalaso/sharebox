import { describe, expect, it } from "vitest";
import { assertToolId, containerSpec, networkSpec } from "../src/spec";

describe("containerSpec", () => {
  const spec = containerSpec("abc123", 4, { runtimeImage: "sharebox-runtime:latest", hostCodeDir: "/opt/sharebox/data/tools/abc123/v4" });

  it("gira in gVisor, in sola lettura, senza privilegi", () => {
    expect(spec.HostConfig).toMatchObject({
      Runtime: "runsc",
      ReadonlyRootfs: true,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
    });
    expect(spec.HostConfig).not.toHaveProperty("Privileged");
    expect(spec.HostConfig).not.toHaveProperty("PortBindings");
    expect(spec.HostConfig).not.toHaveProperty("CapAdd");
  });

  it("ha limiti di memoria (senza swap), CPU e processi", () => {
    expect(spec.HostConfig).toMatchObject({
      Memory: 128 * 1024 * 1024,
      MemorySwap: 128 * 1024 * 1024,
      NanoCpus: 250_000_000,
      PidsLimit: 64,
    });
  });

  it("tiene i log a dimensione fissa", () => {
    expect(spec.HostConfig.LogConfig).toEqual({ Type: "json-file", Config: { "max-size": "5m", "max-file": "2" } });
  });

  it("monta solo il codice della versione (sola lettura) e il proprio volume dati", () => {
    expect(spec.HostConfig.Mounts).toEqual([
      { Type: "bind", Source: "/opt/sharebox/data/tools/abc123/v4", Target: "/tool/code", ReadOnly: true },
      { Type: "volume", Source: "sbx-data-abc123", Target: "/data" },
    ]);
  });

  it("sta solo sulla propria rete, raggiungibile come tool-<id>", () => {
    expect(spec.HostConfig.NetworkMode).toBe("sbx-tool-abc123");
    expect(spec.NetworkingConfig.EndpointsConfig).toEqual({ "sbx-tool-abc123": { Aliases: ["tool-abc123"] } });
  });
});

describe("networkSpec", () => {
  it("rete interna e senza indirizzo per l'host", () => {
    expect(networkSpec("abc123")).toMatchObject({
      Internal: true,
      Options: { "com.docker.network.bridge.inhibit_ipv4": "true" },
    });
  });
});

describe("assertToolId", () => {
  it.each(["abc", "k3x9ab12cd", "spike"])("accetta %s", (id) => {
    expect(() => assertToolId(id)).not.toThrow();
  });

  it.each(["", "ab", "ABC", "../etc", "a-b", "a/b", "x".repeat(33), "tool;rm"])("rifiuta %s", (id) => {
    expect(() => assertToolId(id)).toThrow();
  });
});
