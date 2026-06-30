import { NextResponse } from "next/server";
import { buildSlackPayload, sendSlackAlert, type SlackAlertInput } from "@/lib/alerting";
import { getAnomalyDetail } from "@/lib/anomaly-detail";

export const dynamic = "force-dynamic";

/*
  Routes a detected anomaly to Slack. POST { anomalyId } loads the anomaly,
  builds a Block Kit payload (including the affected-accounts segment), and
  POSTs it to LUMEN_SLACK_WEBHOOK_URL. The response always includes the
  payload so the UI can show exactly what was sent, configured or not.
*/

export async function POST(request: Request) {
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
