/*
  Tool: lumen_list_recent_anomalies

  The anomaly queue. Returns detected anomaly episodes newest-first with the
  ids the attribution tool needs, plus optional filters and pagination.
*/

import { z } from "zod";
import { defineTool } from "../types";
import { ResponseFormat, responseFormatField, ok, json } from "../format";
import { listAnomalies, type AnomalyRow } from "../data";

const severityEnum = z.enum(["low", "medium", "high", "critical"]);
const statusEnum = z.enum([
  "active",
  "acknowledged",
  "resolved",
  "false_positive",
]);

const inputSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum anomalies to return (1-50, default 10)."),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of anomalies to skip, for paging (default 0)."),
  severity: severityEnum
    .optional()
    .describe("Optional filter: only anomalies of this severity."),
  status: statusEnum
    .optional()
    .describe(
      "Optional filter: only anomalies in this triage status " +
        "(active | acknowledged | resolved | false_positive).",
    ),
  metric_id: z
    .string()
    .optional()
    .describe(
      "Optional filter: only anomalies on this metric id (e.g. 'mrr', 'dau'). " +
        "Get valid ids from lumen_search_metrics.",
    ),
  ...responseFormatField,
};

const anomalyShape = {
  id: z.string(),
  metric_id: z.string(),
  metric_name: z.string(),
  date: z.string(),
  end_date: z.string().nullable(),
  direction: z.string(),
  severity: z.string(),
  status: z.string(),
  expected_value: z.number(),
  actual_value: z.number(),
  sigma: z.number(),
  title: z.string(),
  summary: z.string(),
  assignee_name: z.string().nullable(),
};

const outputSchema = {
  total: z.number().int(),
  count: z.number().int(),
  offset: z.number().int(),
  has_more: z.boolean(),
  next_offset: z.number().int().optional(),
  anomalies: z.array(z.object(anomalyShape)),
};

function toMarkdown(rows: AnomalyRow[], total: number, offset: number): string {
  if (rows.length === 0) {
    // Distinguish paging past the end (matches exist, just none on this page)
    // from a genuine no-match, so a model reading the default text channel does
    // not conclude there are no anomalies.
    if (total > 0) {
      return `No anomalies on this page (offset ${offset} of ${total} total). Use a smaller offset to see results.`;
    }
    return "No anomalies match those filters.";
  }
  const lines = [
    `# Recent anomalies (${offset + 1}-${offset + rows.length} of ${total})`,
    "",
  ];
  for (const a of rows) {
    const window = a.end_date && a.end_date !== a.date ? `${a.date} to ${a.end_date}` : a.date;
    lines.push(`## ${a.title}  \`${a.id}\``);
    lines.push(
      `- ${a.metric_name} (\`${a.metric_id}\`) | ${a.severity} | ${a.direction} | ` +
        `status: ${a.status} | ${a.sigma.toFixed(2)} sigma`,
    );
    lines.push(
      `- Window: ${window} | expected ${a.expected_value}, actual ${a.actual_value}` +
        (a.assignee_name ? ` | assigned to ${a.assignee_name}` : ""),
    );
    lines.push(`- ${a.summary}`);
    lines.push(
      `- Cause attribution: call lumen_get_anomaly_attribution with anomaly_id="${a.id}"`,
    );
    lines.push("");
  }
  return lines.join("\n");
}

export const listRecentAnomaliesTool = defineTool({
  name: "lumen_list_recent_anomalies",
  title: "List recent Lumen anomalies",
  description: `List anomaly episodes that Lumen's detector has flagged, newest first (sorted by start date descending, then severity, then sigma), with optional filters and pagination.

An anomaly is an episode where a metric drifted off its expected trend/seasonality by enough sigma to flag (for example "MRR dropped 6% below expected"). Each episode has a stable id, a metric, a severity, a triage status, an expected-vs-actual pair, and a window. Use this to survey what is currently off, then pass an id to lumen_get_anomaly_attribution to see which customer segments drove it. Read-only.

Args:
  - limit (number): Max anomalies to return, 1-50 (default 10).
  - offset (number): Anomalies to skip for paging (default 0).
  - severity ('low' | 'medium' | 'high' | 'critical', optional): Filter by severity.
  - status ('active' | 'acknowledged' | 'resolved' | 'false_positive', optional): Filter by triage status.
  - metric_id (string, optional): Filter to one metric id (e.g. "mrr"). Get ids from lumen_search_metrics.
  - response_format ('markdown' | 'json'): Text output format (default 'markdown').

Returns structured content:
  {
    "total": number,            // anomalies matching the filters, ignoring paging
    "count": number,            // anomalies in this response
    "offset": number,           // the offset used
    "has_more": boolean,        // whether more pages exist
    "next_offset": number,      // pass as offset to get the next page (present only if has_more)
    "anomalies": [
      {
        "id": string,           // e.g. "an-dau-2026-06-06" -- pass to lumen_get_anomaly_attribution
        "metric_id": string,    // e.g. "dau"
        "metric_name": string,  // e.g. "Daily Active Users"
        "date": string,         // first flagged day (ISO date)
        "end_date": string|null,// last day, null while ongoing
        "direction": string,    // "up" or "down"
        "severity": string,     // low | medium | high | critical
        "status": string,       // active | acknowledged | resolved | false_positive
        "expected_value": number,
        "actual_value": number,
        "sigma": number,        // deviation magnitude at peak
        "title": string,
        "summary": string,
        "assignee_name": string|null
      }
    ]
  }

Examples:
  - "What anomalies fired recently?" -> no filters
  - "Show critical revenue anomalies" -> severity="critical", metric_id="mrr"
  - "Any unresolved anomalies?" -> status="active"

Error handling:
  - Returns an empty list (not an error) when no anomaly matches the filters.`,
  inputSchema,
  outputSchema,
  annotations: {
    title: "List recent Lumen anomalies",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: (args) => {
    const { total, rows } = listAnomalies({
      limit: args.limit,
      offset: args.offset,
      severity: args.severity,
      status: args.status,
      metric_id: args.metric_id,
    });
    const hasMore = args.offset + rows.length < total;
    const payload = {
      total,
      count: rows.length,
      offset: args.offset,
      has_more: hasMore,
      ...(hasMore ? { next_offset: args.offset + rows.length } : {}),
      anomalies: rows,
    };
    const text =
      args.response_format === ResponseFormat.JSON
        ? json(payload)
        : toMarkdown(rows, total, args.offset);
    return ok(text, payload, args.response_format);
  },
});
