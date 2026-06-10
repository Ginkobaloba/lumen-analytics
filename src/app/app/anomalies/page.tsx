import { Suspense } from "react";
import type { Metadata } from "next";
import { AnomalyLog } from "@/components/anomaly-log";
import { getAllAnomalies } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Anomalies",
};

export default function AnomaliesPage() {
  const anomalies = getAllAnomalies();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Anomalies</h1>
        <p className="text-sm text-muted-foreground">
          Everything the detector flagged, with cause attribution and triage
          state. Click a row to drill in.
        </p>
      </div>
      {/* useSearchParams (deep-link focus) requires a Suspense boundary. */}
      <Suspense>
        <AnomalyLog anomalies={anomalies} />
      </Suspense>
    </div>
  );
}
