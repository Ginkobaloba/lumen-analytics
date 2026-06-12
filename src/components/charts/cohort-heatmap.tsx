"use client";

import { useMemo } from "react";
import { color as parseColor, scaleLinear } from "d3";
import { formatMetricValue, formatMonthTick } from "@/lib/format";
import type { CohortRow } from "@/lib/queries";

/*
  Cohort triangle as a scrollable grid. Cell color comes from a d3 linear
  scale through the brand ramp (terracotta = bad, muted gold = warning,
  forest green = good); text flips to white on dark fills.
*/

export type CohortMetric = "nrr" | "logo";

const SCALE_STOPS: Record<CohortMetric, { domain: number[]; range: string[] }> = {
  nrr: {
    domain: [70, 90, 100, 115],
    range: ["#BE5B41", "#D9A441", "#BFD8C7", "#178049"],
  },
  logo: {
    domain: [70, 85, 95, 100],
    range: ["#BE5B41", "#D9A441", "#BFD8C7", "#178049"],
  },
};

function cohortLabel(month: string): string {
  return new Date(`${month}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    year: "numeric",
  });
}

/** Luminance check for text contrast flips. d3 scales emit rgb(...)
    strings, so parse with d3 rather than assuming hex. */
function isDark(fill: string): boolean {
  const c = parseColor(fill)?.rgb();
  if (!c) return false;
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b < 140;
}

export function CohortHeatmap({
  rows,
  metric,
}: {
  rows: CohortRow[];
  metric: CohortMetric;
}) {
  const color = useMemo(() => {
    const { domain, range } = SCALE_STOPS[metric];
    return scaleLinear<string>().domain(domain).range(range).clamp(true);
  }, [metric]);

  const offsets = rows.length > 0 ? rows[0][metric].length : 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-sm">
        <thead>
          <tr>
            <th className="min-w-32 px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">
              Cohort
            </th>
            <th className="px-2 py-1.5 text-right text-xs font-medium text-muted-foreground">
              Accounts
            </th>
            <th className="px-2 py-1.5 text-right text-xs font-medium text-muted-foreground">
              Start MRR
            </th>
            {Array.from({ length: offsets }, (_, k) => (
              <th
                key={k}
                className="min-w-12 px-1 py-1.5 text-center text-xs font-medium text-muted-foreground"
              >
                M{k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.month}>
              <td className="whitespace-nowrap px-2 py-1 text-xs font-medium">
                {cohortLabel(row.month)}
              </td>
              <td className="px-2 py-1 text-right font-mono text-xs text-muted-foreground">
                {row.size}
              </td>
              <td className="whitespace-nowrap px-2 py-1 text-right font-mono text-xs text-muted-foreground">
                {formatMetricValue(row.baseMrr, "currency")}
              </td>
              {row[metric].map((value, k) => {
                if (value === null) {
                  return <td key={k} aria-hidden className="bg-muted/30" />;
                }
                const fill = color(value);
                return (
                  <td
                    key={k}
                    className="px-1 py-1 text-center font-mono text-xs"
                    style={{
                      backgroundColor: fill,
                      color: isDark(fill) ? "#FFFFFF" : "#1F2421",
                    }}
                    title={`${cohortLabel(row.month)} cohort, month ${k} (${formatMonthTick(
                      row.month,
                    )} + ${k}): ${value.toFixed(1)}%`}
                  >
                    {Math.round(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CohortLegend({ metric }: { metric: CohortMetric }) {
  const { domain, range } = SCALE_STOPS[metric];
  const gradient = `linear-gradient(to right, ${range.join(", ")})`;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>{domain[0]}%</span>
      <span
        className="h-2 w-28 rounded-full"
        style={{ background: gradient }}
        aria-hidden
      />
      <span>
        {domain[domain.length - 1]}%{metric === "nrr" ? "+" : ""}
      </span>
    </div>
  );
}
