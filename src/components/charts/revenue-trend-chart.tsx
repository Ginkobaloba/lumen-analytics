"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
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
import type { AnomalyListItem, SeriesPoint } from "@/lib/queries";

/* Anomaly marker colors per the brand rules: muted gold for low/medium,
   terracotta for high/critical. */
const SEVERITY_COLOR: Record<AnomalyListItem["severity"], string> = {
  low: "#D9A441",
  medium: "#D9A441",
  high: "#BE5B41",
  critical: "#BE5B41",
};

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

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-sm shadow-sm">
      <p className="font-medium">{formatDateLong(label)}</p>
      <p className="text-muted-foreground">
        MRR {formatMetricValue(payload[0].value, "currency", { compact: false })}
      </p>
    </div>
  );
}

export function RevenueTrendChart({
  data,
  markers,
  onMarkerClick,
}: {
  data: SeriesPoint[];
  markers: AnomalyListItem[];
  onMarkerClick?: (anomalyId: string) => void;
}) {
  const reducedMotion = useReducedMotion();

  // First-of-month tick positions for a clean 12-month axis.
  const monthTicks = useMemo(
    () => data.filter((p) => p.date.endsWith("-01")).map((p) => p.date),
    [data],
  );

  const valueByDate = useMemo(
    () => new Map(data.map((p) => [p.date, p.value])),
    [data],
  );

  return (
    <div className="h-72 w-full sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#178049" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#178049" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#E6E8E7" vertical={false} />
          <XAxis
            dataKey="date"
            ticks={monthTicks}
            tickFormatter={formatMonthTick}
            tick={{ fill: "#3A403D", fontSize: 12 }}
            axisLine={{ stroke: "#E6E8E7" }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) => formatMetricValue(v, "currency")}
            tick={{ fill: "#3A403D", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={56}
            domain={["auto", "auto"]}
          />
          <Tooltip content={<TrendTooltip />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#178049"
            strokeWidth={2}
            fill="url(#mrrFill)"
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
