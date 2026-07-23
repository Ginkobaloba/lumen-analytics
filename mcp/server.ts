#!/usr/bin/env node
/*
  Lumen Analytics MCP server.

  Exposes a small, read-only toolset over the Lumen demo's metrics and anomaly
  detection so an MCP client (Claude Desktop, MCP Inspector, Cursor, ...) can
  ask questions of the dataset directly:

    - lumen_search_metrics            discover metrics by keyword
    - lumen_list_recent_anomalies     survey detected anomaly episodes
    - lumen_get_anomaly_attribution   explain one anomaly by customer segment

  Transport is stdio: the client launches this process and speaks JSON-RPC over
  stdin/stdout. Nothing is written to stdout except protocol traffic; all logs
  go to stderr.
*/

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registry } from "./registry";
import { openReadOnlyDb } from "./data";

const server = new McpServer({
  name: "lumen-analytics-mcp-server",
  version: "0.1.0",
});

// Register every tool from the flat registry. The registry is the source of
// truth for the server's surface; this loop is the only place tools are wired.
for (const tool of registry) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
      annotations: tool.annotations,
    },
    (args: Record<string, unknown>) => tool.handler(args),
  );
}

async function main(): Promise<void> {
  // Fail fast with an actionable message if the seeded database is missing,
  // rather than surfacing the error only on the first tool call.
  try {
    openReadOnlyDb();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `lumen-analytics-mcp-server running on stdio with ${registry.length} tools: ` +
      registry.map((t) => t.name).join(", "),
  );
}

main().catch((error) => {
  console.error("Fatal error starting lumen-analytics-mcp-server:", error);
  process.exit(1);
});
