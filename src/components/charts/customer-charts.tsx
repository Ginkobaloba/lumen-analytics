"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
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

const AXIS_TICK = { fill: "#3A403D", fontSize: 12 };
const GRID_STROKE = "#E6E8E7";

function MonthTooltip({
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
      <p className="font-medium">
        {new Date(`${label}T00:00:00Z`).toLocaleDateString("en-US", {
          timeZone: "UTC",
          month: "long",
          year: "numeric",
        })}
      </p>
      <p className="text-muted-foreground">
        {formatMetricValue(payload[0].value, "currency", { compact: false })}
      </p>
    </div>
  );
}

/** 12 months of customer MRR as a bar chart. */
export function CustomerMrrChart({
  data,
}: {
  data: { month: string; mrr: number }[];
}) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthTick}
            tick={AXIS_TICK}
            axisLine={{ stroke: GRID_STROKE }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatMetricValue(v, "currency")}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<MonthTooltip />} cursor={{ fill: "#E6E8E7", opacity: 0.4 }} />
          <Bar dataKey="mrr" fill="#178049" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function UsageTooltip({
  active,
  payload,
  label,
  name,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  name: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-sm shadow-sm">
      <p className="font-medium">{formatDateLong(label)}</p>
      <p className="text-muted-foreground">
        {payload[0].value.toLocaleString("en-US")} {name}
      </p>
    </div>
  );
}

/** 90 days of one usage series (active users or API calls). */
export function CustomerUsageChart({
  data,
  dataKey,
  name,
  color,
}: {
  data: { date: string; active_users: number; api_calls: number }[];
  dataKey: "active_users" | "api_calls";
  name: string;
  color: string;
}) {
  const gradientId = `usageFill-${dataKey}`;
  const monthTicks = data
    .filter((p) => p.date.endsWith("-01"))
    .map((p) => p.date);

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
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
          />
          <YAxis
            tickFormatter={(v: number) => formatMetricValue(v, "count")}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<UsageTooltip name={name} />} />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
