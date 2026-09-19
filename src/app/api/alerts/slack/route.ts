import { NextResponse, type NextRequest } from "next/server";
import { buildSlackPayload, sendSlackAlert, type SlackAlertInput } from "@/lib/alerting";
import { getAnomalyDetail } from "@/lib/anomaly-detail";
import { SESSION_COOKIE } from "@/middleware";

export const dynamic = "force-dynamic";

/*
  Routes a detected anomaly to Slack. POST { anomalyId } loads the anomaly,
  builds a Block Kit payload (including the affected-accounts segment), and
  POSTs it to LUMEN_SLACK_WEBHOOK_URL. The response always includes the
  payload so the UI can show exactly what was sent, configured or not.
*/

// In-memory rate limit: one global window across all callers. Keying on a
// client-supplied header (X-Forwarded-For, X-Real-IP) is not trustworthy --
// a caller can rotate it to get a fresh bucket on every request -- so this
// limits the route as a whole instead of per claimed client.
const requestHistory: number[] = [];
const RATE_LIMIT_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 60 seconds

function isRateLimited(): boolean {
  const now = Date.now();

  // Remove old timestamps outside the window
  while (requestHistory.length > 0 && now - requestHistory[0] >= RATE_LIMIT_WINDOW_MS) {
    requestHistory.shift();
  }

  if (requestHistory.length >= RATE_LIMIT_REQUESTS) {
    return true;
  }

  // Record this request
  requestHistory.push(now);
  return false;
}

export async function POST(request: NextRequest) {
  // Require session cookie
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Check rate limit (global, not keyed on a client-supplied header)
  if (isRateLimited()) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: { anomalyId?: string };
  try {
    body = (await request.json()) as { anomalyId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.anomalyId) {
    return NextResponse.json({ error: "anomalyId is required" }, { status: 400 });
  }

  const detail = getAnomalyDetail(body.anomalyId);
  if (!detail) {
    return NextResponse.json({ error: "Anomaly not found" }, { status: 404 });
  }

  const input: SlackAlertInput = {
    id: detail.id,
    title: detail.title,
    summary: detail.summary,
    severity: detail.severity,
    metricName: detail.metric.name,
    date: detail.date,
    endDate: detail.end_date,
    sigma: detail.sigma,
    contributors: detail.contributors.map((c) => ({
      dimension: c.dimension,
      value: c.value,
      lift: c.lift,
    })),
    affected: detail.affected
      ? {
          label: detail.affected.label,
          count: detail.affected.count,
          churnedCount: detail.affected.churnedCount,
        }
      : null,
    appBaseUrl: process.env.APP_BASE_URL?.trim() || undefined,
  };

  const result = await sendSlackAlert(buildSlackPayload(input));
  return NextResponse.json(result);
}
