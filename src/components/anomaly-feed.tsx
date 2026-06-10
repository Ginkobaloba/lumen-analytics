import { ArrowDownRight, ArrowUpRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDateShort } from "@/lib/format";
import type { AnomalyListItem } from "@/lib/queries";

const SEVERITY_STYLE: Record<AnomalyListItem["severity"], string> = {
  low: "bg-anomaly-moderate/15 text-anomaly-moderate-text border-transparent",
  medium: "bg-anomaly-moderate/20 text-anomaly-moderate-text border-transparent",
  high: "bg-anomaly-high/15 text-anomaly-high-text border-transparent",
  critical: "bg-anomaly-high/25 text-anomaly-high-text border-transparent",
};

const STATUS_LABEL: Record<AnomalyListItem["status"], string> = {
  active: "Active",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  false_positive: "False positive",
};

export function AnomalyFeed({ anomalies }: { anomalies: AnomalyListItem[] }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recently detected anomalies</CardTitle>
      </CardHeader>
      <CardContent>
        {anomalies.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckCircle2 className="h-8 w-8 text-brand-meadow" aria-hidden />
            <p className="text-sm font-medium">No anomalies right now</p>
            <p className="text-xs text-muted-foreground">
              Lumen scans 32 metrics and their segments daily and surfaces
              anything outside the expected range here.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {anomalies.map((a) => (
              <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                <Link
                  href={`/app/anomalies?focus=${a.id}`}
                  className="group block space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-medium group-hover:text-brand-pine">
                      {a.direction === "up" ? (
                        <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 shrink-0" aria-hidden />
                      )}
                      {a.title}
                    </span>
                    <Badge className={cn("shrink-0 capitalize", SEVERITY_STYLE[a.severity])}>
                      {a.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {a.metric_name} &middot; {formatDateShort(a.date)} &middot;{" "}
                    {STATUS_LABEL[a.status]}
                    {a.assignee_name ? ` · ${a.assignee_name}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
