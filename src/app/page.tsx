import {
  Activity,
  ArrowRight,
  Bell,
  Grid3X3,
  LineChart,
  SearchCheck,
  UserCheck,
  Users,
} from "lucide-react";
import ParadigmBanner from "@/components/paradigm-banner";
import PortalTokenClaim from "@/components/portal-token-claim";

/*
  Chunk 2.12 marketing landing. Server-rendered, no chart libraries: the
  hero visual is hand-authored SVG so the page stays light and renders
  anywhere. Copy follows the brand rules: no em dashes, confident and
  plain. The logo strip is the spec-recommended Option A: clearly
  fictional wordmarks with an explicit microcaption.
*/

function SignInButton({ label = "Sign in as demo user" }: { label?: string }) {
  return (
    <form method="POST" action="/api/session">
      <button
        type="submit"
        className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-spruce"
      >
        {label}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </form>
  );
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <span
        className="inline-block h-3.5 w-3.5 rounded-full border-[3px] border-brand-pine"
        aria-hidden
      />
      <span className="font-heading text-lg font-semibold tracking-tight text-brand-forest">
        Lumen
      </span>
    </span>
  );
}

/** Hero visual: a stylized anomaly drill-down, hand-drawn SVG. */
function HeroVisual() {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium">Monthly recurring revenue</p>
        <span className="rounded-full bg-anomaly-high/15 px-2.5 py-0.5 text-xs font-medium text-anomaly-high-text">
          2 anomalies
        </span>
      </div>
      <svg viewBox="0 0 480 180" className="w-full" aria-hidden>
        {/* grid */}
        {[35, 75, 115, 155].map((y) => (
          <line key={y} x1="0" y1={y} x2="480" y2={y} stroke="#E6E8E7" strokeWidth="1" />
        ))}
        {/* expected band */}
        <path
          d="M0,140 C60,132 120,124 180,114 C240,104 300,92 360,78 C420,64 450,56 480,48 L480,70 C450,78 420,86 360,100 C300,114 240,124 180,134 C120,144 60,150 0,158 Z"
          fill="#178049"
          opacity="0.07"
        />
        {/* actual line with a churn dip and recovery */}
        <path
          d="M0,148 C40,142 80,138 120,130 C150,124 170,122 190,118 C205,116 215,128 228,134 C238,138 248,130 258,122 C290,108 330,96 370,84 C410,72 450,62 480,56"
          fill="none"
          stroke="#178049"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* anomaly markers */}
        <circle cx="228" cy="134" r="7" fill="#BE5B41" stroke="#FFFFFF" strokeWidth="2.5" />
        <circle cx="370" cy="84" r="7" fill="#D9A441" stroke="#FFFFFF" strokeWidth="2.5" />
      </svg>
      <div className="mt-3 rounded-lg border bg-background p-3">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Activity className="h-4 w-4 text-anomaly-high-text" aria-hidden />
          Churn Rate spiked 33% above expected
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Concentrated in Starter plans in EMEA. 27 accounts drove 78% of the
          deviation. Suggested: review the December billing migration.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
            Starter
          </span>
          <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
            EMEA
          </span>
          <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
            Assigned to Customer Success
          </span>
        </div>
      </div>
    </div>
  );
}

const ILLUSTRATIVE_CUSTOMERS = [
  "Northwind Software",
  "Halcyon Cloud",
  "Beacon Operations",
  "Atlas Freight Systems",
  "Juniper Health Labs",
  "Cobble & Vane",
];

