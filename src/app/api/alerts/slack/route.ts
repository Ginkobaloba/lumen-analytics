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

// In-memory rate limit: map of client IPs to request timestamps
const requestHistory = new Map<string, number[]>();
const RATE_LIMIT_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 60 seconds

function isRateLimited(clientIp: string): boolean {
  const now = Date.now();
  const timestamps = requestHistory.get(clientIp) || [];

  // Remove old timestamps outside the window
  const filtered = timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (filtered.length >= RATE_LIMIT_REQUESTS) {
    return true;
  }

  // Record this request
  filtered.push(now);
  requestHistory.set(clientIp, filtered);
  return false;
}

function getClientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: NextRequest) {
  // Require session cookie
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Check rate limit
  const clientIp = getClientIp(request);
  if (isRateLimited(clientIp)) {
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
