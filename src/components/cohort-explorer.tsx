"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CohortHeatmap,
  CohortLegend,
  type CohortMetric,
} from "@/components/charts/cohort-heatmap";
import type { CohortData } from "@/lib/queries";

const METRIC_COPY: Record<CohortMetric, { title: string; blurb: string }> = {
  nrr: {
    title: "Net revenue retention",
    blurb:
      "Cohort MRR in each month as a share of its month-0 MRR. Above 100 means expansion outpaces churn and contraction.",
  },
  logo: {
    title: "Logo retention",
    blurb:
      "Share of each cohort's accounts that have not churned by the given month.",
  },
};

/*
  Client island for /app/cohorts: the metric toggle drives the heatmap
  and its legend.
*/
export function CohortExplorer({ data }: { data: CohortData }) {
  const [metric, setMetric] = useState<CohortMetric>("nrr");

  return (
    <Card className="shadow-sm">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              {METRIC_COPY[metric].title} by signup cohort
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {METRIC_COPY[metric].blurb}
            </p>
          </div>
          <Tabs
            value={metric}
            onValueChange={(v) => setMetric(v as CohortMetric)}
          >
            <TabsList>
              <TabsTrigger value="nrr">Revenue</TabsTrigger>
              <TabsTrigger value="logo">Logos</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <CohortLegend metric={metric} />
      </CardHeader>
      <CardContent>
        <CohortHeatmap rows={data.rows} metric={metric} />
      </CardContent>
    </Card>
  );
}
