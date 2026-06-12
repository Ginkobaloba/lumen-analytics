import type { Metadata } from "next";
import { CohortExplorer } from "@/components/cohort-explorer";
import { formatDateLong } from "@/lib/format";
import { getCohortData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cohorts",
};

export default function CohortsPage() {
  const data = getCohortData();
  const accounts = data.rows.reduce((s, r) => s + r.size, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cohorts</h1>
        <p className="text-sm text-muted-foreground">
          {accounts} accounts across {data.rows.length} signup cohorts, through{" "}
          {formatDateLong(data.asOf)}. Hover a cell for the exact value.
        </p>
      </div>
      <CohortExplorer data={data} />
    </div>
  );
}
