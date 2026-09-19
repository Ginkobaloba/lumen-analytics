"use client";

import { useEffect, useState } from "react";
import { applyOverlayToList, subscribeToOverlayChanges } from "@/lib/triage-overlay";

/**
 * Merge this browser's local triage overlay over server-rendered anomaly
 * rows (M1 fix). Renders the seed data on first paint (matching SSR
 * exactly, so there is no hydration mismatch), then swaps in the merged
 * view right after mount and keeps it live if this browser triages an
 * anomaly anywhere else on the page or in another tab.
 */
export function useTriageOverlayList<
  T extends { id: string; status: string; assigned_to: string | null },
>(anomalies: T[]): T[] {
  const [effective, setEffective] = useState(anomalies);

  useEffect(() => {
    setEffective(applyOverlayToList(anomalies));
    return subscribeToOverlayChanges(() => setEffective(applyOverlayToList(anomalies)));
  }, [anomalies]);

  return effective;
}
