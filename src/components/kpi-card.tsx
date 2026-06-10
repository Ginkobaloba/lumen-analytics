import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkline } from "@/components/charts/sparkline";
import { cn } from "@/lib/utils";
import { formatDelta, formatMetricValue } from "@/lib/format";
import type { Kpi } from "@/lib/queries";

/* Delta semantics follow the metric, not the sign: a falling churn rate is
   green, a rising one is terracotta. */
export function KpiCard({ kpi }: { kpi: Kpi }) {
  const { metric, current, delta, spark } = kpi;
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
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {metric.name}
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
        <p className="text-xs text-muted-foreground">vs. prior 30 days</p>
      </CardContent>
    </Card>
  );
}
