export interface Config {
  /** Dominio dei tool, es. `guido-sbx.duckdns.org`. */
  toolsDomain: string;
  /** Dominio della piattaforma, es. `sharebox.getceng.it`. */
  platformDomain: string;
  googleClientId: string;
  googleClientSecret: string;
  /** Email che al login diventano creatori (ADR 0006). */
  creatorEmails: Set<string>;
  databasePath: string;
  listenHost: string;
  port: number;
  orchestratorUrl: string;
  orchestratorToken: string;
  /** Runtime da aggiungere a ogni tool (build di packages/runtime). */
  runtimeEntryPath: string;
  /** File della dashboard (copiati da packages/platform/dashboard). */
  dashboardDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    toolsDomain: required(env, "TOOLS_DOMAIN").toLowerCase(),
    platformDomain: required(env, "PLATFORM_DOMAIN").toLowerCase(),
    googleClientId: required(env, "GOOGLE_CLIENT_ID"),
    googleClientSecret: required(env, "GOOGLE_CLIENT_SECRET"),
    creatorEmails: new Set(
      required(env, "CREATOR_EMAILS")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
    databasePath: required(env, "DATABASE_PATH"),
    // Indirizzo sulla rete "edge": i container dei tool non lo raggiungono.
    listenHost: required(env, "LISTEN_HOST"),
    port: Number(env.PORT ?? 8080),
    orchestratorUrl: required(env, "ORCHESTRATOR_URL"),
    orchestratorToken: required(env, "ORCHESTRATOR_TOKEN"),
    runtimeEntryPath: env.RUNTIME_ENTRY_PATH ?? "/app/runtime-entry.js",
    dashboardDir: env.DASHBOARD_DIR ?? "/app/dashboard",
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Variabile d'ambiente mancante: ${name}`);
  return value;
}
