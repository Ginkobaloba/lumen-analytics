/*
  Shared response formatting for the Lumen MCP tools.

  Every tool supports two output formats: `markdown` (default, human-legible)
  and `json` (the full structured payload). Regardless of format, tools also
  return `structuredContent` matching their `outputSchema`, so a client can
  consume machine data without parsing text.
*/

import { z } from "zod";

/** Cap on the text-content payload so a wide result set cannot flood a model's
    context. Structured content is not truncated; the text is. */
export const CHARACTER_LIMIT = 25_000;

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

/** Reusable input field: the output format selector. Spread into a tool's
    input schema so every tool exposes it identically. */
export const responseFormatField = {
  response_format: z
    .nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe(
      "Output format for the text content: 'markdown' (human-readable, default) " +
        "or 'json' (the full structured payload as text). Structured content is " +
        "returned in both cases.",
    ),
};

/** Build a successful tool result. `text` is the human/markdown or json string;
    `structured` is the machine payload echoed in `structuredContent`. */
export function ok(text: string, structured: Record<string, unknown>): {
  content: { type: "text"; text: string }[];
  structuredContent: Record<string, unknown>;
} {
  const capped =
    text.length > CHARACTER_LIMIT
      ? text.slice(0, CHARACTER_LIMIT) +
        `\n\n[...truncated at ${CHARACTER_LIMIT} characters. Narrow the query or ` +
        `use a smaller limit / the offset parameter to page through results.]`
      : text;
  return {
    content: [{ type: "text", text: capped }],
    structuredContent: structured,
  };
}

/** Build an error tool result with an actionable message. */
export function fail(message: string): {
  content: { type: "text"; text: string }[];
  isError: true;
} {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/** Pretty-print a structured payload as JSON text. */
export function json(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}
