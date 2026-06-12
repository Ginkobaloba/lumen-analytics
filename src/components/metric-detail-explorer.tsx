"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnomalyPanel } from "@/components/anomaly-panel";
import {
  MetricSliceChart,
  MetricTrendChart,
  SLICE_COLORS,
} from "@/components/charts/metric-trend-chart";
import { cn } from "@/lib/utils";
import { formatDateShort } from "@/lib/format";
import type {
  AnomalyListItem,
  MetricDetailData,
  SeriesPoint,
} from "@/lib/queries";

const DIMENSION_LABEL: Record<string, string> = {
  plan_tier: "Plan tier",
  geography: "Geography",
  industry: "Industry",
};

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

function SliceLegend({ values }: { values: string[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {values.map((value, i) => (
        <li key={value} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }}
            aria-hidden
          />
          {value}
        </li>
      ))}
    </ul>
  );
}

function AnomalyListCard({
  anomalies,
  onSelect,
}: {
  anomalies: AnomalyListItem[];
  onSelect: (id: string) => void;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Detected anomalies</CardTitle>
        <p className="text-sm text-muted-foreground">
          {anomalies.length === 0
            ? "The detector found no anomalies for this metric in the trailing 12 months."
            : `${anomalies.length} in the trailing 12 months. Click one to drill in.`}
        </p>
      </CardHeader>
      {anomalies.length > 0 && (
        <CardContent>
          <ul className="divide-y">
            {anomalies.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onSelect(a.id)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-1 py-2.5 text-left transition-colors hover:bg-accent/60"
                >
                  <Badge className={cn("capitalize", SEVERITY_BADGE[a.severity])}>
                    {a.severity}
                  </Badge>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium">
                    {a.direction === "up" ? (
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className="truncate">{a.title}</span>
                  </span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateShort(a.date)}
                    {a.end_date && a.end_date !== a.date
                      ? ` - ${formatDateShort(a.end_date)}`
                      : ""}
                    {" · "}
                    {STATUS_LABEL[a.status]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

/*
  Client island for /app/metrics/[id]: the segment-dimension toggle, the
  trend chart whose anomaly markers open the drill-down panel, and the
  per-metric anomaly list that opens the same panel.
*/
export function MetricDetailExplorer({
  detail,
}: {
  detail: Pick<MetricDetailData, "metric" | "anomalies" | "dimensions"> & {
    series: SeriesPoint[];
  };
}) {
  const { metric, series, anomalies, dimensions } = detail;
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<string>("all");

  const activeDimension = dimensions.find((d) => d.dimension === view) ?? null;

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="space-y-3 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Trailing 12 months</CardTitle>
              <p className="text-sm text-muted-foreground">
                {activeDimension
                  ? `Daily ${metric.name} by ${DIMENSION_LABEL[activeDimension.dimension].toLowerCase()}.`
                  : metric.sliced
                    ? `Daily ${metric.name} with detected anomalies marked. Click a marker to see what changed.`
                    : `Daily ${metric.name} with detected anomalies marked. Click a marker to see what changed. This metric is not segmented.`}
              </p>
            </div>
            {metric.sliced && (
              <Tabs value={view} onValueChange={setView}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  {dimensions.map((d) => (
                    <TabsTrigger key={d.dimension} value={d.dimension}>
                      {DIMENSION_LABEL[d.dimension]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
          </div>
          {activeDimension && (
            <SliceLegend values={activeDimension.slices.map((s) => s.value)} />
          )}
        </CardHeader>
        <CardContent>
          {activeDimension ? (
            <MetricSliceChart
              slices={activeDimension.slices}
              unit={metric.unit}
            />
          ) : (
            <MetricTrendChart
              data={series}
              unit={metric.unit}
              markers={anomalies}
              onMarkerClick={setSelected}
            />
          )}
        </CardContent>
      </Card>

      <AnomalyListCard anomalies={anomalies} onSelect={setSelected} />

      <AnomalyPanel anomalyId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
