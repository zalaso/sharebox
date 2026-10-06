import { describe, expect, it } from "vitest";
import { toolSlugFromHost } from "../src/host";

describe("toolSlugFromHost", () => {
  const domain = "sbxapps.dev";

  it("estrae lo slug da un sottodominio di primo livello", () => {
    expect(toolSlugFromHost("ferie-k3x9.sbxapps.dev", domain)).toBe("ferie-k3x9");
  });

  it("ignora le maiuscole", () => {
    expect(toolSlugFromHost("Ferie-K3X9.SbxApps.dev", domain)).toBe("ferie-k3x9");
  });

  it.each([
    ["sbxapps.dev", "il dominio nudo"],
    ["a.b.sbxapps.dev", "più livelli"],
    ["ferie.evilsbxapps.dev", "un dominio che finisce con lo stesso testo"],
    ["-ferie.sbxapps.dev", "trattino iniziale"],
    ["ferie_team.sbxapps.dev", "caratteri non validi"],
    ["ferie.sharebox.app", "un altro dominio"],
  ])("rifiuta %s (%s)", (host) => {
    expect(toolSlugFromHost(host, domain)).toBeNull();
  });
});
