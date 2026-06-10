"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { AnomalyPanel } from "@/components/anomaly-panel";
import { cn } from "@/lib/utils";
import { formatDateShort } from "@/lib/format";
import type { AnomalyListItem } from "@/lib/queries";

const SEVERITY_STYLE: Record<string, string> = {
  low: "bg-anomaly-moderate/15 text-anomaly-moderate-text border-transparent",
  medium: "bg-anomaly-moderate/20 text-anomaly-moderate-text border-transparent",
  high: "bg-anomaly-high/15 text-anomaly-high-text border-transparent",
  critical: "bg-anomaly-high/25 text-anomaly-high-text border-transparent",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  false_positive: "False positive",
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

export function AnomalyLog({ anomalies }: { anomalies: AnomalyListItem[] }) {
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<string | null>(
    searchParams.get("focus"),
  );
  const [status, setStatus] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");

  const filtered = useMemo(
    () =>
      anomalies.filter(
        (a) =>
          (status === "all" || a.status === status) &&
          (severity === "all" || a.severity === severity),
      ),
    [anomalies, status, severity],
  );

  const counts = useMemo(() => {
    const active = anomalies.filter((a) => a.status === "active").length;
    return { total: anomalies.length, active };
  }, [anomalies]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {counts.total} anomalies detected in the trailing 12 months,{" "}
          {counts.active} active
        </p>
        <div className="flex gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-40 text-sm" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="h-9 w-36 text-sm" aria-label="Filter by severity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {SEVERITY_ORDER.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Severity</TableHead>
              <TableHead>Anomaly</TableHead>
              <TableHead className="hidden md:table-cell">Window</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="hidden lg:table-cell">Investigator</TableHead>
              <TableHead className="w-20 text-right">Sigma</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No anomalies match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((a) => (
                <TableRow
                  key={a.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  onClick={() => setSelected(a.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(a.id);
                    }
                  }}
                >
                  <TableCell>
                    <Badge className={cn("capitalize", SEVERITY_STYLE[a.severity])}>
                      {a.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 font-medium">
                      {a.direction === "up" ? (
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                      {a.title}
                    </span>
                    <span className="mt-0.5 block pl-[22px] text-xs text-muted-foreground">
                      {a.metric_name}
                    </span>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground md:table-cell">
                    {formatDateShort(a.date)}
                    {a.end_date && a.end_date !== a.date
                      ? ` - ${formatDateShort(a.end_date)}`
                      : ""}
                  </TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">
                    {STATUS_LABEL[a.status]}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {a.assignee_name ?? "Unassigned"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {a.sigma.toFixed(1)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AnomalyPanel anomalyId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
