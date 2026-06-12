import type { Metadata } from "next";
import { Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TEAM } from "@/lib/data/catalog";
import { formatMetricValue } from "@/lib/format";
import { getCustomersList, type CustomerListItem } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Segments",
};

/* Saved segments are a curated demo set over the real dimensional model;
   counts and MRR are computed live from the customers table. */
interface SegmentDef {
  name: string;
  description: string;
  ownerId: (typeof TEAM)[number]["id"];
  chips: string[];
  matches: (c: CustomerListItem) => boolean;
}

const SEGMENTS: SegmentDef[] = [
  {
    name: "Enterprise NA",
    description: "Flagship accounts owned by the revenue team.",
    ownerId: "u-tom",
    chips: ["Enterprise", "NA"],
    matches: (c) =>
      c.status === "active" && c.plan_tier === "Enterprise" && c.geography === "NA",
  },
  {
    name: "Starter EMEA churn watch",
    description:
      "The slice behind the December churn spike; reviewed weekly by customer success.",
    ownerId: "u-david",
    chips: ["Starter", "EMEA", "risk > 50%"],
    matches: (c) =>
      c.status === "active" &&
      c.plan_tier === "Starter" &&
      c.geography === "EMEA" &&
      c.churn_risk > 0.5,
  },
  {
    name: "Growth software API users",
    description: "Growth-tier software companies, the core of API adoption.",
    ownerId: "u-elena",
    chips: ["Growth", "Software"],
    matches: (c) =>
      c.status === "active" && c.plan_tier === "Growth" && c.industry === "Software",
  },
  {
    name: "Expansion candidates",
    description: "Active accounts with an expansion score above 70%.",
    ownerId: "u-marcus",
    chips: ["expansion > 70%"],
    matches: (c) => c.status === "active" && c.expansion_score > 0.7,
  },
  {
    name: "High churn risk",
    description: "Every active account with churn risk above 60%.",
    ownerId: "u-david",
    chips: ["risk > 60%"],
    matches: (c) => c.status === "active" && c.churn_risk > 0.6,
  },
  {
    name: "Churned this year",
    description: "Closed accounts for win-back campaigns.",
    ownerId: "u-sofia",
    chips: ["churned"],
    matches: (c) => c.status === "churned",
  },
];

export default function SegmentsPage() {
  const customers = getCustomersList();
  const owners = new Map(TEAM.map((u) => [u.id, u]));

  const rows = SEGMENTS.map((def) => {
    const members = customers.filter(def.matches);
    return {
      def,
      count: members.length,
      mrr: members.reduce((s, c) => s + c.mrr, 0),
      avgRisk:
        members.length === 0
          ? 0
          : members.reduce((s, c) => s + c.churn_risk, 0) / members.length,
    };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Segments</h1>
        <p className="text-sm text-muted-foreground">
          Saved account segments over plan tier, geography, industry, and risk.
          Counts and MRR are live.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ def, count, mrr, avgRisk }) => {
          const owner = owners.get(def.ownerId)!;
          return (
            <Card key={def.name} className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Filter className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {def.name}
                </CardTitle>
                <p className="text-sm text-muted-foreground">{def.description}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {def.chips.map((chip) => (
                    <Badge key={chip} variant="outline">
                      {chip}
                    </Badge>
                  ))}
                </div>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Accounts</dt>
                    <dd className="font-heading text-lg font-semibold">{count}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">MRR</dt>
                    <dd className="font-heading text-lg font-semibold">
                      {mrr === 0 ? "$0" : formatMetricValue(mrr, "currency")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Avg risk</dt>
                    <dd className="font-heading text-lg font-semibold">
                      {Math.round(avgRisk * 100)}%
                    </dd>
                  </div>
                </dl>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                    style={{ backgroundColor: owner.color }}
                    aria-hidden
                  >
                    {owner.initials}
                  </span>
                  {owner.name}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
