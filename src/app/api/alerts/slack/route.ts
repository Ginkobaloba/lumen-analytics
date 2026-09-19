import { NextResponse, type NextRequest } from "next/server";
import { buildSlackPayload, sendSlackAlert, type SlackAlertInput } from "@/lib/alerting";
import { getAnomalyDetail } from "@/lib/anomaly-detail";
import { AlertRateLimiter, clientKeyFromHeaders } from "@/lib/alert-rate-limit";
import { readRequestSession } from "@/lib/portal-session";

export const dynamic = "force-dynamic";

/*
  Routes a detected anomaly to Slack. POST { anomalyId } loads the anomaly,
  builds a Block Kit payload (including the affected-accounts segment), and
  POSTs it to LUMEN_SLACK_WEBHOOK_URL. The response always includes the
  payload so the UI can show exactly what was sent, configured or not.
*/

// In-memory rate limit: a global 5-per-minute ceiling plus a 2-per-minute
// window per client keyed on CF-Connecting-IP (set by Cloudflare, never
// X-Forwarded-For). No CF-Connecting-IP means global limit only. See
// src/lib/alert-rate-limit.ts. Module-level so it spans requests.
const limiter = new AlertRateLimiter();

export async function POST(request: NextRequest) {
  // Require a VALID signed session (verified, not just present). Checked
  // before the limiter so unauthenticated calls never consume budget.
  const auth = await readRequestSession(request);
  if (!auth.ok) {
    return auth.reason === "misconfigured"
      ? NextResponse.json({ error: "misconfigured" }, { status: 500 })
      : NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Per-client (CF-Connecting-IP) and global windows, both enforced.
  if (limiter.check(clientKeyFromHeaders(request.headers)).limited) {
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
