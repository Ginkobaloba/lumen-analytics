import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { TEAM } from "@/lib/data/catalog";

export const metadata: Metadata = {
  title: "Settings",
};

const NOTIFICATIONS: { label: string; detail: string; enabled: boolean }[] = [
  { label: "Critical anomaly alerts", detail: "Email and Slack, immediately", enabled: true },
  { label: "High-severity anomaly alerts", detail: "Slack, immediately", enabled: true },
  { label: "Weekly metrics digest", detail: "Email, Mondays 8:00 AM", enabled: true },
  { label: "Cohort report", detail: "Email, first of the month", enabled: false },
];

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      role="switch"
      aria-checked={on}
      aria-disabled
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        on ? "bg-brand-forest" : "bg-muted-foreground/30"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </span>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Workspace configuration. Settings are read-only in the demo
          workspace.
        </p>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Workspace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="ws-name">
                Workspace name
              </label>
              <Input id="ws-name" value="Lumen Analytics" readOnly />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="ws-domain">
                Workspace URL
              </label>
              <Input id="ws-domain" value="lumenanalytics.io/app" readOnly />
            </div>
          </div>
          <Separator />
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Plan</dt>
              <dd className="mt-0.5 font-medium">
                Scale <Badge variant="outline" className="ml-1">Annual</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Data retention</dt>
              <dd className="mt-0.5 font-medium">24 months</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Timezone</dt>
              <dd className="mt-0.5 font-medium">UTC</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Members</CardTitle>
          <p className="text-sm text-muted-foreground">
            {TEAM.length} members in this workspace.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {TEAM.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2.5">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: u.color }}
                  aria-hidden
                >
                  {u.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                <Badge variant="outline">{u.role}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {NOTIFICATIONS.map((n) => (
              <li key={n.label} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{n.label}</p>
                  <p className="text-xs text-muted-foreground">{n.detail}</p>
                </div>
                <Toggle on={n.enabled} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">API access</CardTitle>
          <p className="text-sm text-muted-foreground">
            Server-side keys for the metrics and anomalies APIs.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">Production</p>
              <p className="font-mono text-xs text-muted-foreground">
                lmn_live_••••••••••••4d2f
              </p>
            </div>
            <Badge variant="outline">Read-only</Badge>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">Staging</p>
              <p className="font-mono text-xs text-muted-foreground">
                lmn_test_••••••••••••91ac
              </p>
            </div>
            <Badge variant="outline">Read-write</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
