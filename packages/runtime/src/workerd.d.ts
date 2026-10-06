// Modulo risolto da workerd a runtime, non da npm. Solo le parti usate dal runtime.
declare module "cloudflare:workers" {
  interface SqlStorage {
    exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] };
    readonly databaseSize?: number;
  }

  interface DurableObjectState {
    storage: { sql: SqlStorage };
  }

  export class DurableObject {
    constructor(ctx: DurableObjectState, env: unknown);
    protected ctx: DurableObjectState;
    protected env: unknown;
  }
}
