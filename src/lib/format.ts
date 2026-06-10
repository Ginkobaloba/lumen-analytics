import type { MetricUnit } from "./data/catalog";

const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const fullCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const fullNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export function formatMetricValue(
  value: number,
  unit: MetricUnit,
  opts: { compact?: boolean } = {},
): string {
  const compact = opts.compact ?? true;
  switch (unit) {
    case "currency":
      return compact ? compactCurrency.format(value) : fullCurrency.format(value);
    case "percent":
      return `${value.toFixed(1)}%`;
    case "hours":
      return `${value.toFixed(1)}h`;
    case "score":
      return value.toFixed(1);
    default:
      return compact && Math.abs(value) >= 10000
        ? compactNumber.format(value)
        : fullNumber.format(value);
  }
}

/** Signed percent string for period-over-period deltas: "+4.2%". */
export function formatDelta(ratio: number): string {
  const pct = ratio * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export function formatDateLong(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateShort(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

export function formatMonthTick(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
  });
}
