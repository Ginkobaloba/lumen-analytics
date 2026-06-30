import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Path-style anomaly links (/app/anomalies/<id>) used to 404 because the
 * drill-in is a client panel keyed off the ?focus= query param on the log
 * page. This route makes the shareable REST-style URL resolve: it sends the
 * visitor to the anomaly log with that anomaly already open. Direct links no
 * longer 404.
 */
export default function AnomalyByIdPage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/app/anomalies?focus=${encodeURIComponent(params.id)}`);
}
