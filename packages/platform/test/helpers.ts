import type { Config } from "../src/config";
import type { Store, Tool } from "../src/store";

export function testConfig(): Config {
  return {
    toolsDomain: "sbx.test",
    platformDomain: "sharebox.test",
    googleClientId: "client-1",
    googleClientSecret: "secret-1",
    creatorEmails: new Set(["guido@gmail.com"]),
    databasePath: ":memory:",
    listenHost: "127.0.0.1",
    port: 0,
    orchestratorUrl: "http://orchestrator.test",
    orchestratorToken: "token-orchestratore",
    runtimeEntryPath: "",
    dashboardDir: "",
  };
}

/** Tool già pubblicato (versione 1), come dopo `sharebox publish`. */
export function publishedTool(store: Store, tool: Omit<Tool, "status">): Tool {
  const created = store.createTool(tool);
  store.recordDeployment(created.id, { version: 1, actorEmail: tool.ownerEmail, files: 1, bytes: 10 });
  return created;
}

/** ID token finto: stessa forma di un JWT, firma assente (la piattaforma non la verifica, vedi google.ts). */
export function fakeIdToken(claims: Record<string, unknown>): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256", typ: "JWT" })}.${part(claims)}.firma`;
}

/** Valore di un cookie impostato dalla risposta, o null. */
export function setCookieValue(response: Response, name: string): string | null {
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    const separator = pair!.indexOf("=");
    if (pair!.slice(0, separator) === name) return pair!.slice(separator + 1);
  }
  return null;
}
