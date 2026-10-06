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
);
