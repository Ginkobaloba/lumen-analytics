import { decompose } from "./decompose";
import type { Episode, SeriesInput } from "./detect";

/*
  Cause attribution: when a top-level metric has an anomaly episode, run
  the same decomposition on every dimensional slice and rank slices by how
  anomalous they are inside the episode window (mean |z| there). The slices
  that carry the anomaly stand far above the slices that merely inherit a
  proportional share, because z is measured against each slice's OWN noise.

  This is the demo-honest version of the pitch: detection is a standard
  decomposition; attribution is the product. A production system would use
  SHAP-style attribution on a trained model with the same explainability UX.
*/

export interface SliceSeries {
  dimension: string; // plan_tier | geography | industry
  value: string; // e.g. "Starter"
  series: SeriesInput;
}

export interface Attribution {
  dimension: string;
  value: string;
  /** Mean signed z inside the episode window. */
  meanZ: number;
  /** Slice lift vs its own expected level inside the window. */
  lift: number;
  /** Share of the top-level deviation carried by this slice (additive
      metrics only; null for rates). */
  contributionShare: number | null;
}

export function attributeEpisode(
  episode: Episode,
  slices: SliceSeries[],
  opts: { additive: boolean },
): Attribution[] {
  const results: Attribution[] = [];

  // Top-level total deviation, for contribution shares on additive metrics.
  const topDeviation =
    (episode.actualAtPeak - episode.expectedAtPeak) *
    (episode.endIndex - episode.startIndex + 1);

  for (const slice of slices) {
    const { values, dayOfWeek } = slice.series;
    const d = decompose(values, dayOfWeek);
    if (d.sigma === 0) continue;

    let zSum = 0;
    let actualSum = 0;
    let expectedSum = 0;
    for (let i = episode.startIndex; i <= episode.endIndex; i++) {
      zSum += d.z[i];
      actualSum += values[i];
      expectedSum += d.trend[i] + d.seasonal[i];
    }
    const len = episode.endIndex - episode.startIndex + 1;
    const meanZ = zSum / len;
    const lift = expectedSum === 0 ? 0 : actualSum / expectedSum - 1;

    results.push({
      dimension: slice.dimension,
      value: slice.value,
      meanZ: Number(meanZ.toFixed(2)),
      lift: Number(lift.toFixed(4)),
      contributionShare:
        opts.additive && topDeviation !== 0
          ? Number(((actualSum - expectedSum) / topDeviation).toFixed(3))
          : null,
    });
  }

  // Rank by anomalousness in the window, same direction as the episode.
  const sign = episode.direction === "up" ? 1 : -1;
  results.sort((a, b) => sign * b.meanZ - sign * a.meanZ);
  return results;
}

/** Top contributing slices: same direction as the episode and clearly
    anomalous on their own terms. */
export function topContributors(
  attributions: Attribution[],
  episode: Episode,
  limit = 3,
): Attribution[] {
  const sign = episode.direction === "up" ? 1 : -1;
  return attributions
    .filter((a) => sign * a.meanZ >= 1.5)
    .slice(0, limit);
}
