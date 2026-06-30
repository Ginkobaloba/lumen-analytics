import "server-only";

/*
  Slack alerting for anomaly triage. This is a real wire path, not a mock:
  buildSlackPayload produces a valid Slack Block Kit message, and
  sendSlackAlert POSTs it to the webhook in LUMEN_SLACK_WEBHOOK_URL. Point
  that env var at a Slack Incoming Webhook (or any HTTPS endpoint) and the
  alert lands there. When it is unset the call is a no-op that still returns
  the exact payload it would have sent, so the "alerts where your team
  works" story is demonstrable end to end.
*/

export interface SlackAlertContributor {
  dimension: string;
  value: string;
  lift: number;
}

export interface SlackAlertInput {
  id: string;
  title: string;
  summary: string;
  severity: "low" | "medium" | "high" | "critical";
  metricName: string;
  date: string;
  endDate: string | null;
  sigma: number;
  contributors: SlackAlertContributor[];
  affected: { label: string; count: number; churnedCount: number } | null;
  appBaseUrl?: string;
}

export interface SlackPayload {
  text: string;
  blocks: unknown[];
}

export interface AlertResult {
  /** Whether LUMEN_SLACK_WEBHOOK_URL is set. */
  configured: boolean;
  /** Whether the POST returned a 2xx. */
  delivered: boolean;
  /** HTTP status from the webhook, or null when not attempted/failed. */
  status: number | null;
  /** Redacted target host, safe to show in the UI. */
  target: string | null;
  error?: string;
  /** The message that was (or would have been) sent. */
  payload: SlackPayload;
}

const SEVERITY_EMOJI: Record<SlackAlertInput["severity"], string> = {
  low: ":large_yellow_circle:",
  medium: ":large_orange_circle:",
  high: ":red_circle:",
  critical: ":rotating_light:",
};

const DIMENSION_LABEL: Record<string, string> = {
  plan_tier: "tier",
  geography: "region",
  industry: "industry",
};

function liftPct(lift: number): string {
  const sign = lift > 0 ? "+" : "";
  return `${sign}${Math.round(lift * 100)}%`;
}

export function buildSlackPayload(a: SlackAlertInput): SlackPayload {
  const emoji = SEVERITY_EMOJI[a.severity];
  const window =
    a.endDate && a.endDate !== a.date ? `${a.date} to ${a.endDate}` : a.date;

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${a.severity.toUpperCase()} anomaly: ${a.metricName}`, emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `${emoji} *${a.title}*\n${a.summary}` },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Metric:*\n${a.metricName}` },
        { type: "mrkdwn", text: `*Window:*\n${window}` },
        { type: "mrkdwn", text: `*Severity:*\n${a.severity}` },
        { type: "mrkdwn", text: `*Confidence:*\n${a.sigma.toFixed(1)} sigma` },
      ],
    },
  ];

  if (a.contributors.length > 0) {
    const lines = a.contributors
      .map((c) => `• *${c.value}* (${DIMENSION_LABEL[c.dimension] ?? c.dimension}) ${liftPct(c.lift)} vs expected`)
      .join("\n");
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*What changed*\n${lines}` },
    });
  }

  if (a.affected) {
    const churned =
      a.affected.churnedCount > 0 ? ` · ${a.affected.churnedCount} already churned` : "";
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Affected accounts*\n${a.affected.count} accounts in ${a.affected.label}${churned}`,
      },
    });
  }

  if (a.appBaseUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open in Lumen", emoji: true },
          url: `${a.appBaseUrl.replace(/\/$/, "")}/app/anomalies?focus=${encodeURIComponent(a.id)}`,
        },
      ],
    });
  }

  blocks.push({
    type: "context",
    elements: [
      { type: "mrkdwn", text: "Lumen Analytics · anomaly detection · #revenue-alerts" },
    ],
  });

  return { text: `${a.severity.toUpperCase()} anomaly: ${a.title}`, blocks };
}

export function getWebhookUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.LUMEN_SLACK_WEBHOOK_URL?.trim() || undefined;
}

export function isSlackConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return getWebhookUrl(env) !== undefined;
}

function safeTarget(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export async function sendSlackAlert(
  payload: SlackPayload,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AlertResult> {
  const url = getWebhookUrl(env);
  if (!url) {
    return { configured: false, delivered: false, status: null, target: null, payload };
  }

  const target = safeTarget(url);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return {
      configured: true,
      delivered: res.ok,
      status: res.status,
      target,
      error: res.ok ? undefined : `Webhook returned ${res.status}`,
      payload,
    };
  } catch (err) {
    return {
      configured: true,
      delivered: false,
      status: null,
      target,
      error: err instanceof Error ? err.message : "Network error",
      payload,
    };
  }
}