const FEATURES = [
  {
    icon: Activity,
    title: "Anomalies that explain themselves",
    body: "Trend and seasonality decomposition flags deviations the day they start, sizes the impact, and writes the first draft of the investigation.",
  },
  {
    icon: SearchCheck,
    title: "Cause attribution built in",
    body: "Every anomaly is re-checked across plan tier, geography, and industry, so the alert names the segment that moved instead of leaving you to hunt.",
  },
  {
    icon: LineChart,
    title: "A catalog, not a chart pile",
    body: "32 revenue, conversion, engagement, and support metrics with consistent definitions, sliceable by segment and linked to the accounts behind them.",
  },
  {
    icon: Users,
    title: "From metric to account in two clicks",
    body: "Drill from a churn spike to the cohort, the segment, and the individual customers it touched, with MRR history and usage for each.",
  },
  {
    icon: Grid3X3,
    title: "Cohorts and funnels included",
    body: "Net revenue retention triangles and a signup-to-paid funnel ship out of the box, on the same definitions as everything else.",
  },
  {
    icon: Bell,
    title: "Alerts where your team works",
    body: "Severity-routed Slack alerts, PagerDuty for criticals, and webhooks for everything else. Acknowledge and assign without leaving the tool.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Detect",
    body: "Lumen models the expected path of every metric and flags the days that break it, ranked by severity.",
  },
  {
    n: "02",
    title: "Attribute",
    body: "The same decomposition runs per segment to name the slice that moved and how much of the deviation it owns.",
  },
  {
    n: "03",
    title: "Act",
    body: "Assign an investigator, acknowledge, or mark a false positive. The log keeps the whole history.",
  },
];

export default function Home({
  searchParams,
}: {
  searchParams: { signin?: string };
}) {
  return (
    <>
      <ParadigmBanner />
      <PortalTokenClaim />
      <main className="min-h-screen">
        {/* Header */}
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Wordmark />
          <form method="POST" action="/api/session">
            <button
              type="submit"
              className="rounded-md border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/60"
            >
              Sign in
            </button>
          </form>
        </header>

        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-16 pt-10 lg:grid-cols-2 lg:gap-14">
          <div className="space-y-6">
            <h1 className="font-heading text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              See changes in your business{" "}
              <span className="text-brand-forest">before they hit your P&amp;L</span>
            </h1>
            <p className="max-w-lg text-lg text-muted-foreground">
              Lumen watches every revenue and product metric, flags anomalies
              the day they start, and tells you which segment caused them.
            </p>
            {searchParams.signin === "required" && (
              <p className="max-w-md rounded-md border border-anomaly-moderate/40 bg-anomaly-moderate/10 px-4 py-2 text-sm text-anomaly-moderate-text">
                Sign in to open the demo workspace.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-4">
              <SignInButton label="Open the live demo" />
              <p className="text-xs text-muted-foreground">
                No signup. One click, seeded data.
              </p>
            </div>
          </div>
          <HeroVisual />
        </section>

        {/* Logo strip */}
        <section className="border-y bg-card">
          <div className="mx-auto max-w-6xl px-6 py-8">
            <p className="mb-4 text-center text-xs uppercase tracking-wide text-muted-foreground">
              Illustrative customers. All names fictional.
            </p>
            <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
              {ILLUSTRATIVE_CUSTOMERS.map((name) => (
                <li
                  key={name}
                  className="font-heading text-sm font-semibold tracking-tight text-muted-foreground/70"
                >
                  {name}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Built for the question behind the dashboard
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Most tools show you that a number moved. Lumen is organized around
            what moved it and what to do next.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-lg border bg-card p-5 shadow-sm">
                <f.icon className="h-5 w-5 text-brand-forest" aria-hidden />
                <h3 className="mt-3 font-medium">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-y bg-card">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              Detect, attribute, act
            </h2>
            <div className="mt-8 grid gap-8 md:grid-cols-3">
              {STEPS.map((s) => (
                <div key={s.n}>
                  <p className="font-mono text-sm text-brand-forest">{s.n}</p>
                  <h3 className="mt-2 font-medium">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-6 py-20 text-center">
          <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Walk the December churn spike yourself
          </h2>
          <p className="max-w-xl text-muted-foreground">
            The demo workspace ships with a year of seeded data and a real
            anomaly story: detection, attribution, and triage, end to end.
          </p>
          <SignInButton label="Open the live demo" />
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserCheck className="h-3.5 w-3.5" aria-hidden />
            Signed in as a demo user. Nothing to configure.
          </p>
        </section>

        {/* Footer */}
        <footer className="border-t">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 sm:flex-row">
            <Wordmark />
            <p className="text-xs text-muted-foreground">
              A demo product by Paradigm Coding Solutions. All data is
              synthetic.
            </p>
          </div>
        </footer>
      </main>
    </>
  );
}
