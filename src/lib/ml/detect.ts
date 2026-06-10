import { decompose, FLAG_THRESHOLD_SIGMA } from "./decompose";

/*
  Episode detection: flagged days (|z| > 2.5) are grouped into episodes,
  tolerating gaps of up to 2 unflagged days so a noisy dip inside a real
  anomaly window does not split it in two. Single-day blips are dropped;
  they are noise at this threshold by construction.
*/

const MAX_GAP_DAYS = 2;
const MIN_EPISODE_DAYS = 2;

/* Ultra-smooth series (MRR is nearly deterministic day to day) produce
   tiny sigmas, where a 0.3% wiggle scores 7+ z. A z score alone is not an
   anomaly worth a human's attention; require the episode to also move the
   metric by a material amount relative to its expected level. */
const MIN_ABS_LIFT = 0.015;

/* The rolling-median trend and the day-of-week medians are unreliable in
   the first window of the series (asymmetric windows + warm-up artifacts
   in derived metrics), so episodes that start there are discarded. The
   right edge is intentionally NOT guarded: that is where live, Active
   anomalies surface, and the magnitude floor already screens the
   trend-lag artifacts that appear there. */
const LEFT_EDGE_GUARD_DAYS = 30;

export interface SeriesInput {
  dates: string[]; // ISO, oldest first
  values: number[];
  dayOfWeek: number[];
}

export interface Episode {
  startIndex: number;
  endIndex: number; // inclusive
  startDate: string;
  endDate: string;
  peakIndex: number;
  peakDate: string;
  peakZ: number; // signed z at the |z| peak
  direction: "up" | "down";
  expectedAtPeak: number; // trend + seasonal
  actualAtPeak: number;
  sigma: number;
  /** Window mean lift vs expected: actualMean / expectedMean - 1. */
  lift: number;
  severity: "low" | "medium" | "high" | "critical";
}

/* Severity from the |z| peak. Tuned against the seeded dataset so the
   three scripted anomalies land at high/critical and organic noise that
   clears the flag threshold reads as low/medium. */
export function severityForZ(absZ: number): Episode["severity"] {
  if (absZ >= 12) return "critical";
  if (absZ >= 7) return "high";
  if (absZ >= 4.5) return "medium";
  return "low";
}

export function detectEpisodes(series: SeriesInput): Episode[] {
  const { dates, values, dayOfWeek } = series;
  const d = decompose(values, dayOfWeek);
  if (d.sigma === 0) return [];

  const flagged = d.z.map((z) => Math.abs(z) > FLAG_THRESHOLD_SIGMA);
  const episodes: Episode[] = [];
  let start = -1;
  let lastFlagged = -1;

  const close = (endIdx: number) => {
    const len = endIdx - start + 1;
    const flaggedCount = flagged.slice(start, endIdx + 1).filter(Boolean).length;
    if (flaggedCount < MIN_EPISODE_DAYS) return;
    if (start < LEFT_EDGE_GUARD_DAYS) return;

    let peak = start;
    for (let i = start; i <= endIdx; i++) {
      if (Math.abs(d.z[i]) > Math.abs(d.z[peak])) peak = i;
    }
    const expected = d.trend[peak] + d.seasonal[peak];
    const expectedMean =
      values
        .slice(start, endIdx + 1)
        .map((_, k) => d.trend[start + k] + d.seasonal[start + k])
        .reduce((a, b) => a + b, 0) / len;
    const actualMean =
      values.slice(start, endIdx + 1).reduce((a, b) => a + b, 0) / len;

    const lift = expectedMean === 0 ? 0 : actualMean / expectedMean - 1;
    if (Math.abs(lift) < MIN_ABS_LIFT) return;

    episodes.push({
      startIndex: start,
      endIndex: endIdx,
      startDate: dates[start],
      endDate: dates[endIdx],
      peakIndex: peak,
      peakDate: dates[peak],
      peakZ: d.z[peak],
      direction: d.z[peak] >= 0 ? "up" : "down",
      expectedAtPeak: expected,
      actualAtPeak: values[peak],
      sigma: d.sigma,
      lift,
      severity: severityForZ(Math.abs(d.z[peak])),
    });
  };

  for (let i = 0; i < flagged.length; i++) {
    if (flagged[i]) {
      if (start === -1) start = i;
      lastFlagged = i;
    } else if (start !== -1 && i - lastFlagged > MAX_GAP_DAYS) {
      close(lastFlagged);
      start = -1;
    }
  }
  if (start !== -1) close(lastFlagged);

  return episodes;
}
