using Workerd = import "/workerd/workerd.capnp";

# I file del tool sono in /tool/code (sola lettura), scritti dall'orchestratore a ogni pubblicazione:
#   code/public/…               asset statici del creatore
#   code/_sharebox/entry.js     runtime della piattaforma (packages/runtime)
#   code/_sharebox/user.js      worker del creatore, o modulo vuoto
const config :Workerd.Config = (
  services = [
    (name = "main", worker = .tool),
    (name = "assets", disk = (path = "/tool/code/public")),
    (name = "data", disk = (path = "/data", writable = true)),
    # Uscita verso la rete: nessuna. Secondo strato oltre alla rete Docker interna (ADR 0005):
    # anche con una rete configurata male, una fetch del tool verso l'esterno riceve questo errore.
    (name = "no-network", worker = .noNetwork),
  ],
  sockets = [(name = "http", address = "*:8080", http = (), service = "main")],
);

const tool :Workerd.Worker = (
  modules = [
    (name = "entry.js", esModule = embed "code/_sharebox/entry.js"),
    (name = "user.js", esModule = embed "code/_sharebox/user.js"),
  ],
  compatibilityDate = "2025-09-01",
  bindings = [
    (name = "ASSETS", service = "assets"),
    (name = "DATA", durableObjectNamespace = "ToolData"),
  ],
  durableObjectNamespaces = [(className = "ToolData", uniqueKey = "sharebox-tool-data", enableSql = true)],
  durableObjectStorage = (localDisk = "data"),
  globalOutbound = "no-network",
);

const noNetwork :Workerd.Worker = (
  modules = [(
    name = "no-network.js",
    esModule = "export default { fetch() { return new Response(\"ShareBox tools have no internet access\", { status: 502, headers: { \"content-type\": \"text/plain\" } }); } };",
  )],
  compatibilityDate = "2025-09-01",
);
