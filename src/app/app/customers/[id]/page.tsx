import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  LifeBuoy,
  LogIn,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CustomerMrrChart,
  CustomerUsageChart,
} from "@/components/charts/customer-charts";
import { cn } from "@/lib/utils";
import {
  formatDateLong,
  formatDateShort,
  formatMetricValue,
} from "@/lib/format";
import { getCustomerDetail, type CustomerEvent } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Customers",
};

function riskClass(risk: number): string {
  if (risk >= 0.66) return "text-anomaly-high-text";
  if (risk >= 0.33) return "text-anomaly-moderate-text";
  return "text-metric-good";
}

const EVENT_ICON: Record<string, typeof Activity> = {
  signup: UserPlus,
  activation: Sparkles,
  upgrade: ArrowUpRight,
  expansion: ArrowUpRight,
  downgrade: ArrowDownRight,
  churn: AlertTriangle,
  support_ticket: LifeBuoy,
  login: LogIn,
};

function eventLabel(e: CustomerEvent): string {
  const p = e.properties;
  switch (e.type) {
    case "signup":
      return `Signed up (${String(p.source ?? "unknown source")})`;
    case "activation":
      return "Reached the activation milestone";
    case "upgrade":
      return "Upgraded plan";
    case "expansion":
      return `Expanded: +${String(p.added_seats ?? "?")} seats, +${formatMetricValue(Number(p.added_mrr ?? 0), "currency", { compact: false })} MRR`;
    case "downgrade":
      return `Downgraded: -${formatMetricValue(Number(p.removed_mrr ?? 0), "currency", { compact: false })} MRR`;
    case "churn":
      return `Churned (${String(p.reason ?? "unspecified")})`;
    case "support_ticket":
      return `Support ticket: ${String(p.topic ?? "general")} (${String(p.priority ?? "normal")})`;
    case "login":
      return `Active in product${p.feature ? `: ${String(p.feature)}` : ""}`;
    default:
      return e.type;
  }
}

function Fact({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 font-heading text-lg font-semibold tracking-tight", valueClass)}>
        {value}
      </p>
    </div>
  );
}

export default function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const detail = getCustomerDetail(params.id);
  if (!detail) notFound();

  const { customer, owner, mrrHistory, usage, events } = detail;
  const churned = customer.status === "churned";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <Link
          href="/app/customers"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          All customers
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {customer.name}
              </h1>
              <Badge
                variant="outline"
                className={cn(
                  churned &&
                    "border-transparent bg-anomaly-high/15 text-anomaly-high-text",
                )}
              >
                {churned ? "Churned" : "Active"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {customer.domain} · {customer.plan_tier} · {customer.geography} ·{" "}
              {customer.industry}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: owner.color }}
              aria-hidden
            >
              {owner.initials}
            </span>
            <div>
              <p className="text-sm font-medium leading-tight">{owner.name}</p>
              <p className="text-xs text-muted-foreground">{owner.role}</p>
            </div>
          </div>
        </div>
      </div>

      <section
        aria-label="Account facts"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
      >
        <Fact
          label="MRR"
          value={formatMetricValue(customer.mrr, "currency", { compact: false })}
        />
        <Fact label="Seats" value={String(customer.seats)} />
        <Fact label="Signed up" value={formatDateShort(customer.signup_date)} />
        <Fact
          label={churned ? "Churned on" : "Last active"}
          value={
            churned
              ? formatDateShort(customer.churned_at ?? customer.signup_date)
              : customer.last_active_date
                ? formatDateShort(customer.last_active_date)
                : "Never"
          }
        />
        <Fact
          label="Churn risk"
          value={`${Math.round(customer.churn_risk * 100)}%`}
          valueClass={riskClass(customer.churn_risk)}
        />
        <Fact
          label="Expansion score"
          value={`${Math.round(customer.expansion_score * 100)}%`}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">MRR history</CardTitle>
            <p className="text-sm text-muted-foreground">Trailing 12 months</p>
          </CardHeader>
          <CardContent>
            <CustomerMrrChart data={mrrHistory} />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Active users</CardTitle>
            <p className="text-sm text-muted-foreground">Trailing 90 days</p>
          </CardHeader>
          <CardContent>
            <CustomerUsageChart
              data={usage}
              dataKey="active_users"
              name="active users"
              color="#178049"
            />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">API calls</CardTitle>
            <p className="text-sm text-muted-foreground">Trailing 90 days</p>
          </CardHeader>
          <CardContent>
            <CustomerUsageChart
              data={usage}
              dataKey="api_calls"
              name="API calls"
              color="#2F6E99"
            />
          </CardContent>
        </Card>
      </section>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent activity</CardTitle>
          <p className="text-sm text-muted-foreground">
            {events.length === 0
              ? "No recorded events for this account."
              : "Latest recorded events for this account."}
          </p>
        </CardHeader>
        {events.length > 0 && (
          <CardContent>
            <ul className="divide-y">
              {events.map((e, i) => {
                const Icon = EVENT_ICON[e.type] ?? Activity;
                return (
                  <li key={`${e.occurred_at}-${i}`} className="flex items-center gap-3 py-2.5">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {eventLabel(e)}
                    </span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateLong(e.occurred_at.slice(0, 10))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
