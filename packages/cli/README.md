# sharebox-cli

Command line and MCP server for [ShareBox](https://github.com/zalaso/sharebox), a self-hosted platform where AI agents publish small web tools and you share them like a Google Doc: with specific people, a whole Google Workspace domain, or anyone with the link. Visitors sign in with Google; every tool gets a trusted identity, its own storage and its own sandbox.

You need a running ShareBox instance (yours or your organization's). To set one up, see the [install guide](https://github.com/zalaso/sharebox/blob/main/docs/install.md).

## Install

```bash
npm install -g sharebox-cli
```

Requires Node 20 or newer. Every ShareBox instance also serves its own copy at `https://<instance>/cli/sharebox.tgz`.

## Connect

```bash
sharebox login sharebox.example.com
```

A browser opens: sign in with Google and click **Authorize**. The token is stored in `~/.sharebox/credentials.json`. On servers or in CI you can set `SHAREBOX_URL` and `SHAREBOX_TOKEN` instead.

## Use it from an agent (MCP)

Claude Code:

```bash
claude mcp add --scope user sharebox -- sharebox mcp
```

On Windows: `claude mcp add --scope user sharebox -- cmd /c sharebox mcp`.

Without a global install, other MCP clients can run `npx -y sharebox-cli mcp` (after `npx sharebox-cli login <instance>` once).

Tools: `sharebox_guide`, `sharebox_create_project`, `sharebox_publish`, `sharebox_list`, `sharebox_info`, `sharebox_share`, `sharebox_unshare`. There is deliberately no delete tool: deleting erases data, so it stays in the CLI behind a confirmation.

Then just ask: *"Build a vacation tracker for my team and publish it on ShareBox."*

## Commands

| Command | What it does |
|---|---|
| `sharebox init <folder> [--name N]` | Starter folder with an example that uses the SDK |
| `sharebox publish [folder] [--name N]` | Publish, or update the same tool on later runs (same address, data kept) |
| `sharebox list` | Tools you can manage |
| `sharebox info <tool>` | Address, version and shares |
| `sharebox share <tool> <with> [--role use\|manage]` | `<with>`: an email, `@domain.com` or `anyone` |
| `sharebox unshare <tool> <with>` | Remove a share |
| `sharebox delete <tool> --yes` | Delete a tool and its data |
| `sharebox guide` | How to build a tool (written for agents) |
| `sharebox mcp` | MCP server on stdio |

Messages are in English or Italian, following `SHAREBOX_LANG` or the system locale.

## License

AGPL-3.0-or-later
