/*
  Tool: lumen_get_anomaly_attribution

  The payoff. Given one anomaly id, return the ranked customer segments that
  drove the episode: which plan tier, geography, or industry moved, by how
  much, and what share of the top-level deviation it carried.
*/

import { z } from "zod";
import { defineTool } from "../types";
import { ResponseFormat, responseFormatField, ok, fail, json } from "../format";
import { getAnomalyAttribution, type AnomalyAttribution } from "../data";

const inputSchema = {
  anomaly_id: z
    .string()
    .min(1, "anomaly_id must not be empty")
    .describe(
      "The anomaly id to explain, e.g. 'an-dau-2026-06-06'. Get ids from " +
        "lumen_list_recent_anomalies.",
    ),
  ...responseFormatField,
};

const contributorShape = {
  dimension: z.string(),
  value: z.string(),
  mean_z: z.number(),
  lift: z.number(),
  contribution_share: z.number().nullable(),
};

const outputSchema = {
  anomaly: z.object({
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
  }),
  contributors: z.array(z.object(contributorShape)),
  suggested_actions: z.array(z.string()),
};

function toMarkdown(a: AnomalyAttribution): string {
  const { anomaly, contributors, suggested_actions } = a;
  const window =
    anomaly.end_date && anomaly.end_date !== anomaly.date
      ? `${anomaly.date} to ${anomaly.end_date}`
      : anomaly.date;

  const lines = [
    `# ${anomaly.title}  \`${anomaly.id}\``,
    "",
    `${anomaly.metric_name} (\`${anomaly.metric_id}\`) went ${anomaly.direction} ` +
      `during ${window}. Expected ${anomaly.expected_value}, actual ` +
      `${anomaly.actual_value} (${anomaly.sigma.toFixed(2)} sigma, ${anomaly.severity}).`,
    "",
    anomaly.summary,
    "",
  ];

  if (contributors.length === 0) {
    lines.push(
      "## Cause attribution",
      "",
      "No single segment dominates: this episode is broad-based across plan " +
        "tiers, geographies, and industries rather than concentrated in one slice.",
      "",
    );
  } else {
    lines.push(
      "## Top contributing segments",
      "",
      "Each slice is ranked by how anomalous it is on its own terms (mean signed " +
        "z inside the window), so the segments that carried the anomaly stand above " +
        "those that merely inherited a proportional share.",
      "",
    );
    for (const c of contributors) {
      const share =
        c.contribution_share === null
          ? "n/a (rate metric)"
          : `${(c.contribution_share * 100).toFixed(1)}%`;
      lines.push(
        `- **${c.dimension} = ${c.value}** | mean z ${c.mean_z.toFixed(2)} | ` +
          `lift ${(c.lift * 100).toFixed(1)}% | share of deviation ${share}`,
      );
    }
    lines.push("");
  }

  if (suggested_actions.length > 0) {
    lines.push("## Suggested next steps", "");
    for (const s of suggested_actions) lines.push(`- ${s}`);
    lines.push("");
  }

  return lines.join("\n");
}

export const getAnomalyAttributionTool = defineTool({
  name: "lumen_get_anomaly_attribution",
  title: "Explain a Lumen anomaly (per-slice attribution)",
  description: `Explain a single anomaly: return the ranked customer segments that drove it, plus the episode context and suggested next steps.

This is Lumen's differentiator. When a top-level metric anomaly fires, the detector scores every dimensional slice (plan tier, geography, industry) inside the episode window and ranks them by how anomalous each is against its OWN noise. The slices that actually carried the anomaly stand far above those that only inherited a proportional share. For additive metrics it also reports each slice's share of the total deviation. Read-only; it reads back stored attribution, it does not recompute.

Args:
  - anomaly_id (string): The anomaly to explain, e.g. "an-dau-2026-06-06". Get ids from lumen_list_recent_anomalies.
  - response_format ('markdown' | 'json'): Text output format (default 'markdown').

Returns structured content:
  {
    "anomaly": {
      "id": string, "metric_id": string, "metric_name": string,
      "date": string, "end_date": string|null, "direction": string,
      "severity": string, "status": string,
      "expected_value": number, "actual_value": number, "sigma": number,
      "title": string, "summary": string, "assignee_name": string|null
    },
    "contributors": [        // ranked, most responsible first; empty if broad-based
      {
        "dimension": string,          // "plan_tier" | "geography" | "industry"
        "value": string,              // e.g. "Starter", "EMEA", "Software"
        "mean_z": number,             // mean signed z inside the window (magnitude = how anomalous)
        "lift": number,               // slice level vs its own expected, e.g. -0.12 = 12% below
        "contribution_share": number|null  // share of top-level deviation (additive metrics only)
      }
    ],
    "suggested_actions": [string]     // recommended triage steps
  }

Examples:
  - "Why did DAU drop on 2026-06-06?" -> anomaly_id="an-dau-2026-06-06"
  - "Which segment drove the churn spike?" -> first find the id via lumen_list_recent_anomalies, then call this

Error handling:
  - Returns an error naming the tool to use if the id is unknown.
  - An empty "contributors" list means the anomaly is broad-based, not an error.`,
  inputSchema,
  outputSchema,
  annotations: {
    title: "Explain a Lumen anomaly (per-slice attribution)",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: (args) => {
    const attribution = getAnomalyAttribution(args.anomaly_id);
    if (!attribution) {
      return fail(
        `No anomaly with id '${args.anomaly_id}'. Use lumen_list_recent_anomalies ` +
          `to find valid anomaly ids.`,
      );
    }
    const text =
      args.response_format === ResponseFormat.JSON
        ? json(attribution)
        : toMarkdown(attribution);
    return ok(text, attribution as unknown as Record<string, unknown>);
  },
});
