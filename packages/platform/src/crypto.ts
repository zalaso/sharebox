import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

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

/**
 * Chiave per cifrare i segreti dei tool, derivata da un segreto già presente nella configurazione:
 * un backup del database da solo non basta a leggerli.
 */
export function secretsKey(material: string): Buffer {
  return Buffer.from(hkdfSync("sha256", material, "sharebox", "tool-secrets-v1", 32));
}

/** AES-256-GCM: "v1." + base64url(iv | tag | testo cifrato). */
export function encryptSecret(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url")}`;
}

export function decryptSecret(key: Buffer, value: string): string {
  if (!value.startsWith("v1.")) throw new Error("formato del segreto sconosciuto");
  const data = Buffer.from(value.slice(3), "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}

/** Challenge PKCE (RFC 7636, metodo S256). */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
