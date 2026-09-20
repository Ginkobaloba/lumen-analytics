#!/usr/bin/env node
// Duplicate decision-id guard for docs/demos/lumen/decisions.md.
//
// Two branches each adding "## D-019: ..." merge cleanly with NO conflict
// (they touch different lines, both appended near the end), and GitHub sees
// no reason to complain. That happened for real in demo-harborbistro on
// 2026-09-19 (two PRs both claimed D-019), and demo-axlepoint independently
// found the same shape already latent in its own file (D-006..D-010 each
// claimed twice). Nothing in either repo's CI would have caught it -- the
// ledger check validates docs/ledger/, not the decisions log, and there was
// no code path that reads a decision id and would fail on a collision.
//
// This repo (lumen-analytics) is a different starting point from both:
// docs/demos/lumen/decisions.md never used a "## D-<n>" id scheme at all --
// every entry was headed "## YYYY-MM-DD: <title>" with no id, and nothing
// else in the repo (code comments, docs, ledger entries) ever cited a
// decision by a "D-<n>" number, only by date and topic (confirmed by a
// repo-wide grep before this change). So there was no pre-existing
// collision to fix here, unlike axlepoint. This same change that adds this
// checker also adopts the id scheme for the first time, numbering the file's
// 10 existing entries D-001..D-010 in the order they already appear (the
// file's own header says "newest last", so file order is chronological
// order) and keeping each entry's original date as a "(YYYY-MM-DD)" suffix
// on its heading. See docs/demos/lumen/decisions.md's own entry recording
// this change for the "why adopt now" reasoning.
//
// This script is the check: every `## D-<digits>` heading in
// docs/demos/lumen/decisions.md must have a unique id. Run:
//   node scripts/check-decisions.mjs [path-to-decisions.md]
//
// Ported from demo-harborbistro (origin/main b205dec) by way of
// demo-axlepoint (PR #34), which is the canonical version: axlepoint
// refactored the id-count logic to share HEADING_RE via one parseHeadingIds
// helper instead of a second, separately-maintained regex literal (harbor's
// original computed idCount with its own inline
// /^## D-\d+\b/gm, which could silently diverge from HEADING_RE if either
// one changed without the other). This file keeps that refactor and the
// path-shaped difference (DEFAULT_PATH below) is the only change from
// axlepoint's version.
//
// Also run by npm test (see check-decisions.test.mjs), which covers the
// function in isolation. The CI step runs this file directly against the
// real docs/demos/lumen/decisions.md, because a check that only exercises a
// synthetic fixture is not proof the real file passes.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_PATH = join(ROOT, "docs", "demos", "lumen", "decisions.md");

// Matches "## D-<digits>" UNLESS immediately followed by whitespace then the
// word "addendum" (axlepoint's documented "revisit the same decision"
// convention, not a new claim on the id). lumen-analytics has no addendum
// headings today, but this stays byte-identical to the canonical version so
// the four repos share one dialect and a future addendum here is already
// handled correctly rather than silently miscounted. The `\b` keeps normal
// headings like "## D-001: ..." matching exactly as before; the lookahead is
// the only thing narrower than a plain `\b`.
const HEADING_RE = /^## D-(\d+)\b(?!\s+addendum\b)/;

/**
 * Finds every counted `## D-<digits>` heading (see HEADING_RE) in `text`
 * and returns a Map from numeric id to every {raw, line} occurrence. Keyed
 * by the NUMERIC value, not the matched digit string: "D-019" and "D-19"
 * name the same decision with inconsistent padding, and that is exactly the
 * kind of collision this check exists to catch, not a reason to treat them
 * as two different ids. Shared by checkDecisions and runCheck's id count so
 * the two can never drift out of sync on what counts as a heading.
 */
function parseHeadingIds(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  /** @type {Map<number, {raw: string, line: number}[]>} */
  const seen = new Map();
  lines.forEach((line, i) => {
    const m = HEADING_RE.exec(line);
    if (!m) return;
    const id = Number(m[1]);
    const at = seen.get(id) ?? [];
    at.push({ raw: m[1], line: i + 1 });
    seen.set(id, at);
  });
  return seen;
}

/**
 * Returns problems: one entry per id that appears more than once (naming
 * every line it appears on), plus a single problem if zero ids were found
 * at all -- an empty or missing file must fail loudly, not report
 * "0 problems" while checking nothing.
 */
export function checkDecisions(text, label = "decisions.md") {
  const seen = parseHeadingIds(text);

  const problems = [];
  if (seen.size === 0) {
    problems.push(`${label}: no "## D-<n>" decision headings found; nothing was checked`);
    return problems;
  }
  for (const [id, occurrences] of seen) {
    if (occurrences.length > 1) {
      const spots = occurrences.map((o) => `D-${o.raw} on line ${o.line}`).join(", ");
      problems.push(`${label}: id ${id} appears ${occurrences.length} times (${spots})`);
    }
  }
  return problems;
}

export function runCheck(path = DEFAULT_PATH, log = console.log, err = console.error) {
  const label = relative(ROOT, path) || path;
  if (!existsSync(path)) {
    err(`decisions: ${label} does not exist; nothing was checked`);
    return 1;
  }
  const text = readFileSync(path, "utf8");
  const problems = checkDecisions(text, label);
  for (const p of problems) err(`decisions: ${p}`);
  const idCount = parseHeadingIds(text).size;
  log(`decisions: ${idCount} unique id(s), ${problems.length} problem(s).`);
  return problems.length ? 1 : 0;
}

function main([path]) {
  return runCheck(path ? join(process.cwd(), path) : DEFAULT_PATH);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
