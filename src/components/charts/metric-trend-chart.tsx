"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatDateLong,
  formatMetricValue,
  formatMonthTick,
} from "@/lib/format";
import type { MetricUnit } from "@/lib/data/catalog";
import type { AnomalyListItem, SeriesPoint, SliceSeries } from "@/lib/queries";

/* Anomaly marker colors per the brand rules: muted gold for low/medium,
   terracotta for high/critical. */
const SEVERITY_COLOR: Record<AnomalyListItem["severity"], string> = {
  low: "#D9A441",
  medium: "#D9A441",
  high: "#BE5B41",
  critical: "#BE5B41",
};

/* Categorical palette for slice lines: brand green first, then muted
   complements from the team palette. Industries (6 values) is the widest
   dimension. */
export const SLICE_COLORS = [
  "#178049",
  "#2F6E99",
  "#B0892F",
  "#6B4FA0",
  "#A84A33",
  "#3A403D",
];

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { name?: string; value: number; color?: string }[];
  label?: string;
  unit: MetricUnit;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-sm shadow-sm">
      <p className="font-medium">{formatDateLong(label)}</p>
      {payload.map((entry, i) => (
        <p key={entry.name ?? i} className="flex items-center gap-1.5 text-muted-foreground">
          {entry.color && (
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color }}
              aria-hidden
            />
          )}
          {entry.name ? `${entry.name} ` : ""}
          {formatMetricValue(entry.value, unit, { compact: false })}
        </p>
      ))}
    </div>
  );
}

const AXIS_TICK = { fill: "#3A403D", fontSize: 12 };
const GRID_STROKE = "#E6E8E7";

function useMonthTicks(dates: string[]): string[] {
  return useMemo(() => dates.filter((d) => d.endsWith("-01")), [dates]);
}

/** Top-level 12-month series as a brand-green area chart with clickable
    anomaly markers. */
export function MetricTrendChart({
  data,
  unit,
  markers,
  onMarkerClick,
}: {
  data: SeriesPoint[];
  unit: MetricUnit;
  markers: AnomalyListItem[];
  onMarkerClick?: (anomalyId: string) => void;
}) {
  const reducedMotion = useReducedMotion();
  const monthTicks = useMonthTicks(data.map((p) => p.date));
  const valueByDate = useMemo(
    () => new Map(data.map((p) => [p.date, p.value])),
    [data],
  );

  return (
    <div className="h-72 w-full sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="metricFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#178049" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#178049" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="date"
            ticks={monthTicks}
            tickFormatter={formatMonthTick}
            tick={AXIS_TICK}
            axisLine={{ stroke: GRID_STROKE }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) => formatMetricValue(v, unit)}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={56}
            domain={["auto", "auto"]}
          />
          <Tooltip content={<ChartTooltip unit={unit} />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#178049"
            strokeWidth={2}
            fill="url(#metricFill)"
            isAnimationActive={!reducedMotion}
            animationDuration={900}
          />
          {markers.map((m) => {
            const y = valueByDate.get(m.date);
            if (y === undefined) return null;
            return (
              <ReferenceDot
                key={m.id}
                x={m.date}
                y={y}
                r={6}
                fill={SEVERITY_COLOR[m.severity]}
                stroke="#FFFFFF"
                strokeWidth={2}
                className={onMarkerClick ? "cursor-pointer" : undefined}
                onClick={() => onMarkerClick?.(m.id)}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One line per segment value for a single dimension, sharing the
    top-level chart's axis styling. */
export function MetricSliceChart({
  slices,
  unit,
}: {
  slices: SliceSeries[];
  unit: MetricUnit;
}) {
  const reducedMotion = useReducedMotion();

  // Pivot to one row per date with a column per segment value.
  const rows = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const slice of slices) {
      for (const p of slice.series) {
        let row = byDate.get(p.date);
        if (!row) byDate.set(p.date, (row = { date: p.date }));
        row[slice.value] = p.value;
      }
    }
    return [...byDate.values()].sort((a, b) =>
      (a.date as string) < (b.date as string) ? -1 : 1,
    );
  }, [slices]);

  const monthTicks = useMonthTicks(rows.map((r) => r.date as string));

  return (
    <div className="h-72 w-full sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="date"
            ticks={monthTicks}
            tickFormatter={formatMonthTick}
            tick={AXIS_TICK}
            axisLine={{ stroke: GRID_STROKE }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) => formatMetricValue(v, unit)}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={56}
            domain={["auto", "auto"]}
          />
          <Tooltip content={<ChartTooltip unit={unit} />} />
          {slices.map((slice, i) => (
            <Line
              key={slice.value}
              type="monotone"
              dataKey={slice.value}
              name={slice.value}
              stroke={SLICE_COLORS[i % SLICE_COLORS.length]}
              strokeWidth={1.75}
              dot={false}
              isAnimationActive={!reducedMotion}
              animationDuration={900}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
