import { describe, expect, it } from "vitest";
import { effectiveRole, type ToolGrant } from "../src/access";

const owner = "guido@gmail.com";
const anna = { email: "anna@azienda.com", hostedDomain: "azienda.com" };

describe("effectiveRole", () => {
  it("il proprietario gestisce sempre", () => {
    expect(effectiveRole({ email: owner, hostedDomain: null }, owner, [])).toBe("manage");
  });

  it("senza condivisioni nessun accesso", () => {
    expect(effectiveRole(anna, owner, [])).toBeNull();
  });

  it("condivisione per email", () => {
    const grants: ToolGrant[] = [{ principal: { type: "user", email: "anna@azienda.com" }, role: "use" }];
    expect(effectiveRole(anna, owner, grants)).toBe("use");
    expect(effectiveRole({ email: "bruno@azienda.com", hostedDomain: "azienda.com" }, owner, grants)).toBeNull();
  });

  it("condivisione di dominio solo per account Workspace di quel dominio", () => {
    const grants: ToolGrant[] = [{ principal: { type: "domain", domain: "azienda.com" }, role: "use" }];
    expect(effectiveRole(anna, owner, grants)).toBe("use");
    // Account Google personale creato con un indirizzo @azienda.com: niente claim hd.
    expect(effectiveRole({ email: "finto@azienda.com", hostedDomain: null }, owner, grants)).toBeNull();
    expect(effectiveRole({ email: "x@altra.com", hostedDomain: "altra.com" }, owner, grants)).toBeNull();
  });

  it("chiunque abbia il link", () => {
    const grants: ToolGrant[] = [{ principal: { type: "anyone" }, role: "use" }];
    expect(effectiveRole({ email: "chiunque@gmail.com", hostedDomain: null }, owner, grants)).toBe("use");
  });

  it("tra più condivisioni valide vince il ruolo più alto", () => {
    const grants: ToolGrant[] = [
      { principal: { type: "anyone" }, role: "use" },
      { principal: { type: "domain", domain: "azienda.com" }, role: "manage" },
      { principal: { type: "user", email: "anna@azienda.com" }, role: "use" },
    ];
    expect(effectiveRole(anna, owner, grants)).toBe("manage");
  });
});
