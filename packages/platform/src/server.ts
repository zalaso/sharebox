// Processo unico della piattaforma: login e API su PLATFORM_DOMAIN, gateway dei tool su *.TOOLS_DOMAIN (ADR 0007).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:http";
import { createGateway } from "@sharebox/gateway";
import { runAdmin } from "./admin";
import { createApi } from "./api";
import { loadConfig } from "./config";
import { openDatabase } from "./db";
import { nodeHandler } from "./node-http";
import { httpOrchestrator } from "./orchestrator-client";
import { createPlatformApp } from "./platform-app";
import { Store } from "./store";
import { createToolAuthenticator } from "./tool-auth";

const config = loadConfig();
const store = new Store(openDatabase(config.databasePath));
const orchestrator = httpOrchestrator(config.orchestratorUrl, config.orchestratorToken);

if (process.argv[2] === "admin") {
  runAdmin(process.argv.slice(3), store, orchestrator).then(
    (output) => console.log(output),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    },
  );
} else {
  store.purgeExpired();
  setInterval(() => store.purgeExpired(), 60 * 60 * 1000).unref();

  const read = (file: string) => readFileSync(join(config.dashboardDir, file), "utf8");
  const platform = createPlatformApp({ config, store, dashboard: { html: read("index.html"), js: read("app.js"), css: read("app.css") } });
  const api = createApi({ config, store, orchestrator, runtimeEntry: readFileSync(config.runtimeEntryPath, "utf8") });
  const gateway = createGateway({
    toolsDomain: config.toolsDomain,
    authenticate: createToolAuthenticator({ config, store }),
  });

  createServer(
    nodeHandler((request) => {
      const url = new URL(request.url);
      if (url.hostname !== config.platformDomain) return gateway(request);
      return url.pathname.startsWith("/api/") ? api(request) : platform(request);
    }),
  ).listen(config.port, config.listenHost, () => {
    console.log(`platform su ${config.listenHost}:${config.port} — ${config.platformDomain}, *.${config.toolsDomain}`);
    void syncNetworks();
  });
}

/** Un container ricreato perde i collegamenti alle reti dei tool: l'orchestratore li ripristina. */
async function syncNetworks(attempt = 1): Promise<void> {
  try {
    console.log(`reti dei tool ricollegate: ${await orchestrator.sync()}`);
  } catch (error) {
    if (attempt >= 12) return console.error("Collegamento alle reti dei tool non riuscito:", error);
    setTimeout(() => void syncNetworks(attempt + 1), 5000).unref();
  }
}
