import { createHash, randomBytes } from "node:crypto";

/** Token casuale da 256 bit, sicuro in URL e cookie. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Nel database si salva solo l'hash dei token: una copia del database non dà accesso alle sessioni. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Identificativo casuale di lettere minuscole e cifre (per id dei tool e suffissi degli indirizzi). */
export function randomId(length: number): string {
  let id = "";
  while (id.length < length) {
    for (const byte of randomBytes(length)) {
      // Scarta i valori che renderebbero alcune lettere più probabili di altre.
      if (byte < 252 && id.length < length) id += ID_ALPHABET[byte % 36];
    }
  }
  return id;
}

/** Challenge PKCE (RFC 7636, metodo S256). */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
