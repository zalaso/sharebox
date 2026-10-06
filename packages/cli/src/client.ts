// Client dell'API della piattaforma (packages/platform/src/api.ts).

export type Role = "use" | "manage";

export interface Grant {
  type: "user" | "domain" | "anyone";
  value?: string;
  role: Role;
}

export interface ToolInfo {
  id: string;
  slug: string;
  name: string;
  url: string;
  status: "active" | "suspended";
  role: Role;
  owner: string;
  version: number | null;
  grants?: Grant[];
}

export class ShareboxError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class ShareboxClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchFn: typeof fetch = fetch,
    /** Finisce nel registro delle attività della piattaforma. */
    private readonly channel: "cli" | "mcp" = "cli",
  ) {}

  me() {
    return this.call<{ email: string; name: string; creator: boolean }>("GET", "/api/me");
  }

  async listTools(): Promise<ToolInfo[]> {
    return (await this.call<{ tools: ToolInfo[] }>("GET", "/api/tools")).tools;
  }

  getTool(id: string) {
    return this.call<ToolInfo>("GET", `/api/tools/${id}`);
  }

  createTool(name: string) {
    return this.call<ToolInfo>("POST", "/api/tools", { name });
  }

  deploy(id: string, files: Record<string, string>, worker?: string) {
    return this.call<ToolInfo>("POST", `/api/tools/${id}/deploy`, { files, worker });
  }

  share(id: string, grant: Omit<Grant, "role">, role: Role) {
    return this.call<ToolInfo>("PUT", `/api/tools/${id}/grants`, { ...grant, role });
  }

  unshare(id: string, grant: Omit<Grant, "role">) {
    return this.call<ToolInfo>("DELETE", `/api/tools/${id}/grants`, grant);
  }

  deleteTool(id: string) {
    return this.call<{ deleted: string }>("DELETE", `/api/tools/${id}`);
  }

  revokeToken() {
    return this.call<{ revoked: boolean }>("DELETE", "/api/token");
  }

  private async call<T>(method: string, path: string, body?: object): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.token}`,
          "x-sharebox-client": this.channel,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      throw new ShareboxError(`ShareBox non raggiungibile (${this.baseUrl}): ${error instanceof Error ? error.message : error}`, 0);
    }
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new ShareboxError(data.error ?? `Errore HTTP ${response.status}`, response.status);
    return data as T;
  }
}
