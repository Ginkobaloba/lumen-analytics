import type { MetricDef } from "../data/catalog";
import { formatDateShort } from "../format";
import type { Attribution } from "./attribute";
import type { Episode } from "./detect";

/*
  Auto-generated titles, summaries, and suggested next steps. Pure string
  templates over the detection output: honest about being heuristic, and
  deterministic so the demo reads the same every run.
*/

const DIMENSION_LABEL: Record<string, string> = {
  plan_tier: "tier",
  geography: "region",
  industry: "industry",
};

function pct(x: number): string {
  return `${Math.abs(x * 100).toFixed(0)}%`;
}

function slicePhrase(contributors: Attribution[]): string | null {
  if (contributors.length === 0) return null;
  const parts = contributors
    .slice(0, 2)
    .map((c) => `${c.value} (${DIMENSION_LABEL[c.dimension] ?? c.dimension})`);
  return parts.join(" and ");
}

export function episodeTitle(metric: MetricDef, episode: Episode): string {
  const verb = episode.direction === "up" ? "spiked" : "dropped";
  return `${metric.name} ${verb} ${pct(episode.lift)} ${
    episode.direction === "up" ? "above" : "below"
  } expected`;
}

export function episodeSummary(
  metric: MetricDef,
  episode: Episode,
  contributors: Attribution[],
): string {
  const window = `${formatDateShort(episode.startDate)} to ${formatDateShort(episode.endDate)}`;
  const base = `${metric.name} ran ${pct(episode.lift)} ${
    episode.direction === "up" ? "above" : "below"
  } its expected range from ${window} (peak ${Math.abs(episode.peakZ).toFixed(1)} sigma).`;
  const where = slicePhrase(contributors);
  return where ? `${base} The deviation is concentrated in ${where}.` : base;
}

export function suggestedActions(
  metric: MetricDef,
  episode: Episode,
  contributors: Attribution[],
): string[] {
  const where = slicePhrase(contributors);
  const actions: string[] = [];

  const isBad =
    (metric.goodDirection === "up" && episode.direction === "down") ||
    (metric.goodDirection === "down" && episode.direction === "up");

  if (metric.id.startsWith("churn") || metric.id === "contraction_mrr") {
    if (where) {
      actions.push(
        `Churn pressure is concentrated in ${where}. Review the onboarding and renewal flows for that segment first.`,
      );
    }
    actions.push(
      "Pull the cancellation reasons logged in this window and look for a shared driver.",
      "Check whether a pricing, packaging, or product change shipped just before the window started.",
    );
  } else if (metric.id === "expansion_mrr" || metric.id === "new_mrr") {
    if (where) {
      actions.push(
        `The surge is concentrated in ${where}. Identify what drove it and whether the motion repeats in other segments.`,
      );
    }
    actions.push(
      "Confirm the spike is organic rather than a one-off contract or billing artifact.",
    );
  } else if (metric.id.startsWith("feature_adoption")) {
    if (where) {
      actions.push(
        `The drop is concentrated in ${where}. Check for breaking changes, deprecations, or permission issues affecting that segment.`,
      );
    }
    actions.push(
      "Compare API error rates and latency over the same window.",
      "Reach out to the top accounts that went quiet during the window.",
    );
  } else if (isBad) {
    actions.push(
      where
        ? `The deviation is concentrated in ${where}. Start the investigation there.`
        : "Drill into the dimensional slices to localize the deviation.",
      "Check recent releases, pricing changes, and incidents against the window start date.",
    );
  } else {
    actions.push(
      "Verify the improvement is real (no instrumentation or billing artifact), then document what drove it.",
    );
  }

  return actions.slice(0, 3);
}
