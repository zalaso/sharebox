import { describe, expect, it } from "vitest";
import { authorizationUrl, profileFromIdToken } from "../src/google";
import { fakeIdToken } from "./helpers";

const now = 1_800_000_000;
const expected = { clientId: "client-1", nonce: "n-1", nowSeconds: now };
const valid = {
  iss: "https://accounts.google.com",
  aud: "client-1",
  exp: now + 3600,
  nonce: "n-1",
  sub: "1234",
  email: "Anna@Azienda.com",
  email_verified: true,
  name: "Anna Rossi",
  hd: "azienda.com",
};

describe("profileFromIdToken", () => {
  it("estrae il profilo e normalizza email e dominio", () => {
    expect(profileFromIdToken(fakeIdToken(valid), expected)).toEqual({
      sub: "1234",
      email: "anna@azienda.com",
      name: "Anna Rossi",
      hostedDomain: "azienda.com",
    });
  });

  it("account senza dominio Workspace e senza nome", () => {
    const { hd: _, name: __, ...personal } = valid;
    expect(profileFromIdToken(fakeIdToken(personal), expected)).toMatchObject({ hostedDomain: null, name: "anna@azienda.com" });
  });

  it.each([
    ["emittente", { iss: "https://evil.example" }],
    ["destinatario", { aud: "altro-client" }],
    ["scadenza", { exp: now }],
    ["nonce", { nonce: "n-2" }],
    ["email non verificata", { email_verified: false }],
    ["sub mancante", { sub: undefined }],
  ])("rifiuta un token con %s non valido", (_, override) => {
    expect(() => profileFromIdToken(fakeIdToken({ ...valid, ...override }), expected)).toThrow();
  });

  it("rifiuta un token malformato", () => {
    expect(() => profileFromIdToken("non-un-jwt", expected)).toThrow();
  });
});

describe("authorizationUrl", () => {
  it("chiede solo openid, email e profilo, con PKCE", () => {
    const url = new URL(
      authorizationUrl(
        { clientId: "client-1", clientSecret: "s", redirectUri: "https://sharebox.test/auth/callback" },
        { state: "st", nonce: "no", codeChallenge: "ch" },
      ),
    );
    expect(url.origin).toBe("https://accounts.google.com");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      scope: "openid email profile",
      response_type: "code",
      redirect_uri: "https://sharebox.test/auth/callback",
      state: "st",
      nonce: "no",
      code_challenge: "ch",
      code_challenge_method: "S256",
    });
  });
});
