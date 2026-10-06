// Chiamate all'orchestratore (packages/orchestrator), l'unico processo con accesso a Docker.

export interface ToolStatus {
  state: string;
  restarts: number;
  startedAt: string | null;
  oomKilled: boolean;
}

export interface LogLine {
  stream: "stdout" | "stderr";
  time: string;
  text: string;
}

export interface Orchestrator {
  /** `files`: percorso → contenuto in base64, già completi dei file della piattaforma. */
  deploy(toolId: string, version: number, files: Record<string, string>): Promise<void>;
  remove(toolId: string): Promise<void>;
  sync(): Promise<number>;
  status(toolId: string): Promise<ToolStatus>;
  logs(toolId: string, tail: number): Promise<LogLine[]>;
  stop(toolId: string): Promise<void>;
  start(toolId: string): Promise<void>;
}

/** Errore restituito dall'orchestratore; `status` 400 vuol dire richiesta non valida. */
export class OrchestratorError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function httpOrchestrator(baseUrl: string, token: string, fetchFn: typeof fetch = fetch): Orchestrator {
  async function call(method: string, path: string, body?: object): Promise<Record<string, unknown>> {
    const response = await fetchFn(`${baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      // Il primo avvio di un tool può richiedere qualche secondo.
      signal: AbortSignal.timeout(120_000),
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new OrchestratorError(String(data.error ?? `orchestratore: HTTP ${response.status}`), response.status);
    return data;
  }

  return {
    deploy: async (toolId, version, files) => {
      await call("PUT", `/tools/${toolId}/versions/${version}`, { files });
    },
    remove: async (toolId) => {
      await call("DELETE", `/tools/${toolId}`);
    },
    sync: async () => Number((await call("POST", "/sync")).networks ?? 0),
    status: async (toolId) => (await call("GET", `/tools/${toolId}/status`)) as unknown as ToolStatus,
    logs: async (toolId, tail) => (await call("GET", `/tools/${toolId}/logs?tail=${tail}`)).lines as LogLine[],
    stop: async (toolId) => {
      await call("POST", `/tools/${toolId}/stop`);
    },
    start: async (toolId) => {
      await call("POST", `/tools/${toolId}/start`);
    },
  };
}
