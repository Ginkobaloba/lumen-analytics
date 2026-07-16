"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  Loader2,
  Send,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpectedVsActualChart } from "@/components/charts/expected-vs-actual-chart";
import { cn } from "@/lib/utils";
import { formatDateShort, formatMetricValue } from "@/lib/format";
import type { AnomalyDetail } from "@/lib/anomaly-detail";

const SEVERITY_BADGE: Record<string, string> = {
  low: "bg-anomaly-moderate/15 text-anomaly-moderate-text border-transparent",
  medium: "bg-anomaly-moderate/20 text-anomaly-moderate-text border-transparent",
  high: "bg-anomaly-high/15 text-anomaly-high-text border-transparent",
  critical: "bg-anomaly-high/25 text-anomaly-high-text border-transparent",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  false_positive: "False positive",
};

const DIMENSION_LABEL: Record<string, string> = {
  plan_tier: "Plan tier",
  geography: "Geography",
  industry: "Industry",
};

interface TeamMember {
  id: string;
  name: string;
  role: string;
}

interface SlackAlertState {
  configured: boolean;
  delivered: boolean;
  status: number | null;
  target: string | null;
  error?: string;
}

/** Brand severity ramp for churn risk, matching the customers table. */
function riskClass(risk: number): string {
  if (risk >= 0.66) return "text-anomaly-high-text";
  if (risk >= 0.33) return "text-anomaly-moderate-text";
  return "text-metric-good";
}

