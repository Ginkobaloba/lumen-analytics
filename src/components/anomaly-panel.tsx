"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  useEffect(() => {
    if (!anomalyId) return;
    setDetail(null);
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
        });
        router.refresh();
      }
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
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
