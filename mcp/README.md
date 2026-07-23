# Lumen Analytics MCP server

A small, **read-only** [Model Context Protocol](https://modelcontextprotocol.io)
server over the Lumen Analytics demo. It lets any MCP client (Claude Desktop,
Cursor, the MCP Inspector, ...) query Lumen's metric catalog and anomaly
detection directly, without a browser.

It exposes exactly three tools, no more:

| Tool | What it does |
|------|--------------|
| `lumen_search_metrics` | Keyword search over the 32-metric catalog. Discovery step: find a metric's exact id and what it measures. |
| `lumen_list_recent_anomalies` | List detected anomaly episodes, newest first, with filters (severity, status, metric) and pagination. |
| `lumen_get_anomaly_attribution` | Explain one anomaly: the ranked customer segments (plan tier, geography, industry) that drove it, plus suggested next steps. |

All three are read-only, non-destructive, idempotent, and closed-world: they
read one local SQLite snapshot and make no external calls or writes. The natural
flow is `search_metrics` -> `list_recent_anomalies` -> `get_anomaly_attribution`.

## Design

The server is metadata-first. Every tool is declared as a single object
literal (name, title, description, input/output schema, annotations, handler) in
`mcp/tools/`, collected into one flat list in `mcp/registry.ts`, and registered
in a loop by `mcp/server.ts`. The wire-visible surface of the server is that
registry: to see everything it does, read one array.

It reuses the app's metric catalog (`src/lib/data/catalog.ts`) as the single
source of truth, but does **not** import the Next.js data layer (those modules
import `server-only`, which throws outside a React Server Component bundle).
Instead `mcp/data.ts` opens the same database read-only and reads the
attribution that the detector already stored on each anomaly row.

## Prerequisites

From the repository root (`lumen-analytics/`):

```powershell
npm install          # installs @modelcontextprotocol/sdk, zod, and the rest
npm run seed:full    # builds data/lumen.db (the read-only snapshot) if absent
npm run mcp:build    # compiles mcp/ to mcp/dist/
```

The built entry point is `mcp/dist/mcp/server.js`. During development you can
skip the build and run the TypeScript directly with `npm run mcp:dev`.

## Connect from Claude Desktop

Edit `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add the server (adjust the path to wherever you cloned the repo):

```json
{
  "mcpServers": {
    "lumen-analytics": {
      "command": "node",
      "args": ["C:/dev/lumen-analytics/mcp/dist/mcp/server.js"]
    }
  }
}
```

Restart Claude Desktop. The three `lumen_*` tools appear in the tools menu. If
your `data/lumen.db` lives elsewhere, add an env override:

```json
"env": { "LUMEN_DB_PATH": "C:/path/to/lumen.db" }
```

## Connect from a second client

**MCP Inspector** (fastest way to poke at it):

```bash
npx @modelcontextprotocol/inspector node C:/dev/lumen-analytics/mcp/dist/mcp/server.js
```

**Cursor** -- add to `~/.cursor/mcp.json` (or a project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "lumen-analytics": {
      "command": "node",
      "args": ["C:/dev/lumen-analytics/mcp/dist/mcp/server.js"]
    }
  }
}
```

Any stdio-capable MCP client uses the same shape: run `node` with the path to
`mcp/dist/mcp/server.js`.

## Try it

Once connected, ask the model things like:

- "What revenue metrics does Lumen track?"
- "List the most recent anomalies."
- "Which customer segment drove the DAU drop on 2026-06-06, and what should we do?"

The last one exercises the full chain: the model finds the anomaly, then calls
`lumen_get_anomaly_attribution` to get the per-slice cause and suggested steps.
