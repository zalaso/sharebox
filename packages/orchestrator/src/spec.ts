// Come è fatto il container di un tool (ADR 0005). È l'unico posto che lo decide:
// la piattaforma non può chiedere opzioni diverse, solo quale tool e quale versione.

import { createHash } from "node:crypto";

export const TOOL_LABEL = "sharebox.tool";
/** Impronta della configurazione del container, contenuto del runtime compreso: se cambia, refreshAll lo ricrea. */
export const SPEC_LABEL = "sharebox.spec";

/**
 * Impronta del contenuto dell'immagine del runtime (strati e configurazione), non del suo ID:
 * con lo store containerd di Docker l'ID cambia a ogni build anche quando il contenuto è identico,
 * e ricreare tutti i tool per questo vorrebbe dire interromperli a ogni aggiornamento senza motivo.
 */
export function runtimeFingerprint(image: { RootFS?: unknown; Config?: unknown }): string {
  return createHash("sha256").update(JSON.stringify([image.RootFS ?? null, image.Config ?? null])).digest("hex").slice(0, 16);
}

// Gli id li genera la piattaforma; il controllo protegge nomi Docker e percorsi su disco.
const TOOL_ID = /^[a-z0-9]{3,32}$/;

export function assertToolId(id: string): void {
  if (!TOOL_ID.test(id)) throw new InvalidRequest(`id del tool non valido: ${id}`);
}

export function assertVersion(version: number): void {
  if (!Number.isInteger(version) || version < 1) throw new InvalidRequest(`versione non valida: ${version}`);
}

/** Errore di chi chiama (risposta 400), non dell'orchestratore. */
export class InvalidRequest extends Error {}

export function names(id: string) {
  return {
    container: `sharebox-tool-${id}`,
    /** Container nuovo preparato durante una ripubblicazione, prima di togliere quello in uso. */
    next: `sharebox-tool-${id}-next`,
    /** Nome con cui la piattaforma raggiunge il tool: `http://tool-<id>:8080`. */
    alias: `tool-${id}`,
    network: `sbx-tool-${id}`,
    volume: `sbx-data-${id}`,
  };
}

export const LIMITS = {
  memoryBytes: 128 * 1024 * 1024,
  nanoCpus: 250_000_000, // 25% di una CPU
  pids: 64,
} as const;

/** Rete propria del tool: interna (niente internet) e senza indirizzo per l'host (niente servizi del server). */
export function networkSpec(id: string) {
  return {
    Name: names(id).network,
    Driver: "bridge",
    Internal: true,
    Options: { "com.docker.network.bridge.inhibit_ipv4": "true" },
    Labels: { [TOOL_LABEL]: id },
  };
}

export function volumeSpec(id: string) {
  return { Name: names(id).volume, Labels: { [TOOL_LABEL]: id } };
}

export function containerSpec(id: string, version: number, options: { runtimeImage: string; hostCodeDir: string; runtime: string }) {
  const n = names(id);
  const spec = {
    Image: options.runtimeImage,
    Labels: { [TOOL_LABEL]: id, "sharebox.version": String(version), "sharebox.runtime": options.runtime },
    HostConfig: {
      Runtime: "runsc",
      ReadonlyRootfs: true,
      Tmpfs: { "/tmp": "rw,noexec,nosuid,size=16m" },
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      Memory: LIMITS.memoryBytes,
      MemorySwap: LIMITS.memoryBytes, // niente swap oltre il limite
      NanoCpus: LIMITS.nanoCpus,
      PidsLimit: LIMITS.pids,
      RestartPolicy: { Name: "unless-stopped" },
      // Log del tool a dimensione fissa: senza limite crescerebbero fino a riempire il disco.
      LogConfig: { Type: "json-file", Config: { "max-size": "5m", "max-file": "2" } },
      Mounts: [
        { Type: "bind", Source: options.hostCodeDir, Target: "/tool/code", ReadOnly: true },
        { Type: "volume", Source: n.volume, Target: "/data" },
      ],
      NetworkMode: n.network,
    },
    NetworkingConfig: {
      EndpointsConfig: { [n.network]: { Aliases: [n.alias] } },
    },
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(spec)).digest("hex").slice(0, 16);
  return { ...spec, Labels: { ...spec.Labels, [SPEC_LABEL]: fingerprint } };
}
