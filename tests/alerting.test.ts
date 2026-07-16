import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSlackPayload,
  getWebhookUrl,
  isSlackConfigured,
  sendSlackAlert,
  type SlackAlertInput,
} from "@/lib/alerting";

const INPUT: SlackAlertInput = {
  id: "an-churn",
  title: "Churn Rate spiked 33% above expected",
  summary: "Churn ran above its expected range, concentrated in EMEA and Starter.",
  severity: "critical",
  metricName: "Churn Rate",
  date: "2025-12-21",
  endDate: "2026-01-08",
  sigma: 16.2,
  contributors: [
    { dimension: "geography", value: "EMEA", lift: 1.25 },
    { dimension: "plan_tier", value: "Starter", lift: 0.42 },
  ],
  affected: { label: "EMEA · Starter · E-commerce", count: 17, churnedCount: 0 },
  appBaseUrl: "https://lumen.example.com",
};

describe("buildSlackPayload", () => {
  it("produces a Block Kit message with the anomaly story", () => {
    const payload = buildSlackPayload(INPUT);
    expect(payload.text).toContain("CRITICAL");
    expect(Array.isArray(payload.blocks)).toBe(true);

    const json = JSON.stringify(payload.blocks);
    expect(json).toContain("Churn Rate");
    expect(json).toContain("EMEA");
    expect(json).toContain("Starter");
    expect(json).toContain("16.2 sigma");
    expect(json).toContain("Affected accounts");
    expect(json).toContain("17 accounts in EMEA · Starter · E-commerce");
    // Deep link button to the anomaly.
    expect(json).toContain("https://lumen.example.com/app/anomalies?focus=an-churn");
  });

  it("omits the affected and link blocks when absent", () => {
    const payload = buildSlackPayload({ ...INPUT, affected: null, appBaseUrl: undefined });
    const json = JSON.stringify(payload.blocks);
    expect(json).not.toContain("Affected accounts");
    expect(json).not.toContain("/app/anomalies");
  });
});

describe("sendSlackAlert", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is a no-op that returns the payload when no webhook is set", async () => {
    const env = { ...process.env };
    delete env.LUMEN_SLACK_WEBHOOK_URL;
    expect(isSlackConfigured(env)).toBe(false);
    expect(getWebhookUrl(env)).toBeUndefined();

    const result = await sendSlackAlert(buildSlackPayload(INPUT), env);
    expect(result).toMatchObject({ configured: false, delivered: false, status: null });
    expect(result.payload.blocks.length).toBeGreaterThan(0);
  });

  it("POSTs the payload to the configured webhook and reports delivery", async () => {
    const env = { ...process.env, LUMEN_SLACK_WEBHOOK_URL: "https://hooks.slack.test/services/abc" };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    const payload = buildSlackPayload(INPUT);
    const result = await sendSlackAlert(payload, env);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.slack.test/services/abc");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toMatchObject({ text: payload.text });

    expect(result).toMatchObject({
      configured: true,
      delivered: true,
      status: 200,
      target: "hooks.slack.test",
    });
  });

  it("reports a webhook error without throwing", async () => {
    const env = { ...process.env, LUMEN_SLACK_WEBHOOK_URL: "https://hooks.slack.test/x" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("no", { status: 404 }));

    const result = await sendSlackAlert(buildSlackPayload(INPUT), env);
    expect(result).toMatchObject({ configured: true, delivered: false, status: 404 });
    expect(result.error).toBeDefined();
  });
});
