// Tests for the duplicate decision-id check. Run: npm test
//
// The case that matters is the real 2026-09-19 incident in
// demo-harborbistro (this repo's CI dialect twin): two branches each add a
// "## D-019: ..." heading; the merge is clean (no conflict); nothing else
// in CI reads docs/demos/lumen/decisions.md. This suite proves the function
// itself catches that shape. The CI step (scripts/check-decisions.mjs run
// directly) separately proves the real decisions.md has no duplicates today
// -- there was nothing to collide with until this same change adopted the
// "## D-<n>" id scheme for the file's 10 existing entries (see
// scripts/check-decisions.mjs's header comment).
//
// Ported from demo-harborbistro's vitest version (origin/main b205dec) by
// way of demo-axlepoint (PR #34), which is the canonical version: same
// runner (vitest), same cases, same assertion strings, plus the addendum
// cases below. lumen-analytics has no addendum headings of its own, but
// HEADING_RE supports the convention unconditionally (see
// check-decisions.mjs), so these cases stay to prove that support didn't
// regress in the port.
import { describe, expect, it } from "vitest";

import { checkDecisions } from "./check-decisions.mjs";

describe("check-decisions", () => {
  it("passes when every id is unique", () => {
    const text = ["## D-001: first (2026-01-01)", "", "## D-002: second (2026-01-02)", ""].join("\n");
    expect(checkDecisions(text)).toEqual([]);
  });

  it("fails when a file has zero decision headings (nothing was checked)", () => {
    const problems = checkDecisions("no headings here\njust prose\n");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/no "## D-<n>" decision headings found/);
  });

  it("fails on a duplicate id, naming both lines, reproducing the 2026-09-19 D-019 collision", () => {
    const text = [
      "## D-018: first (2026-09-19)",
      "body",
      "",
      "## D-019: claimed by branch A (2026-09-19)",
      "body",
      "",
      "## D-019: claimed by branch B (2026-09-19)",
      "body",
      "",
    ].join("\n");
    const problems = checkDecisions(text);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/id 99 appears 2 times \(D-019 on line 4, D-019 on line 7\)/);
  });

  it("reports every duplicated id, not just the first", () => {
    const text = ["## D-001: a", "## D-001: b", "## D-002: c", "## D-002: d", "## D-002: e"].join("\n");
    const problems = checkDecisions(text);
    expect(problems).toHaveLength(2);
    expect(problems.some((p) => p.includes("id 1 appears 2 times"))).toBe(true);
    expect(problems.some((p) => p.includes("id 2 appears 3 times"))).toBe(true);
  });

  it("is not fooled by CRLF line endings", () => {
    const text = "## D-001: a\r\n## D-001: b\r\n";
    const problems = checkDecisions(text);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/id 1 appears 2 times \(D-001 on line 1, D-001 on line 2\)/);
  });

  it("ignores headings that are not decision ids", () => {
    const text = ["## Some other heading", "## D-1: numeric id still counts", "### D-1: wrong heading level"].join("\n");
    expect(checkDecisions(text)).toEqual([]);
  });

  it("treats inconsistently padded ids as the same decision (D-019 vs D-19)", () => {
    const text = ["## D-019: padded (2026-09-19)", "## D-19: unpadded, same decision (2026-09-19)"].join("\n");
    const problems = checkDecisions(text);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/id 19 appears 2 times \(D-019 on line 1, D-19 on line 2\)/);
  });

  // Ported from axlepoint's addendum convention tests unconditionally (see
  // the header comments in this file and in check-decisions.mjs): this must
  // NOT be flagged as a collision, even though lumen-analytics does not use
  // the addendum convention itself today.
  it("does not flag an addendum heading as a second claim on the same id", () => {
    const text = [
      "## D-012: Anonymous by design (2026-09-01)",
      "body",
      "",
      "## D-012 addendum (2026-09-19): assigned_to was not actually structured",
      "body",
      "",
      "## D-012 addendum (2026-09-19, round 3): the chmod 444 seed broke every write",
      "body",
      "",
    ].join("\n");
    expect(checkDecisions(text)).toEqual([]);
  });

  // The addendum exemption must be narrow: a heading that merely lacks a
  // colon, or reuses the id with some OTHER trailing word, still counts as
  // a real second claim and must still be flagged. This proves HEADING_RE
  // isn't quietly "skip anything without a colon after the number."
  it("still flags a non-addendum reuse of an id with no colon after the number", () => {
    const text = ["## D-012: Anonymous by design (2026-09-01)", "## D-012 revised (2026-09-19)"].join("\n");
    const problems = checkDecisions(text);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/id 12 appears 2 times \(D-012 on line 1, D-012 on line 2\)/);
  });
});
