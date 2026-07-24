/*
  Tool: lumen_search_metrics

  Discovery entry point. A model with zero prior knowledge of Lumen uses this
  to find out which metrics exist and their exact ids, which the anomaly tools
  then take as the `metric_id` filter.
*/

import { z } from "zod";
import { defineTool } from "../types";
import { ResponseFormat, responseFormatField, ok, json } from "../format";
import { searchMetrics, type MetricMatch } from "../data";

const inputSchema = {
  query: z
    .string()
    .min(1, "query must not be empty")
    .max(100, "query must not exceed 100 characters")
    .describe(
      "Keywords describing the metric you are looking for, e.g. 'revenue " +
        "retention', 'churn', 'activation', 'daily active users', 'support'. " +
        "Matched against each metric's id, name, category, unit, and description.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(32)
    .default(10)
    .describe("Maximum number of metrics to return (1-32, default 10)."),
  ...responseFormatField,
};

const metricShape = {
  id: z.string(),
  name: z.string(),
  category: z.string(),
  unit: z.string(),
  good_direction: z.string(),
  sliced: z.boolean(),
  description: z.string(),
  score: z.number(),
};

const outputSchema = {
  query: z.string(),
  count: z.number().int(),
  metrics: z.array(z.object(metricShape)),
};

function toMarkdown(query: string, metrics: MetricMatch[]): string {
  if (metrics.length === 0) {
    return (
      `No metrics matched '${query}'. Lumen tracks 32 metrics across five ` +
      `categories: revenue, customers, conversion, engagement, and support. ` +
      `Try a broader term such as 'revenue', 'retention', or 'engagement'.`
    );
  }
  const lines = [`# Metrics matching '${query}' (${metrics.length})`, ""];
  for (const m of metrics) {
    lines.push(`## ${m.name} (\`${m.id}\`)`);
    lines.push(
      `- Category: ${m.category} | Unit: ${m.unit} | Good when: ${m.good_direction} | ` +
        `Sliceable by segment: ${m.sliced ? "yes" : "no"}`,
    );
    lines.push(`- ${m.description}`);
    lines.push("");
  }
  return lines.join("\n");
}

export const searchMetricsTool = defineTool({
  name: "lumen_search_metrics",
  title: "Search Lumen metrics",
  description: `Search Lumen Analytics' metric catalog by keyword and return the matching metric definitions.

Lumen is a B2B SaaS revenue and product-behavior analytics demo. It tracks 32 metrics across five categories (revenue, customers, conversion, engagement, support). This tool is the discovery step: use it to find a metric's exact id and learn what it measures before calling the anomaly tools. It is read-only and does not detect anomalies itself.

Args:
  - query (string): Keywords to match, e.g. "revenue retention", "churn", "activation", "API adoption". Matched against each metric's id, name, category, unit, and description.
  - limit (number): Max metrics to return, 1-32 (default 10).
  - response_format ('markdown' | 'json'): Text output format (default 'markdown').

Returns structured content:
  {
    "query": string,
    "count": number,            // metrics in this response
    "metrics": [
      {
        "id": string,           // exact metric id, e.g. "nrr" -- pass this to the anomaly tools
        "name": string,         // display name, e.g. "Net Revenue Retention"
        "category": string,     // revenue | customers | conversion | engagement | support
        "unit": string,         // currency | count | percent | score | hours
        "good_direction": string, // "up" or "down": which way is healthy
        "sliced": boolean,      // whether the metric is broken out by plan tier / geography / industry
        "description": string,  // one-line definition
        "score": number         // keyword relevance; higher is a closer match
      }
    ]
  }

Examples:
  - "What revenue metrics does Lumen track?" -> query="revenue"
  - "Find the churn metric" -> query="churn"
  - "Which metric covers product stickiness?" -> query="active users stickiness engagement"

Error handling:
  - Never errors on a no-match; returns an empty list with guidance on valid categories.`,
  inputSchema,
  outputSchema,
  annotations: {
    title: "Search Lumen metrics",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: (args) => {
    const metrics = searchMetrics(args.query, args.limit);
    const payload = { query: args.query, count: metrics.length, metrics };
    const text =
      args.response_format === ResponseFormat.JSON
        ? json(payload)
        : toMarkdown(args.query, metrics);
    return ok(text, payload);
  },
});
