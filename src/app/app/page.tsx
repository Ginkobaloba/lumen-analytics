import { KpiCard } from "@/components/kpi-card";
import { OverviewExplorer } from "@/components/overview-explorer";
import { formatDateLong } from "@/lib/format";
import { getOverviewData } from "@/lib/queries";

// Reads SQLite per request; the db file only exists after `npm run seed`,
// so build-time prerendering is off for app routes.
export const dynamic = "force-dynamic";

function SnapshotBadge({ asOf }: { asOf: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <span
        className="inline-block h-2 w-2 rounded-full bg-muted-foreground/60"
        aria-hidden
      />
      Demo snapshot, {formatDateLong(asOf)}
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
        <SnapshotBadge asOf={asOf} />
      </div>

      <section
        aria-label="Key performance indicators"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5"
      >
        {kpis.map((kpi) => (
          <KpiCard key={kpi.metric.id} kpi={kpi} />
        ))}
      </section>

      <OverviewExplorer
        revenueTrend={revenueTrend}
        revenueMarkers={revenueMarkers}
        recentAnomalies={recentAnomalies}
      />
    </div>
  );
}
