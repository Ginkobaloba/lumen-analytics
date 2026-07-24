/*
  The tool-definition contract for the Lumen MCP server.

  Every tool is declared metadata-first: a single object literal carrying its
  name, human title, description, input/output schemas, behaviour annotations,
  and handler. `registry.ts` collects these into one array and `server.ts`
  registers them in a loop, so the wire-visible shape of the server is a flat,
  legible list rather than scattered imperative `registerTool` calls.
*/

import type { ZodRawShape, z } from "zod";

/** A single text-content tool result, optionally carrying structured output
    that matches the tool's `outputSchema`. Mirrors the SDK's CallToolResult. */
export interface ToolResult {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  // The SDK's CallToolResult carries an open index signature (for _meta and
  // future fields); mirror it so our results are structurally assignable.
  [key: string]: unknown;
}

/** MCP behaviour hints. All Lumen tools are read-only, non-destructive, and
    closed-world (they read one local SQLite snapshot, no external calls). */
export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** The registry element type. `inputSchema`/`outputSchema` are Zod raw shapes
    (field maps), as the SDK's `registerTool` expects. The handler type is
    erased here so heterogeneous tools live in one array; `defineTool`
    preserves per-tool argument typing at the definition site. */
export interface AnyToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: ZodRawShape;
  outputSchema?: ZodRawShape;
  annotations: ToolAnnotations;
  handler: (args: Record<string, unknown>) => ToolResult;
}

/** Declare a tool with fully-typed handler arguments inferred from its input
    schema, then erase to `AnyToolDefinition` for the registry array. */
export function defineTool<In extends ZodRawShape>(def: {
  name: string;
  title: string;
  description: string;
  inputSchema: In;
  outputSchema?: ZodRawShape;
  annotations: ToolAnnotations;
  handler: (args: z.infer<z.ZodObject<In>>) => ToolResult;
}): AnyToolDefinition {
  return def as unknown as AnyToolDefinition;
}
