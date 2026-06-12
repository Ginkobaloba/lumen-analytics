import type { Metadata } from "next";
import {
  BarChart3,
  Bell,
  CreditCard,
  Database,
  MessageSquare,
  Briefcase,
  Cloud,
  Webhook,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Integrations",
};

/* Static demo catalog: a plausible integration surface with a few
   connections "live" so the page reads as an in-use workspace. */
const INTEGRATIONS: {
  category: string;
  items: {
    name: string;
    description: string;
    icon: typeof Database;
    status: "connected" | "available";
    detail?: string;
  }[];
}[] = [
  {
    category: "Data warehouses",
    items: [
      { name: "Snowflake", description: "Sync modeled metrics to your warehouse.", icon: Database, status: "connected", detail: "Syncs hourly · last sync 22 min ago" },
      { name: "BigQuery", description: "Export raw events and daily rollups.", icon: Cloud, status: "available" },
      { name: "Postgres", description: "Read-replica ingestion for product data.", icon: Database, status: "available" },
    ],
  },
  {
    category: "Revenue and CRM",
    items: [
      { name: "Stripe", description: "Billing events drive MRR, churn, and expansion metrics.", icon: CreditCard, status: "connected", detail: "Live webhook · 1,204 events this week" },
      { name: "Salesforce", description: "Account hierarchy and owner mapping.", icon: Briefcase, status: "connected", detail: "Syncs daily · last sync 6 h ago" },
      { name: "HubSpot", description: "Marketing-sourced pipeline attribution.", icon: BarChart3, status: "available" },
    ],
  },
  {
    category: "Alerting and workflow",
    items: [
      { name: "Slack", description: "Anomaly alerts to #revenue-alerts with severity routing.", icon: MessageSquare, status: "connected", detail: "3 channels · severity high and up" },
      { name: "PagerDuty", description: "Page the on-call analyst for critical anomalies.", icon: Bell, status: "available" },
      { name: "Webhooks", description: "POST anomaly and metric events to any endpoint.", icon: Webhook, status: "available" },
    ],
  },
];

export default function IntegrationsPage() {
  const connected = INTEGRATIONS.flatMap((g) => g.items).filter(
    (i) => i.status === "connected",
  ).length;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          {connected} connected. Data sources feed the metric catalog; alerting
          destinations receive anomaly events.
        </p>
      </div>

      {INTEGRATIONS.map((group) => (
        <section key={group.category} aria-label={group.category}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {group.category}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((item) => (
              <Card key={item.name} className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2">
                      <item.icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                      {item.name}
                    </span>
                    {item.status === "connected" ? (
                      <Badge className="border-transparent bg-brand-pine/10 text-brand-forest">
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="outline">Available</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                  {item.status === "connected" ? (
                    <p className="text-xs text-muted-foreground">{item.detail}</p>
                  ) : (
                    <Button size="sm" variant="outline" disabled title="Disabled in the demo workspace">
                      Connect
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <p className="text-xs text-muted-foreground">
        Connections are illustrative; this demo workspace runs on a seeded
        dataset.
      </p>
    </div>
  );
}
