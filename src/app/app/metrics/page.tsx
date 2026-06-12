import type { Metadata } from "next";
import { MetricCard } from "@/components/metric-card";
import { CATEGORY_LABEL, getMetricsExplorerData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Metrics",
};

export default function MetricsPage() {
  const groups = getMetricsExplorerData();
  const total = groups.reduce((n, g) => n + g.metrics.length, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Metrics</h1>
        <p className="text-sm text-muted-foreground">
          {total} metrics tracked across {groups.length} categories. Click any
          metric for the full series, segments, and detected anomalies.
        </p>
      </div>

      {groups.map((group) => (
        <section key={group.category} aria-label={CATEGORY_LABEL[group.category]}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {CATEGORY_LABEL[group.category]}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {group.metrics.map((summary) => (
              <MetricCard key={summary.metric.id} summary={summary} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
