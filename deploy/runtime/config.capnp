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
    # Uscita verso la rete (ADR 0005, 0009): ogni fetch del tool passa da "egress", che la rifiuta
    # oppure, se il tool ha dichiarato domini, la inoltra al proxy della piattaforma. È il secondo strato
    # oltre alla rete Docker interna: anche con una rete configurata male, il tool non esce da solo.
    (name = "egress", worker = .egress),
    # L'unica rete che egress può raggiungere: la piattaforma sulla rete privata del tool.
    (name = "egress-net", network = (allow = ["private"])),
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
  globalOutbound = "egress",
);

const egress :Workerd.Worker = (
  modules = [(name = "egress.js", esModule = embed "egress.js")],
  compatibilityDate = "2025-09-01",
  bindings = [
    # Impostate dall'orchestratore; vuote o assenti se il tool non ha uscita.
    (name = "EGRESS_URL", fromEnvironment = "SHAREBOX_EGRESS_URL"),
    (name = "EGRESS_TOKEN", fromEnvironment = "SHAREBOX_EGRESS_TOKEN"),
  ],
  globalOutbound = "egress-net",
);
