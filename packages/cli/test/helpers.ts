import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ShareboxClient, type Grant, type ToolInfo } from "../src/client";

export async function tempProject(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sharebox-cli-"));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), content);
  }
  return dir;
}

/** Piattaforma finta in memoria, raggiunta tramite un fetch simulato. */
export function fakePlatform() {
  const tools = new Map<string, ToolInfo & { grants: Grant[] }>();
  const deploys: { id: string; files: Record<string, string>; worker?: string }[] = [];
  let next = 0;

  const fetchFn = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    const ok = (data: unknown) => Response.json(data);
    if (init.method === "POST" && path === "/api/tools") {
      const id = `tool${String(++next).padStart(8, "0")}`;
      const tool = { id, slug: `${body.name.toLowerCase()}-abcd`, name: body.name, url: `https://${id}.sbx.test/`, status: "active" as const, role: "manage" as const, owner: "guido@gmail.com", version: null, grants: [] };
      tools.set(id, tool);
      return ok(tool);
    }
    if (init.method === "GET" && path === "/api/tools") return ok({ tools: [...tools.values()] });
    const deploy = /^\/api\/tools\/(\w+)\/deploy$/.exec(path);
    if (deploy) {
      const tool = tools.get(deploy[1]!);
      if (!tool) return Response.json({ error: "Tool non trovato" }, { status: 404 });
      deploys.push({ id: tool.id, ...body });
      tool.version = (tool.version ?? 0) + 1;
      return ok(tool);
    }
    const grants = /^\/api\/tools\/(\w+)\/grants$/.exec(path);
    if (grants) {
      const tool = tools.get(grants[1]!)!;
      tool.grants = tool.grants.filter((g) => !(g.type === body.type && g.value === body.value));
      if (init.method === "PUT") tool.grants.push(body);
      return ok(tool);
    }
    const single = /^\/api\/tools\/(\w+)$/.exec(path);
    if (single && init.method === "GET") return ok(tools.get(single[1]!));
    return Response.json({ error: "non previsto" }, { status: 500 });
  }) as typeof fetch;

  return { client: new ShareboxClient("https://sharebox.test", "sbx_test", fetchFn), tools, deploys };
}
