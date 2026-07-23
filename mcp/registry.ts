/*
  The Lumen MCP tool registry.

  This is the single, flat list of everything the server exposes. It is
  deliberately the whole surface: three read-only tools, no more. Adding a tool
  means adding one entry here; `server.ts` needs no change. Keeping the registry
  small and legible is itself part of what this server demonstrates.
*/

import type { AnyToolDefinition } from "./types";
import { searchMetricsTool } from "./tools/search-metrics";
import { listRecentAnomaliesTool } from "./tools/list-recent-anomalies";
import { getAnomalyAttributionTool } from "./tools/get-anomaly-attribution";

export const registry: AnyToolDefinition[] = [
  searchMetricsTool,
  listRecentAnomaliesTool,
  getAnomalyAttributionTool,
];
