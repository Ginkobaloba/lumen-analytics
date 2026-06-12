"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GEOGRAPHIES, PLAN_TIERS } from "@/lib/data/catalog";
import { cn } from "@/lib/utils";
import { formatDateShort, formatMetricValue } from "@/lib/format";
import type { CustomerListItem } from "@/lib/queries";

const PAGE_SIZE = 25;

type SortKey = "name" | "mrr" | "signup_date" | "churn_risk" | "seats";

const SORTABLE: { key: SortKey; label: string; className?: string }[] = [
  { key: "name", label: "Customer" },
  { key: "mrr", label: "MRR", className: "text-right" },
  { key: "seats", label: "Seats", className: "text-right" },
  { key: "signup_date", label: "Signed up" },
  { key: "churn_risk", label: "Churn risk", className: "text-right" },
];

/* Churn risk follows the brand severity ramp: green when low, muted gold
   in the warning band, terracotta when high. */
function riskClass(risk: number): string {
  if (risk >= 0.66) return "text-anomaly-high-text";
  if (risk >= 0.33) return "text-anomaly-moderate-text";
  return "text-metric-good";
}

export function CustomerTable({ customers }: { customers: CustomerListItem[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<string>("all");
  const [geo, setGeo] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "mrr",
    dir: -1,
  });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = customers.filter(
      (c) =>
        (q === "" ||
          c.name.toLowerCase().includes(q) ||
          c.domain.toLowerCase().includes(q)) &&
        (tier === "all" || c.plan_tier === tier) &&
        (geo === "all" || c.geography === geo) &&
        (status === "all" || c.status === status),
    );
    rows.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return cmp !== 0 ? cmp * sort.dir : a.name.localeCompare(b.name);
    });
    return rows;
  }, [customers, query, tier, geo, status, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(
    clampedPage * PAGE_SIZE,
    (clampedPage + 1) * PAGE_SIZE,
  );

  const applyFilter = (set: (v: string) => void) => (v: string) => {
    set(v);
    setPage(0);
  };

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 },
    );

  const open = (id: string) => router.push(`/app/customers/${id}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Search by name or domain"
          aria-label="Search customers"
          className="h-9 w-full sm:w-64"
        />
        <Select value={tier} onValueChange={applyFilter(setTier)}>
          <SelectTrigger className="h-9 w-36 text-sm" aria-label="Filter by plan tier">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            {PLAN_TIERS.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={geo} onValueChange={applyFilter(setGeo)}>
          <SelectTrigger className="h-9 w-32 text-sm" aria-label="Filter by geography">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All regions</SelectItem>
            {GEOGRAPHIES.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={applyFilter(setStatus)}>
          <SelectTrigger className="h-9 w-32 text-sm" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="churned">Churned</SelectItem>
          </SelectContent>
        </Select>
        <p className="ml-auto text-sm text-muted-foreground">
          {filtered.length} of {customers.length} customers
        </p>
      </div>

      <div className="rounded-lg border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              {SORTABLE.map(({ key, label, className }) => (
                <TableHead
                  key={key}
                  className={cn(
                    className,
                    key === "signup_date" && "hidden md:table-cell",
                    key === "seats" && "hidden sm:table-cell",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(key)}
                    className={cn(
                      "inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground",
                      sort.key === key && "text-foreground",
                    )}
                  >
                    {label}
                    {sort.key === key &&
                      (sort.dir === 1 ? (
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                      ))}
                  </button>
                </TableHead>
              ))}
              <TableHead className="hidden lg:table-cell">Segment</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  No customers match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  onClick={() => open(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      open(c.id);
                    }
                  }}
                >
                  <TableCell>
                    <span className="block font-medium">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {c.domain}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatMetricValue(c.mrr, "currency", { compact: false })}
                  </TableCell>
                  <TableCell className="hidden text-right font-mono text-sm sm:table-cell">
                    {c.seats}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground md:table-cell">
                    {formatDateShort(c.signup_date)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono text-sm",
                      riskClass(c.churn_risk),
                    )}
                  >
                    {Math.round(c.churn_risk * 100)}%
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {c.plan_tier} · {c.geography} · {c.industry}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge
                      variant="outline"
                      className={cn(
                        c.status === "churned" &&
                          "border-transparent bg-anomaly-high/15 text-anomaly-high-text",
                      )}
                    >
                      {c.status === "active" ? "Active" : "Churned"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filtered.length === 0
            ? "0 customers"
            : `${clampedPage * PAGE_SIZE + 1}-${Math.min(
                (clampedPage + 1) * PAGE_SIZE,
                filtered.length,
              )} of ${filtered.length}`}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={clampedPage === 0}
            onClick={() => setPage(clampedPage - 1)}
          >
            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={clampedPage >= pageCount - 1}
            onClick={() => setPage(clampedPage + 1)}
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
