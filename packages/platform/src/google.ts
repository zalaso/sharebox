// Login con Google: OpenID Connect, flusso "authorization code" con PKCE.

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  hostedDomain: string | null;
}

export function authorizationUrl(
  client: GoogleClient,
  params: { state: string; nonce: string; codeChallenge: string },
): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: params.state,
    nonce: params.nonce,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

/** Scambia il codice ricevuto da Google con l'ID token. */
export async function exchangeCode(
  client: GoogleClient,
  code: string,
  codeVerifier: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchFn(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: client.redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json()) as { id_token?: string; error?: string };
  if (!response.ok || !body.id_token) throw new Error(`Scambio del codice Google fallito: ${body.error ?? response.status}`);
  return body.id_token;
}

/**
 * Valida l'ID token e ne estrae il profilo.
 * La firma non viene verificata: il token arriva direttamente dall'endpoint di Google su TLS,
 * autenticati con il client secret (OpenID Connect Core 1.0, § 3.1.3.7, punto 6).
 * Non usare questa funzione per token arrivati da altre fonti.
 */
export function profileFromIdToken(
  idToken: string,
  expected: { clientId: string; nonce: string; nowSeconds: number },
): GoogleProfile {
  const claims = decodePayload(idToken);
  if (!GOOGLE_ISSUERS.has(claims.iss as string)) throw new Error("ID token: emittente non valido");
  if (claims.aud !== expected.clientId) throw new Error("ID token: destinatario non valido");
  if (typeof claims.exp !== "number" || claims.exp <= expected.nowSeconds) throw new Error("ID token scaduto");
  if (claims.nonce !== expected.nonce) throw new Error("ID token: nonce non valido");
  if (typeof claims.sub !== "string" || typeof claims.email !== "string") throw new Error("ID token: dati mancanti");
  if (claims.email_verified !== true) throw new Error("Email dell'account Google non verificata");

  const email = claims.email.toLowerCase();
  return {
    sub: claims.sub,
    email,
    name: typeof claims.name === "string" && claims.name ? claims.name : email,
    hostedDomain: typeof claims.hd === "string" ? claims.hd.toLowerCase() : null,
  };
}

function decodePayload(jwt: string): Record<string, unknown> {
  const payload = jwt.split(".")[1];
  if (!payload) throw new Error("ID token malformato");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
}
