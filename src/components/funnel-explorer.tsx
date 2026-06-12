"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FunnelSankey } from "@/components/charts/funnel-sankey";
import { formatMetricValue } from "@/lib/format";
import type { FunnelData } from "@/lib/queries";

/*
  Client island for /app/funnels: the trailing-window toggle drives both
  the Sankey and the per-stage stat cards.
*/
export function FunnelExplorer({ data }: { data: FunnelData }) {
  const [days, setDays] = useState(String(data.windows[1]?.days ?? 90));
  const active =
    data.windows.find((w) => String(w.days) === days) ?? data.windows[0];
  const first = active.stages[0];
  const last = active.stages[active.stages.length - 1];

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Acquisition funnel</CardTitle>
              <p className="text-sm text-muted-foreground">
                Signup to paid conversion over the trailing {active.label}.
                Hover a band for exact counts.
              </p>
            </div>
            <Tabs value={days} onValueChange={setDays}>
              <TabsList>
                {data.windows.map((w) => (
                  <TabsTrigger key={w.days} value={String(w.days)}>
                    {w.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <FunnelSankey stages={active.stages} />
        </CardContent>
      </Card>

      <section
        aria-label="Funnel stages"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5"
      >
        {active.stages.map((stage, i) => {
          const prev = i > 0 ? active.stages[i - 1] : null;
          return (
            <Card key={stage.id} className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stage.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="font-heading text-2xl font-semibold tracking-tight">
                  {formatMetricValue(stage.count, "count")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {prev && prev.count > 0
                    ? `${((stage.count / prev.count) * 100).toFixed(1)}% of ${prev.label.toLowerCase()}`
                    : "Top of funnel"}
                </p>
              </CardContent>
            </Card>
          );
        })}
        <Card className="border-brand-pine/30 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Overall conversion
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="font-heading text-2xl font-semibold tracking-tight text-brand-forest">
              {first && first.count > 0
                ? `${((last.count / first.count) * 100).toFixed(2)}%`
                : "0%"}
            </p>
            <p className="text-xs text-muted-foreground">
              {first ? `${first.label} to ${last.label.toLowerCase()}` : ""}
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
