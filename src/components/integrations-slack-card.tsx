"use client";

import { useState } from "react";
import { Code2, Loader2, MessageSquare, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/*
  The one genuinely functional integration: "Send test alert" POSTs a real
  anomaly to /api/alerts/slack, which forwards a Block Kit payload to the
  configured webhook. The card shows the delivery result and lets you
  inspect the exact payload, so the alerting story is demonstrable rather
  than illustrative.
*/

interface AlertResponse {
  configured: boolean;
  delivered: boolean;
  status: number | null;
  target: string | null;
  error?: string;
  payload: unknown;
}

export function IntegrationsSlackCard({
  configured,
  anomalyId,
}: {
  configured: boolean;
  anomalyId: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AlertResponse | null>(null);
  const [showPayload, setShowPayload] = useState(false);

  const sendTest = async () => {
    if (!anomalyId) return;
    setPending(true);
    setResult(null);
    try {
      const r = await fetch("/api/alerts/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anomalyId }),
      });
      setResult((await r.json()) as AlertResponse);
    } catch {
      setResult({
        configured: false,
        delivered: false,
        status: null,
        target: null,
        error: "Network error",
        payload: null,
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden />
            Slack
          </span>
          {configured ? (
            <Badge className="border-transparent bg-brand-pine/10 text-brand-forest">
              Connected
            </Badge>
          ) : (
            <Badge variant="outline">Webhook not set</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Anomaly alerts to #revenue-alerts with severity routing.
        </p>
        <p className="text-xs text-muted-foreground">
          {configured
            ? "Live webhook · severity high and up"
            : "Set LUMEN_SLACK_WEBHOOK_URL to deliver. The button still builds and returns the real payload."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !anomalyId}
            onClick={sendTest}
          >
            {pending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Send className="mr-1 h-3.5 w-3.5" aria-hidden />
            )}
            Send test alert
          </Button>
          {result && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowPayload((s) => !s)}
            >
              <Code2 className="mr-1 h-3.5 w-3.5" aria-hidden />
              {showPayload ? "Hide payload" : "View payload"}
            </Button>
          )}
        </div>
        {result && (
          <p
            className={cn(
              "text-xs",
              result.delivered
                ? "text-metric-good"
                : result.configured
                  ? "text-anomaly-high-text"
                  : "text-anomaly-moderate-text",
            )}
          >
            {result.delivered
              ? `Delivered to ${result.target ?? "Slack"} (HTTP ${result.status}).`
              : result.configured
                ? `Webhook error: ${result.error ?? `HTTP ${result.status}`}.`
                : "No webhook configured. Payload built and returned below."}
          </p>
        )}
        {result && showPayload && (
          <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-2 text-[11px] leading-relaxed">
            {JSON.stringify(result.payload, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
