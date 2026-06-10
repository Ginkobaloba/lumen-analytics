"use client";

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import type { SeriesPoint } from "@/lib/queries";

export function Sparkline({
  data,
  color = "#178049",
}: {
  data: SeriesPoint[];
  color?: string;
}) {
  return (
    <div className="h-10 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
