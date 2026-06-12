import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MetricDetailExplorer } from "@/components/metric-detail-explorer";
import { cn } from "@/lib/utils";
import {
  formatDateLong,
  formatDelta,
  formatMetricValue,
} from "@/lib/format";
import { METRIC_BY_ID } from "@/lib/data/catalog";
import { CATEGORY_LABEL, getMetricDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

export function generateMetadata({
  params,
}: {
  params: { id: string };
}): Metadata {
  return { title: METRIC_BY_ID[params.id]?.name ?? "Metrics" };
}

export default function MetricDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const detail = getMetricDetail(params.id);
  if (!detail) notFound();

  const { metric, current, delta, asOf } = detail;
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
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <Link
          href="/app/metrics"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          All metrics
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {metric.name}
              </h1>
              <Badge variant="outline">{CATEGORY_LABEL[metric.category]}</Badge>
              {metric.sliced && <Badge variant="outline">Segmentable</Badge>}
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {metric.description}
            </p>
          </div>
          <div className="text-right">
            <p className="font-heading text-3xl font-semibold tracking-tight">
              {formatMetricValue(current, metric.unit)}
            </p>
            <p className="flex items-center justify-end gap-1 text-sm text-muted-foreground">
              {delta !== null && (
                <span
                  className={cn(
                    "flex items-center gap-0.5 font-medium",
                    isGood ? "text-metric-good" : "text-metric-bad",
                  )}
                >
                  <DeltaIcon className="h-4 w-4" aria-hidden />
                  {formatDelta(delta)}
                </span>
              )}
              as of {formatDateLong(asOf)}
            </p>
          </div>
        </div>
      </div>

      <MetricDetailExplorer detail={detail} />
    </div>
  );
}
