import type { Metadata } from "next";
import { FunnelExplorer } from "@/components/funnel-explorer";
import { formatDateLong } from "@/lib/format";
import { getFunnelData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Funnels",
};

export default function FunnelsPage() {
  const data = getFunnelData();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Funnels</h1>
        <p className="text-sm text-muted-foreground">
          How signups become paying customers, through{" "}
          {formatDateLong(data.asOf)}.
        </p>
      </div>
      <FunnelExplorer data={data} />
    </div>
  );
}