/** Relative time for the persisted updated_at stamp. */
function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function AnomalyPanel({
  anomalyId,
  onClose,
}: {
  anomalyId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<AnomalyDetail | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [alert, setAlert] = useState<SlackAlertState | null>(null);

  useEffect(() => {
    if (!anomalyId) return;
    setDetail(null);
    setAlert(null);
    let cancelled = false;
    fetch(`/api/anomalies/${anomalyId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((d: AnomalyDetail) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) onClose();
      });
    return () => {
      cancelled = true;
    };
  }, [anomalyId, onClose]);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then(setTeam)
      .catch(() => setTeam([]));
  }, []);

  const act = async (
    body: { action: "acknowledge" } | { action: "assign"; userId: string } | { action: "false_positive" },
  ) => {
    if (!detail) return;
    setPending(body.action);
    try {
      const r = await fetch(`/api/anomalies/${detail.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const updated = await r.json();
        setDetail({
          ...detail,
          status: updated.status,
          assigned_to: updated.assigned_to,
          assignee_name: updated.assignee_name,
          updated_at: updated.updated_at ?? detail.updated_at,
        });
        router.refresh();
      }
    } finally {
      setPending(null);
    }
  };

  const sendToSlack = async () => {
    if (!detail) return;
    setPending("slack");
    setAlert(null);
    try {
      const r = await fetch("/api/alerts/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anomalyId: detail.id }),
      });
      if (r.ok) setAlert((await r.json()) as SlackAlertState);
      else setAlert({ configured: false, delivered: false, status: r.status, target: null, error: `Request failed (${r.status})` });
    } catch {
      setAlert({ configured: false, delivered: false, status: null, target: null, error: "Network error" });
    } finally {
      setPending(null);
    }
  };

  const windowColor =
    detail && (detail.severity === "high" || detail.severity === "critical")
      ? "#BE5B41"
      : "#D9A441";

  return (
    <Sheet open={anomalyId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {!detail ? (
          <div className="space-y-4 pt-8">
            <SheetTitle className="sr-only">Loading anomaly details</SheetTitle>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-2 pr-6 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={cn("capitalize", SEVERITY_BADGE[detail.severity])}>
                  {detail.severity}
                </Badge>
                <Badge variant="outline">{STATUS_LABEL[detail.status]}</Badge>
                {detail.assignee_name && (
                  <span className="text-xs text-muted-foreground">
                    Assigned to {detail.assignee_name}
                  </span>
                )}
                {detail.updated_at && (
                  <span className="text-xs text-muted-foreground">
                    &middot; updated {relativeTime(detail.updated_at)}
                  </span>
                )}
              </div>
              <SheetTitle className="flex items-start gap-1.5 text-lg leading-snug">
                {detail.direction === "up" ? (
                  <ArrowUpRight className="mt-1 h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <ArrowDownRight className="mt-1 h-4 w-4 shrink-0" aria-hidden />
                )}
                {detail.title}
              </SheetTitle>
              <SheetDescription className="text-sm">{detail.summary}</SheetDescription>
            </SheetHeader>

            <div className="mt-5 space-y-6">
              <section>
                <h3 className="mb-1 text-sm font-medium">Expected vs actual</h3>
                <p className="mb-2 text-xs text-muted-foreground">
                  {detail.metric.name}, {formatDateShort(detail.date)} to{" "}
                  {formatDateShort(detail.end_date ?? detail.date)} &middot; peak{" "}
                  {formatMetricValue(detail.actual_value, detail.metric.unit)} vs{" "}
                  {formatMetricValue(detail.expected_value, detail.metric.unit)} expected (
                  {detail.sigma.toFixed(1)} sigma)
                </p>
                <ExpectedVsActualChart
                  series={detail.series}
                  unit={detail.metric.unit}
                  windowColor={windowColor}
                  height={150}
                />
              </section>

              <Separator />

              <section>
                <h3 className="mb-1 text-sm font-medium">What changed</h3>
                {detail.contributors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No dimensional slice stands out for this metric; the change is
                    broad-based or the metric is not segmented.
                  </p>
                ) : (
                  <ul className="space-y-4">
                    {detail.contributors.map((c) => (
                      <li key={`${c.dimension}-${c.value}`} className="rounded-md border p-3">
                        <div className="mb-1 flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium">
                            {c.value}
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              {DIMENSION_LABEL[c.dimension] ?? c.dimension}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "text-xs font-medium",
                              detail.direction === "up"
                                ? "text-anomaly-high-text"
                                : "text-anomaly-high-text",
                            )}
                          >
                            {c.lift > 0 ? "+" : ""}
                            {(c.lift * 100).toFixed(0)}% vs expected
                            {c.contributionShare !== null
                              ? ` · ${(c.contributionShare * 100).toFixed(0)}% of deviation`
                              : ""}
                          </span>
                        </div>
                        <ExpectedVsActualChart
                          series={c.series}
                          unit={detail.metric.unit}
                          windowColor={windowColor}
                          height={96}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {detail.affected && detail.affected.count > 0 && (
                <>
                  <Separator />
                  <section>
                    <div className="mb-1 flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <h3 className="text-sm font-medium">Affected accounts</h3>
                      <Badge variant="outline" className="ml-auto font-normal">
                        {detail.affected.label}
                      </Badge>
                    </div>
                    <p className="mb-3 text-xs text-muted-foreground">
                      {detail.affected.count} account
                      {detail.affected.count === 1 ? "" : "s"} in this segment
                      {detail.affected.churnedCount > 0
                        ? ` · ${detail.affected.churnedCount} already churned`
                        : ""}
                      . The customers behind this spike.
                    </p>
                    <ul className="space-y-1.5">
                      {detail.affected.preview.map((acct) => (
                        <li key={acct.id}>
                          <Link
                            href={`/app/customers/${acct.id}`}
                            className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 transition-colors hover:bg-accent/60"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">
                                {acct.name}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {acct.plan_tier} &middot; {acct.geography} &middot; {acct.industry}
                              </span>
                            </span>
                            {acct.status === "churned" ? (
                              <Badge
                                variant="outline"
                                className="shrink-0 border-transparent bg-anomaly-high/15 text-anomaly-high-text"
                              >
                                Churned
                              </Badge>
                            ) : (
                              <span
                                className={cn(
                                  "shrink-0 font-mono text-xs",
                                  riskClass(acct.churn_risk),
                                )}
                              >
                                {Math.round(acct.churn_risk * 100)}% risk
                              </span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={detail.affected.customersHref}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "mt-3 w-full",
                      )}
                    >
                      View all {detail.affected.count} accounts in Customers
                      <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </section>
                </>
              )}

              <Separator />

              <section>
                <h3 className="mb-2 text-sm font-medium">Suggested next steps</h3>
                <ul className="space-y-2">
                  {detail.suggested_actions.map((a) => (
                    <li key={a} className="flex gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-pine" aria-hidden />
                      {a}
                    </li>
                  ))}
                </ul>
              </section>

              <Separator />

              <section className="space-y-3 pb-6">
                <h3 className="text-sm font-medium">Actions</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    disabled={pending !== null || detail.status === "acknowledged"}
                    onClick={() => act({ action: "acknowledge" })}
                  >
                    {pending === "acknowledge" && (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                    )}
                    Acknowledge
                  </Button>
                  <Select
                    disabled={pending !== null}
                    value={detail.assigned_to ?? ""}
                    onValueChange={(userId) => act({ action: "assign", userId })}
                  >
                    <SelectTrigger className="h-9 w-44 text-sm">
                      <SelectValue placeholder="Assign investigator" />
                    </SelectTrigger>
                    <SelectContent>
                      {team.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending !== null || detail.status === "false_positive"}
                    onClick={() => act({ action: "false_positive" })}
                  >
                    {pending === "false_positive" && (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                    )}
                    Mark as false positive
                  </Button>
                </div>

                <div className="space-y-2 rounded-md border border-dashed p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">Route to Slack</p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending !== null}
                      onClick={sendToSlack}
                    >
                      {pending === "slack" ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Send className="mr-1 h-3.5 w-3.5" aria-hidden />
                      )}
                      Send to Slack
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    POSTs a Block Kit alert to your #revenue-alerts webhook.
                  </p>
                  {alert && (
                    <p
                      className={cn(
                        "text-xs",
                        alert.delivered
                          ? "text-metric-good"
                          : alert.configured
                            ? "text-anomaly-high-text"
                            : "text-anomaly-moderate-text",
                      )}
                    >
                      {alert.delivered
                        ? `Delivered to ${alert.target ?? "Slack"} (HTTP ${alert.status}).`
                        : alert.configured
                          ? `Webhook error: ${alert.error ?? `HTTP ${alert.status}`}.`
                          : "No webhook configured (set LUMEN_SLACK_WEBHOOK_URL). Payload built and ready to send."}
                    </p>
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
