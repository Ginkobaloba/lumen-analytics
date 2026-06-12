import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkline } from "@/components/charts/sparkline";
import { cn } from "@/lib/utils";
import { formatDelta, formatMetricValue } from "@/lib/format";
import type { MetricSummary } from "@/lib/queries";

/* Same delta semantics as KpiCard: goodness follows the metric's
   direction, not the sign. The whole card links to the metric detail. */
export function MetricCard({ summary }: { summary: MetricSummary }) {
  const { metric, current, delta, spark, anomalyCount } = summary;
  const isGood =
    delta === null
      ? null
      : metric.goodDirection === "up"
        ? delta >= 0
        : delta <= 0;

  const DeltaIcon =
    delta === null || Math.abs(delta) < 0.0005
      ? Minus
      : delta > 0
        ? ArrowUpRight
        : ArrowDownRight;

  return (
    <Link
      href={`/app/metrics/${metric.id}`}
      className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="h-full shadow-sm transition-colors group-hover:border-brand-pine/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-baseline justify-between gap-2 text-sm font-medium text-muted-foreground">
            <span className="truncate">{metric.name}</span>
            {anomalyCount > 0 && (
              <span className="shrink-0 rounded-full bg-anomaly-moderate/15 px-2 py-0.5 text-[11px] font-medium text-anomaly-moderate-text">
                {anomalyCount} {anomalyCount === 1 ? "anomaly" : "anomalies"}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-heading text-2xl font-semibold tracking-tight">
              {formatMetricValue(current, metric.unit)}
            </span>
            {delta !== null && (
              <span
                className={cn(
                  "flex items-center gap-0.5 text-sm font-medium",
                  isGood ? "text-metric-good" : "text-metric-bad",
                )}
              >
                <DeltaIcon className="h-4 w-4" aria-hidden />
                {formatDelta(delta)}
              </span>
            )}
          </div>
          <Sparkline data={spark} color={isGood === false ? "#A84A33" : "#178049"} />
          <p className="text-xs text-muted-foreground">
            vs. prior 30 days{metric.sliced ? " · segmentable" : ""}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
