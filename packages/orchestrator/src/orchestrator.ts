import { expectStatus, type Docker } from "./docker";
import { pruneVersions, removeToolFiles, versionDir, writeVersion } from "./files";
import { TOOL_LABEL, assertToolId, assertVersion, containerSpec, names, networkSpec, volumeSpec } from "./spec";

export interface OrchestratorOptions {
  docker: Docker;
  /** Cartella dei file dei tool vista dall'orchestratore (es. /tools). */
  toolsDir: string;
  /** La stessa cartella vista dall'host, per i bind mount dei container dei tool. */
  hostToolsDir: string;
  runtimeImage: string;
  /** Container della piattaforma, da collegare alla rete di ogni tool. */
  platformContainer: string;
}

export interface ToolStatus {
  /** running, restarting, exited, created, paused… oppure missing se il container non esiste. */
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

/**
 * I log di un container senza terminale arrivano a blocchi: 8 byte di intestazione
 * (1 = stdout, 2 = stderr; poi la lunghezza in big-endian) seguiti dal testo.
 */
export function demuxLogs(buffer: Buffer): LogLine[] {
  const lines: LogLine[] = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const stream = buffer[offset] === 2 ? "stderr" : "stdout";
    const size = buffer.readUInt32BE(offset + 4);
    const text = buffer.subarray(offset + 8, offset + 8 + size).toString("utf8");
    offset += 8 + size;
    for (const line of text.split("\n")) {
      if (!line) continue;
      const space = line.indexOf(" ");
      lines.push({ stream, time: space > 0 ? line.slice(0, space) : "", text: space > 0 ? line.slice(space + 1) : line });
    }
  }
  return lines;
}

export class Orchestrator {
  // Operazioni sullo stesso tool una alla volta.
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly options: OrchestratorOptions) {}

  /** Pubblica (o ripubblica) una versione: stessi rete e volume dati, container nuovo. */
  async deploy(id: string, version: number, files: ReadonlyMap<string, Uint8Array>): Promise<void> {
    assertToolId(id);
    assertVersion(version);
    return this.serialized(id, async () => {
      const { docker, toolsDir, hostToolsDir, runtimeImage } = this.options;
      const n = names(id);
      await writeVersion(toolsDir, id, version, files);

      const network = await docker.request("GET", `/networks/${n.network}`);
      if (network.status === 404) expectStatus(await docker.request("POST", "/networks/create", networkSpec(id)), "creazione rete", 201);
      else expectStatus(network, "lettura rete", 200);
      await this.connectPlatform(n.network);
      expectStatus(await docker.request("POST", "/volumes/create", volumeSpec(id)), "creazione volume", 201);

      expectStatus(await docker.request("DELETE", `/containers/${n.container}?force=true`), "rimozione container", 204, 404);
      const spec = containerSpec(id, version, { runtimeImage, hostCodeDir: versionDir(hostToolsDir, id, version) });
      expectStatus(await docker.request("POST", `/containers/create?name=${n.container}`, spec), "creazione container", 201);
      expectStatus(await docker.request("POST", `/containers/${n.container}/start`), "avvio container", 204);

      await pruneVersions(toolsDir, id, [version, version - 1]);
    });
  }

  /** Elimina container, rete, dati e file del tool. */
  async remove(id: string): Promise<void> {
    assertToolId(id);
    return this.serialized(id, async () => {
      const { docker, toolsDir, platformContainer } = this.options;
      const n = names(id);
      expectStatus(await docker.request("DELETE", `/containers/${n.container}?force=true`), "rimozione container", 204, 404);
      const disconnect = await docker.request("POST", `/networks/${n.network}/disconnect`, { Container: platformContainer, Force: true });
      // Docker risponde 500 "is not connected" se il collegamento non c'è già più.
      const notConnected = disconnect.status === 500 && /not connected/i.test(JSON.stringify(disconnect.body));
      if (!notConnected) expectStatus(disconnect, "scollegamento piattaforma", 200, 404);
      expectStatus(await docker.request("DELETE", `/networks/${n.network}`), "rimozione rete", 204, 404);
      expectStatus(await docker.request("DELETE", `/volumes/${n.volume}`), "rimozione volume", 204, 404);
      await removeToolFiles(toolsDir, id);
    });
  }

  /** Stato del container del tool, per la dashboard. */
  async status(id: string): Promise<ToolStatus> {
    assertToolId(id);
    const res = await this.options.docker.request("GET", `/containers/${names(id).container}/json`);
    if (res.status === 404) return { state: "missing", restarts: 0, startedAt: null, oomKilled: false };
    expectStatus(res, "stato del container", 200);
    const { State, RestartCount } = res.body as {
      State: { Status: string; Restarting: boolean; StartedAt: string; OOMKilled: boolean };
      RestartCount: number;
    };
    return {
      state: State.Restarting ? "restarting" : State.Status,
      restarts: RestartCount,
      startedAt: State.StartedAt,
      oomKilled: State.OOMKilled,
    };
  }

  /** Ultime righe di log del container (stdout e stderr di workerd e del worker del creatore). */
  async logs(id: string, tail: number): Promise<LogLine[]> {
    assertToolId(id);
    const lines = Math.min(Math.max(Math.trunc(tail) || 100, 1), 500);
    const res = await this.options.docker.raw("GET", `/containers/${names(id).container}/logs?stdout=1&stderr=1&timestamps=1&tail=${lines}`);
    if (res.status === 404) return [];
    if (res.status !== 200) throw new Error(`Docker, log del container: ${res.status}`);
    return demuxLogs(res.body);
  }

  /** Ferma il container (tool sospeso): libera memoria e resta fermo anche dopo un riavvio del server. */
  async stop(id: string): Promise<void> {
    assertToolId(id);
    return this.serialized(id, async () => {
      const res = await this.options.docker.request("POST", `/containers/${names(id).container}/stop?t=5`);
      expectStatus(res, "arresto container", 204, 304, 404);
    });
  }

  async start(id: string): Promise<void> {
    assertToolId(id);
    return this.serialized(id, async () => {
      const res = await this.options.docker.request("POST", `/containers/${names(id).container}/start`);
      expectStatus(res, "avvio container", 204, 304);
    });
  }

  /** Ricollega la piattaforma a tutte le reti dei tool (serve dopo che il suo container è stato ricreato). */
  async sync(): Promise<number> {
    const filters = encodeURIComponent(JSON.stringify({ label: [TOOL_LABEL] }));
    const list = expectStatus(await this.options.docker.request("GET", `/networks?filters=${filters}`), "elenco reti", 200);
    const networks = list.body as { Name: string }[];
    for (const { Name } of networks) await this.connectPlatform(Name);
    return networks.length;
  }

  private async connectPlatform(network: string): Promise<void> {
    const res = await this.options.docker.request("POST", `/networks/${network}/connect`, { Container: this.options.platformContainer });
    const alreadyConnected = res.status === 403 && /already exists/i.test(JSON.stringify(res.body));
    if (!alreadyConnected) expectStatus(res, "collegamento piattaforma", 200);
  }

  private serialized<T>(id: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.queues.set(id, next);
    void next.finally(() => {
      if (this.queues.get(id) === next) this.queues.delete(id);
    }).catch(() => undefined);
    return next;
  }
}
