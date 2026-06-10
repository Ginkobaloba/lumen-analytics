/*
  STL-style series decomposition: robust trend + weekly seasonality +
  residual, with anomalies flagged at |residual| > 2.5 robust sigma.

  Two deliberate robustness choices, both pinned by tests:
  - The trend is a centered rolling MEDIAN (window 41). A 2-3 week anomaly
    pulse covers less than half the window, so the median holds the
    baseline and the full pulse lands in the residual. A moving average
    would absorb up to two thirds of it.
  - Sigma is MAD-based (median absolute deviation x 1.4826). Standard
    deviation would be inflated by the very anomalies we are trying to
    flag, suppressing detection.
*/

export const FLAG_THRESHOLD_SIGMA = 2.5;
const TREND_WINDOW = 41; // odd; > 2x the longest expected anomaly episode

export interface Decomposition {
  trend: number[];
  seasonal: number[];
  residual: number[];
  /** Robust residual sigma; the unit of the z scores. */
  sigma: number;
  /** residual / sigma per point (0 when sigma is 0). */
  z: number[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function rollingMedian(values: number[], window: number): number[] {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(values.length, i + half + 1);
    return median(values.slice(start, end));
  });
}

/**
 * @param values series values, oldest first
 * @param dayOfWeek 0-6 per point (same length as values)
 */
export function decompose(values: number[], dayOfWeek: number[]): Decomposition {
  if (values.length !== dayOfWeek.length) {
    throw new Error("values and dayOfWeek must be the same length");
  }
  const trend = rollingMedian(values, TREND_WINDOW);
  const detrended = values.map((v, i) => v - trend[i]);

  // Weekly seasonality: median detrended value per day-of-week, centered
  // so the seasonal component carries no level.
  const byDow: number[][] = Array.from({ length: 7 }, () => []);
  detrended.forEach((d, i) => byDow[dayOfWeek[i]].push(d));
  const dowMedians = byDow.map((arr) => median(arr));
  const seasonalLevel = median(dowMedians.filter((_, d) => byDow[d].length > 0));
  const seasonalByDow = dowMedians.map((m) => m - seasonalLevel);

  const seasonal = dayOfWeek.map((d) => seasonalByDow[d]);
  const residual = values.map((v, i) => v - trend[i] - seasonal[i]);

  const sigma = median(residual.map(Math.abs)) * 1.4826;
  const z = residual.map((r) => (sigma === 0 ? 0 : r / sigma));

  return { trend, seasonal, residual, sigma, z };
}
