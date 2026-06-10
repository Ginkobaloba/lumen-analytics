"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnomalyFeed } from "@/components/anomaly-feed";
import { AnomalyPanel } from "@/components/anomaly-panel";
import { RevenueTrendChart } from "@/components/charts/revenue-trend-chart";
import type { AnomalyListItem, SeriesPoint } from "@/lib/queries";

/*
  Client island for the interactive half of the overview: the revenue
  trend's anomaly markers and the anomaly feed both open the drill-down
  side panel.
*/
export function OverviewExplorer({
  revenueTrend,
  revenueMarkers,
  recentAnomalies,
}: {
  revenueTrend: SeriesPoint[];
  revenueMarkers: AnomalyListItem[];
  recentAnomalies: AnomalyListItem[];
}) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Card className="shadow-sm xl:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Monthly recurring revenue</CardTitle>
          <p className="text-sm text-muted-foreground">
            Daily MRR with detected anomalies marked. Click a marker to see
            what changed.
          </p>
        </CardHeader>
        <CardContent>
          <RevenueTrendChart
            data={revenueTrend}
            markers={revenueMarkers}
            onMarkerClick={setSelected}
          />
        </CardContent>
      </Card>

      <AnomalyFeed anomalies={recentAnomalies} onSelect={setSelected} />

      <AnomalyPanel anomalyId={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
