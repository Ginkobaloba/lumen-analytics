"use client";

import { useMemo } from "react";
import {
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDateShort, formatMetricValue } from "@/lib/format";
import type { MetricUnit } from "@/lib/data/catalog";
import type { ExpectedVsActualSeries } from "@/lib/anomaly-detail";

/*
  Expected vs Actual mini chart for the anomaly panel: solid actual line,
  dashed expected line, episode window shaded in the severity color.
*/

function MiniTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { name?: string; value: number }[];
  label?: string;
  unit: MetricUnit;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-medium">{formatDateShort(label)}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-muted-foreground">
          {p.name}: {formatMetricValue(p.value, unit)}
        </p>
      ))}
    </div>
  );
}

export function ExpectedVsActualChart({
  series,
  unit,
  windowColor = "#D9A441",
  height = 130,
}: {
  series: ExpectedVsActualSeries;
  unit: MetricUnit;
  windowColor?: string;
  height?: number;
}) {
  const data = useMemo(
    () =>
      series.dates.map((date, i) => ({
        date,
        actual: series.actual[i],
        expected: series.expected[i],
      })),
    [series],
  );

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="date"
            tickFormatter={formatDateShort}
            tick={{ fill: "#3A403D", fontSize: 10 }}
            axisLine={{ stroke: "#E6E8E7" }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={48}
          />
          <YAxis
            tickFormatter={(v: number) => formatMetricValue(v, unit)}
            tick={{ fill: "#3A403D", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={44}
            domain={["auto", "auto"]}
          />
          <Tooltip content={<MiniTooltip unit={unit} />} />
          <ReferenceArea
            x1={series.windowStart}
            x2={series.windowEnd}
            fill={windowColor}
            fillOpacity={0.12}
            stroke={windowColor}
            strokeOpacity={0.35}
            strokeDasharray="3 3"
          />
          <Line
            type="monotone"
            dataKey="expected"
            name="Expected"
            stroke="#3A403D"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="Actual"
            stroke="#178049"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
