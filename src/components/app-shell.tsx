"use client";

import {
  Activity,
  Blocks,
  Filter,
  Grid3X3,
  LayoutDashboard,
  LineChart,
  Settings,
  Users,
  Waypoints,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  { href: "/app/metrics", label: "Metrics", icon: LineChart },
  { href: "/app/customers", label: "Customers", icon: Users },
  { href: "/app/funnels", label: "Funnels", icon: Waypoints },
  { href: "/app/cohorts", label: "Cohorts", icon: Grid3X3 },
  { href: "/app/anomalies", label: "Anomalies", icon: Activity },
  { href: "/app/segments", label: "Segments", icon: Filter },
  { href: "/app/integrations", label: "Integrations", icon: Blocks },
  { href: "/app/settings", label: "Settings", icon: Settings },
] as const;

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2 px-2">
      <span
        className="inline-block h-3.5 w-3.5 rounded-full border-[3px] border-brand-pine"
        aria-hidden
      />
      <span className="font-heading text-lg font-semibold tracking-tight text-brand-forest">
        Lumen
      </span>
    </Link>
  );
}

function NavLinks({ orientation }: { orientation: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className={cn(
        orientation === "vertical"
          ? "flex flex-col gap-1"
          : "flex gap-1 overflow-x-auto pb-1",
      )}
    >
      {NAV.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/app" ? pathname === "/app" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 border-r bg-card px-3 py-5 lg:flex lg:flex-col lg:gap-6">
        <Wordmark />
        <NavLinks orientation="vertical" />
        <p className="mt-auto px-2 text-[11px] leading-relaxed text-muted-foreground">
          Demo workspace. All data is synthetic.
        </p>
      </aside>

      {/* Mobile header */}
      <header className="flex flex-col gap-3 border-b bg-card px-4 py-3 lg:hidden">
        <Wordmark />
        <NavLinks orientation="horizontal" />
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
