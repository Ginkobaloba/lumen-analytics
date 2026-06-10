import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnomalyFeed } from "@/components/anomaly-feed";
import { RevenueTrendChart } from "@/components/charts/revenue-trend-chart";
import { KpiCard } from "@/components/kpi-card";
import { formatDateLong } from "@/lib/format";
import { getOverviewData } from "@/lib/queries";

// Reads SQLite per request; the db file only exists after `npm run seed`,
// so build-time prerendering is off for app routes.
export const dynamic = "force-dynamic";

function LiveBadge() {
  return (
    <span className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-green opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-green" />
      </span>
      Live data
    </span>
  );
}

export default function OverviewPage() {
  const { kpis, revenueTrend, revenueMarkers, recentAnomalies, asOf } =
    getOverviewData();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Executive overview
          </h1>
          <p className="text-sm text-muted-foreground">
            Trailing 12 months through {formatDateLong(asOf)}
          </p>
        </div>
        <LiveBadge />
      </div>

      <section
        aria-label="Key performance indicators"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5"
      >
        {kpis.map((kpi) => (
          <KpiCard key={kpi.metric.id} kpi={kpi} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="shadow-sm xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Monthly recurring revenue</CardTitle>
            <p className="text-sm text-muted-foreground">
              Daily MRR with detected anomalies marked
            </p>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart data={revenueTrend} markers={revenueMarkers} />
          </CardContent>
        </Card>

        <AnomalyFeed anomalies={recentAnomalies} />
      </section>
    </div>
  );
}
