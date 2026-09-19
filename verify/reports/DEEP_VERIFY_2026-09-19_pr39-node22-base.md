# Deep Verify: PR #39 move to node:22-bookworm-slim base image (2026-09-19)

Overall: PASS
Tested-SHA: a42f73e1d89a07fb245eab48c18583b9c0da7a30

This report covers two runs. The **full deep verify** was run against
`9a5785b08cc963263c0e66597ae94acc5a83244d`. The branch then took a merge from
`main` (PRs #40 and #41 landed and conflicted in `docs/demos/lumen/decisions.md`)
and the head moved to `a42f73e1d89a07fb245eab48c18583b9c0da7a30`. A **delta
re-verify** was run against that new head. Section 0 states exactly which
findings were re-established on `a42f73e` and which are carried forward from
`9a5785b`, and why the carry-forward is sound. Everything from section 1 onward
is the original full run against `9a5785b` and should be read as such.

---

# Section 0: Delta re-verify at a42f73e (merge of main into chore/node22-base)

**Delta verdict: PASS.** Nothing found at `a42f73e` changes the verdict reached
at `9a5785b`.

## 0.1 Why this is a delta and not a full re-run

The Orchestrator approved a delta: a docs-only conflict resolution does not
invalidate a fallback-compile matrix. The delta was scoped on evidence, not on
assertion. The load-bearing fact is this:

```
git diff 9a5785b a42f73e -- Dockerfile     ->  0 bytes of output
Dockerfile blob at 9a5785b:  e2adb41d0c35a9e02609ad0ac7483e1ccb3f58bf
Dockerfile blob at 608e9b4:  e2adb41d0c35a9e02609ad0ac7483e1ccb3f58bf
Dockerfile blob at a42f73e:  e2adb41d0c35a9e02609ad0ac7483e1ccb3f58bf
```

The Dockerfile is byte-identical across the tested commit, the report commit and
the merge head. Since the prebuild-versus-compile behavior, the fallback compile
and the runtime toolchain absence are all properties of the Dockerfile plus the
`package-lock.json` pin (`better-sqlite3@12.10.0`, also unchanged), re-running
that matrix would test the same bytes a second time.

## 0.2 Diff review: what actually changed

The merge changed 25 files relative to the branch tip `608e9b4`. Each was
classified by comparing its blob at `a42f73e` against its blob at `c9b8746`
(the `main` tip that was merged in):

- **23 of 25 are byte-identical to `main`**, that is, inherited verbatim with no
  branch-side edit: `.env.example`, `CLAUDE.md`, `docs/PORTAL_FEDERATION.md`,
  the #41 ledger entry, `package.json`, four API routes
  (`alerts/slack`, `anomalies/[id]/status`, `portal/handoff`, `session`),
  `src/lib/alert-rate-limit.ts`, `src/lib/portal-session.ts`,
  `src/middleware.ts`, seven test files plus `tests/helpers/session-tokens.ts`,
  two `verify/assertions/*.yml`, `verify/tier_map.yml`, and the PR #41
  deep-verify report.
- **2 of 25 are branch-specific**, and they are exactly the two files the
  coordinator named:
  - `docs/demos/lumen/decisions.md`: the conflict resolution. The diff against
    `608e9b4` is **additions only, no deletions**: main's #41 entry is inserted
    above the existing `## 2026-09-19: Node 22 base image` section, which is
    untouched.
  - `docs/ledger/...-node-22-base-image-keep-build-toolchain-as-prebuild-fallback.md`:
    one appended bullet recording this verify's fallback-compile proof so a
    future reader does not delete the toolchain as redundant. Additions only.

Conversely, what the branch still adds on top of `main` is 4 files and only 4:
`Dockerfile`, `docs/demos/lumen/decisions.md`, the node22 ledger entry, and this
report. **No source, test, workflow or lockfile change is branch-specific.**
Confirmed.

## 0.3 What was RE-RUN at a42f73e

A fresh `docker build --no-cache` from the merge head produced `dvlum:dvn39d`,
495 MB, identical in size to the `9a5785b` image.

| Check | Result at a42f73e |
|---|---|
| `node --version` in the runtime container | **v22.23.2** |
| Runtime toolchain | gcc, g++, cc, make, python3, python, node-gyp all **ABSENT** |
| `better_sqlite3.node` in the runtime image | present at `/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node` |
| `/` | 200, 39,310 bytes, 0.017 s; both smoke copy strings present |
| `/app` anonymous | 307 to `/?signin=required` |
| `/app/anomalies` anonymous | 307 to `/?signin=required` |
| GET `/api/session?signout=1` | 405 |
| `/api/team` | 200, contains "Priya" |
| `/api/anomalies/1` | 404, `{"error":"Anomaly not found"}` |
| POST `/api/session` (the NEW signed session from #41) | 303, relative `location: /app`, `Secure; HttpOnly; SameSite=lax`, a 359-character signed JWT with a 1 hour expiry |
| `/app` authed | 200 (107,868 bytes) |
| `/app/anomalies` authed | 200 (107,544 bytes) |
| `/app/metrics` authed | 200 (249,834 bytes) |
| `/api/anomalies/an-expansion_mrr-2026-05-27` | 200, 11,801 bytes |
| `/app/anomalies?focus=<that id>` | 200 |
| Direct better-sqlite3 read in the container | opened `/app/data/lumen.db`, better-sqlite3 12.10.0 on node v22.23.2, 23 anomaly rows and 23 seed-snapshot rows intact |
| Container log | `Ready in 55ms`, 0 error, 0 `misconfigured`, 0 `SqliteError` lines |

The sign-in check matters more at this head than it did at `9a5785b`: PR #41
replaced the literal `demo-user` cookie with a real HS256 JWT minted through
`jose`, verified in the Edge middleware. That is new cryptographic code running
on a new Node major, and it was exercised end to end here. It works. A
throwaway `SESSION_SECRET` was generated for the container and never printed; no
file under `~/.secrets` and no `.env*` other than the committed `.env.example`
was read at any point.

**Tests at a42f73e, run inside the image's own node:22 Linux build stage:**

| Check | Result |
|---|---|
| `npx vitest run` | **21 files, 145 of 145 passed** (was 19 files / 113 at `9a5785b`; the 32 new tests are #41's `middleware-session`, `slack-route`, `alert-rate-limit`, `session-redirect`, `portal-handoff` and the expanded `anomaly-status-route` suites) |
| `npm run typecheck` | exit 0 |
| `npm run mcp:typecheck` | exit 0 |
| `npm run lint` | "No ESLint warnings or errors" |
| `npm run ledger:check` (new in #40) | 3 entries, 0 problems (run on the host; see W6) |
| `next build` | clean, inside the image build |

## 0.4 What is CARRIED FORWARD from 9a5785b, and why that is sound

These were **not** re-run at `a42f73e`. Each is carried forward, with the reason
stated so a reviewer can check the reasoning rather than trust it:

| Carried forward from 9a5785b | Why the carry-forward holds |
|---|---|
| The prebuild-not-compile forensics (section 4.1): `npm ci` in 19.9 s, no gyp artifacts in the deps stage | Depends only on the Dockerfile and the `better-sqlite3@12.10.0` lockfile pin, both byte-identical at `a42f73e`. The delta build's `npm ci` finished in 13.6 s, still far short of a compile, which is consistent but is not offered as the primary evidence |
| The forced-prebuild-failure compile (section 4.2): `npm_config_better_sqlite3_binary_host` pointed at the discard port, `gyp info ok`, module loaded and returned a query result | Same reason. The deps stage is the same bytes. Re-running it would re-measure the same inputs |
| The no-toolchain control (section 4.3): build fails with "Could not find any Python installation to use" | Same reason |
| The node:20 size baseline (section 5): 459 MB vs 495 MB, delta exactly the base-image delta | The `a42f73e` image is 495 MB, identical to the `9a5785b` image, so the measured delta is unchanged |
| The recharts SSR warning control (W4): 38 warnings on node:20 and 38 on node:22 over the same pages | The `a42f73e` container emits the same 38 over the same pages. The node:20 side of the comparison is unchanged code |

**Where the carry-forward would NOT have been sound, and was therefore re-run
instead:** anything that touches application code. Main brought in a new session
implementation, new middleware, a new rate limiter and six new test suites. None
of that is covered by the `9a5785b` evidence, so the whole smoke pass and the
entire test suite were re-run at `a42f73e` rather than carried.

## 0.5 Delta Theater Check

| Claimed about the merge | Verification found | Verdict |
|---|---|---|
| The only non-merge-inherited changes are two doc files | 23 of 25 changed files are byte-identical to `main`; the 2 exceptions are `decisions.md` and the node22 ledger entry | CONFIRMED |
| The Dockerfile is untouched | Blob `e2adb41d...` at `9a5785b`, `608e9b4` and `a42f73e`; `git diff` prints nothing | CONFIRMED |
| The conflict kept main's #41 entry first and this branch's node22 entry | Additions only, no deletions; the node22 section is unmodified | CONFIRMED |
| `9a5785b` and `608e9b4` are still in history (merged, not rebased) | Both are ancestors of `a42f73e` on the first-parent side; `git log --graph` shows the merge | CONFIRMED |
| The appended ledger bullet records this verify's fallback proof accurately | Accurate on the mechanism (discard-port binary host), on the with-toolchain result and on the control's exact error string. One phrase overstates slightly, see W7 | CONFIRMED with one wording nit |

## 0.6 Delta blockers

None.

## 0.7 Delta warnings (added to the warnings in section 10)

### W6. `npm run ledger:check` is vacuous inside the container
Run in the image's build stage it reports "0 entries, 0 problems", because
`.dockerignore` excludes `docs/`, so the ledger directory is not in the build
context at all. Run on the host it correctly reports 3 entries, 0 problems. The
script is from PR #40, not this PR, but anyone who wires `ledger:check` into a
container-based CI step will get a permanently green check that inspects
nothing. **Fix:** run it outside the image, or stop excluding `docs/`.
**Tier:** Sonnet executor, and it belongs to #40's owner, not this PR.

### W7. One phrase in the appended ledger bullet overstates the evidence
The bullet says that with the toolchain present "node-gyp compiled the module
and **the app ran**". What was actually proven is narrower and still sufficient:
node-gyp compiled better-sqlite3 to `gyp info ok`, and the compiled module was
loaded and executed a query (`FALLBACK_OK ... result 42`). A full application
build and serve was **not** performed from the forced-fallback image. The
conclusion the bullet draws (do not delete the toolchain) is correct either way.
**Fix:** reword to "node-gyp compiled the module and it loaded and ran a
query". **Tier:** Sonnet executor. Not a merge blocker.

### W8. Deploy consequence inherited from #41, worth repeating here
`SESSION_SECRET` (32+ characters) is now **required** in the deploy environment
or sign-in fails closed with 500 `misconfigured` and `/app` stays locked. That
is #41's change, not this PR's, and #41 has its own deep-verify report in
`verify/reports/`. It is restated here only because merging this PR is what
carries that requirement onto this branch, and the delta container needed a
generated secret to serve `/app` at all.

---

# Section 1 onward: the full deep verify at 9a5785b

Everything below was run against
`9a5785b08cc963263c0e66597ae94acc5a83244d`, before the merge. Read section 0 for
what was re-established at the current head.

Independent deep verify of `Ginkobaloba/lumen-analytics` PR #39 (branch
`chore/node22-base`, label `tier-3`). The verifier did not write the PR and
attacked every claim in it rather than reading the diff for plausibility.

**Result: PASS.** Every claim in the PR body, the decisions entry and the ledger
entry was reproduced against images built from this commit. The headline claim
nobody had tested, that the retained python3/make/g++ toolchain is a working
fallback for a failed better-sqlite3 prebuild, was proven directly with a forced
prebuild failure, and proven load-bearing with a matched control that fails
without it.

Totals:
- **1 production image** built from the PR head with the BuildKit npmrc secret
  (`dvlum:dvn22`, manifest list `sha256:0dfdaf7e43f2eb27...`, 495 MB), plus a
  **node:20 baseline of the same commit** (`dvlum:n20base`, 459 MB) built purely
  as a control.
- **Prebuild, not compile:** `npm ci` in the deps stage finished in 19.9 s with
  zero `gyp` output, and the deps-stage image contains no node-gyp artifacts.
- **Fallback proven:** with the prebuild host forced to fail, node-gyp compiled
  better-sqlite3 to completion (`gyp info ok`) and the module loaded and ran a
  query. The matched no-toolchain control failed the build outright.
- **Runtime image clean:** gcc, g++, cc, make, python3, python and node-gyp are
  all absent from the runtime image. Size delta against the node:20 baseline of
  the same commit is +36 MB, exactly the base-image delta (329 MB vs 293 MB).
- **App works on node 22:** `/` 200, both gated routes 307 to the sign-in page,
  `/api/team` 200, `/api/anomalies/1` 404 with the expected body, 3
  authenticated pages 200, and the tier-3 anomaly detail API returns an 11,801
  byte payload read out of SQLite.
- **Regression:** 19 test files, 113 of 113 pass on Linux under node 22;
  `tsc --noEmit` exit 0; `tsc -p mcp/tsconfig.json --noEmit` exit 0; `next lint`
  reports no warnings or errors; `next build` clean.
- **Diff:** 3 files, exactly the Dockerfile, decisions.md and the ledger entry.

Layer 5 (headed Chrome) was **not run**, by dispatch rule. It is listed as a gap,
not a pass.

## 1. Target and scope

- **Target:** PR #39, head `9a5785b08cc963263c0e66597ae94acc5a83244d`, two
  commits on top of `b9220c1`. Worktree `C:\dev\_worktrees\lumen-node22`,
  branch `chore/node22-base`, `git status --porcelain` empty.
- **Mode:** deep. Layers 1, 2, 3 (local origin only), 4 (curl and raw page
  source) and 6 (edge and control matrix) ran. Layer 5 did not.
- **Repo assertions:** `verify/smoke.yml` and `verify/tier_map.yml` are present,
  so the tier-3 gate has something to gate against. Every smoke surface was
  exercised locally (HSTS is added at the edge and is N/A against a local
  container). Three of the four tier-3 surfaces in `tier_map.yml`
  (anomaly-log, anomaly-detail-panel, demo-auth) were exercised directly; the
  fourth (anomaly-detection-backend) was covered by the 113 unit tests, which
  include `detector.test.ts`, `anomaly-seed-guard.test.ts` and
  `anomaly-detail.test.ts`.
- **Base image resolved:**
  `node:22-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9`.
- **Credential handling:** the npmrc was passed to BuildKit by path only
  (`--secret id=npmrc,src=<path>`). It was never opened, read, printed or
  hashed. No 401 occurred at any point.
- **Containers:** `dvn39-app` on 127.0.0.1:18962 and `dvn39-n20` (the control)
  on 127.0.0.1:18964, plus throwaway build-stage and deps-stage runs. Nothing
  touched the live `demo-lumenanalytics` container, demo-proxy, the public URL
  or cloudflare-config. All containers and images created for this run were
  removed at the end.

## 2. Results by category

| Category | Result | Evidence |
|---|---|---|
| smoke | PASS | `/` 200, 39,310 bytes, both smoke copy strings present |
| navigation | PASS | `/app` 200 (107,868 bytes), `/app/anomalies` 200 (107,544), `/app/metrics` 200 (249,834) |
| auth_lifecycle | PASS | `/app` and `/app/anomalies` anonymous 307 to `/?signin=required`; GET `/api/session?signout=1` 405; the POST sign-in route sets `lumen_demo_session` with a relative Location |
| data_crud | PASS | `GET /api/anomalies/an-expansion_mrr-2026-05-27` 200, 11,801 bytes, full metric plus series payload; `POST .../status` 401 anonymous, 200 authed with the honest deprecation body |
| error_handling | PASS | `/api/anomalies/1` 404 `{"error":"Anomaly not found"}`; `/api/anomalies/<id>/status` 401 `{"error":"Session required"}` without a cookie; GET on a POST-only route 405 |
| performance | PASS (local) | `/` served in 0.084 s |
| security_headers | N/A locally | HSTS is added at the edge; not assertable against a local container |
| visual_regression | SKIP | No baseline |
| accessibility | SKIP | axe not in the harness |
| mobile_responsive | SKIP | No browser layer this run |
| cross_browser | SKIP | No browser layer this run |
| edge_cases | PASS | Forced-prebuild-failure matrix, no-toolchain control and node:20 baseline, sections 4, 5 and 10 |

### Layer 1: code

Run inside the image's own `build` stage (node 22, Linux, the exact condition
under test), not on the Windows host:

- `npx vitest run`: **19 files, 113 of 113 passed** in 2.26 s, including
  `detector.test.ts` (11), `generator.test.ts` (18), `anomaly-seed-guard.test.ts`
  (2), `anomaly-detail.test.ts` (2) and `anomaly-status-route.test.ts` (4).
- `npm run typecheck` (`tsc --noEmit`): exit 0.
- `npm run mcp:typecheck` (`tsc -p mcp/tsconfig.json --noEmit`): exit 0. Worth
  noting because the repo's own CI comment says the mcp/ server is typechecked
  locally and not in CI; it was typechecked here, on node 22.
- `npm run lint` (`next lint`): "No ESLint warnings or errors".
- `next build`: succeeded inside the image build.
- CI on the head: Quick Verify **pass**, Socket Security Project Report **pass**,
  Socket Security Pull Request Alerts **pass**, Deep Verify **fail** because
  `verify/reports/` carried no report for pr39. That is correct gate behavior;
  this report is the thing it was waiting for.

### Layer 2: runtime

`dvn39-app` started clean. The only non-startup lines in the container log are
recharts SSR warnings, which the node:20 control reproduces exactly (see W4).
Zero `SqliteError`, zero unhandled rejections, zero restart loops.

`node --version` inside the running container: **v22.23.2**.

## 3. Claim 1: node:22 in every stage, toolchain kept in deps only

`grep FROM Dockerfile` on the PR head returns exactly three lines, all
`node:22-bookworm-slim` (`deps`, `build`, `run`). No `node:20` string remains in
the Dockerfile. A repo-wide scan found `node:20` only in prose: decisions.md and
the ledger entry (both describing the change), one 2026-06-10 handoff doc, and
two earlier deep-verify reports that describe past runs. All historical, none
load-bearing.

The `apt-get install python3 make g++` line is in the `deps` stage only. The
`run` stage is a fresh `node:22-bookworm-slim` that copies only
`.next/standalone`, `.next/static` and `data` from `build`.

## 4. Claim 2: the prebuild is used normally, and the toolchain is a real fallback

This is the claim the PR rests on and the one nobody had tested. Four builds were
run to settle it.

### 4.1 Normal build uses the prebuild, not a compile

`docker build --no-cache --progress=plain`:

```
#9 [deps 5/5] RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci
#9 2.591 npm warn deprecated prebuild-install@7.1.3: ...
#9 DONE 19.9s
```

19.9 s for the whole `npm ci`, and **zero** `gyp` lines in the log. A source
compile of better-sqlite3 takes roughly 50 s on this machine (measured in 4.2).

npm hides install-script output on success, so the log alone is weak evidence.
The forensic check is stronger. `docker build --target deps` then inspecting the
image:

```
better-sqlite3 version: 12.10.0
PRESENT gcc / PRESENT g++ / PRESENT make / PRESENT python3
/app/node_modules/better-sqlite3/build:
Release
/app/node_modules/better-sqlite3/build/Release:
better_sqlite3.node
gyp artifact absent: Makefile
gyp artifact absent: config.gypi
gyp artifact absent: binding.Makefile
gyp artifact absent: Release/obj.target
gyp artifact absent: deps
sqlite ok 3.53.1
```

`prebuild-install` extracts only `build/Release/better_sqlite3.node`. node-gyp
leaves `Makefile`, `config.gypi`, `binding.Makefile`, `Release/obj.target/` and
`Release/obj/`. None of those exist. **The prebuild was used. CONFIRMED.**

### 4.2 The fallback compiles, with the prebuild download forced to fail

A scratch Dockerfile (held in the session scratchpad, **not committed**, and the
worktree stayed clean) reproduces the deps stage verbatim and points
prebuild-install at the discard port so the download fails the way a flaky or
unavailable prebuild host would:

```
ENV npm_config_better_sqlite3_binary_host=http://127.0.0.1:9/better-sqlite3
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci --foreground-scripts
```

Result:

```
#9 17.43 > prebuild-install || node-gyp rebuild --release
#9 17.50 prebuild-install warn install connect ECONNREFUSED 127.0.0.1:9
#9 17.58 gyp info find Python using Python version 3.11.2 found at "/usr/bin/python3"
#9 67.42   CXX(target) Release/obj.target/better_sqlite3/src/better_sqlite3.o
#9 69.67   SOLINK_MODULE(target) Release/obj.target/better_sqlite3.node
#9 69.72   COPY Release/better_sqlite3.node
#9 69.77 gyp info ok
#10 0.623 FALLBACK_OK better-sqlite3 works, node v22.23.2 result 42
```

The compiled module loads and executes a query. The build directory afterwards
contains the full gyp artifact set (`Makefile`, `config.gypi`,
`Release/obj.target/better_sqlite3/src/better_sqlite3.o`, the bundled sqlite3
sources), which is the exact opposite fingerprint of 4.1. **CONFIRMED.**

### 4.3 Control: without the toolchain, the same failure is fatal

The identical scratch Dockerfile with the `apt-get install python3 make g++` line
deleted:

```
prebuild-install warn install connect ECONNREFUSED 127.0.0.1:9
gyp ERR! find Python Python is not set from command line or npm configuration
gyp ERR! stack Error: Could not find any Python installation to use
ERROR: failed to build: process "/bin/sh -c npm ci --foreground-scripts" did not
complete successfully: exit code: 1
```

The toolchain is load-bearing, not decorative. The PR's stated reason for keeping
it is correct. **CONFIRMED.**

## 5. Claim 3: the toolchain never reaches the runtime image

Run against the built runtime image:

```
node: v22.23.2
ABSENT  gcc
ABSENT  g++
ABSENT  cc
ABSENT  make
ABSENT  python3
ABSENT  python
ABSENT  node-gyp
```

`dpkg -l | grep -E ' (gcc|g\+\+|make|python3) '` returns nothing. The compiled
native module is present and is the only better-sqlite3 build artifact:

```
/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

**Size baseline.** A node:20 image of **this exact commit** was built as a
control (the Dockerfile with `node:22-bookworm-slim` substituted back to
`node:20-bookworm-slim`, nothing else changed):

| Image | Node | Size |
|---|---|---|
| `dvlum:n20base` (this commit, node:20 base) | v20.20.2 | 459 MB |
| `dvlum:dvn22` (this PR) | v22.23.2 | 495 MB |
| `node:20-bookworm-slim` base | | 293 MB |
| `node:22-bookworm-slim` base | | 329 MB |

The runtime image grew by 36 MB; the base image delta is 36 MB. The entire
increase is the base image, and nothing came from the toolchain, because the
toolchain is not there. **CONFIRMED.**

For contrast, the deps stage that does carry the toolchain plus dev dependencies
is 2.21 GB. That cost stays entirely in the builder.

## 6. Claim 4: the app builds and serves on node 22

| Check | Result |
|---|---|
| `/` | 200, 39,310 bytes, 0.084 s |
| smoke copy "See changes in your business" | present |
| smoke copy "Open the live demo" | present |
| `/app` anonymous | 307 to `/?signin=required` |
| `/app/anomalies` anonymous | 307 to `/?signin=required` |
| GET `/api/session?signout=1` | 405 |
| `/api/team` | 200, contains "Priya" |
| `/api/anomalies/1` (unknown id) | 404, `{"error":"Anomaly not found"}` |
| `/app` authed | 200 (107,868 bytes) |
| `/app/anomalies` authed | 200 (107,544 bytes) |
| `/app/metrics` authed | 200 (249,834 bytes) |
| `/app/anomalies?focus=an-expansion_mrr-2026-05-27` | 200 |
| `GET /api/anomalies/an-expansion_mrr-2026-05-27` | 200, 11,801 bytes, full metric, expected vs actual, sigma 6.43 |
| `POST /api/anomalies/<id>/status` anonymous | 401 `{"error":"Session required"}` |
| `POST /api/anomalies/<id>/status` authed | 200, `{"ok":true,"deprecated":true,...}` |

Every assertion in `verify/smoke.yml` that is meaningful against a local
container passed. The HSTS assertions are edge-only and were not asserted.

**better-sqlite3 at runtime.** A direct read through the container's own
better-sqlite3 (`node -e`, since the slim image has no sqlite3 CLI):

```
opened /app/data/lumen.db via better-sqlite3 12.10.0 node v22.23.2
tables: users,customers,events,sqlite_sequence,metrics_daily,anomalies,
        anomalies_seed_snapshot,customer_mrr_monthly,customer_usage_daily
anomalies rows= 23
anomalies_seed_snapshot rows= 23
```

The seeded 23-anomaly dataset is intact and readable on node 22, which is what
the tier-3 anomaly surfaces depend on.

## 7. Claim 5: diff is only the Dockerfile, decisions.md and the ledger

`git diff <merge-base> HEAD --stat`:

```
 Dockerfile                                              | 18 ++++++++++++++----
 docs/demos/lumen/decisions.md                           | 17 +++++++++++++++++
 docs/ledger/...-node-22-base-image-keep-build-toolchain-as-prebuild-fallback.md |  6 ++++++
 3 files changed, 37 insertions(+), 4 deletions(-)
```

Exactly as claimed. No source, test, workflow or lockfile change. **CONFIRMED.**

The decisions.md entry accurately describes the change and the reason. The ledger
entry is accurate except for one imprecise phrase, see W3.

## 8. Theater Check

| Builder claimed | Verification found | Verdict |
|---|---|---|
| All three Dockerfile stages move to node:22-bookworm-slim | 3 of 3 `FROM` lines are node:22; no node:20 left in the Dockerfile; container reports v22.23.2 | CONFIRMED |
| better-sqlite3@12.10.0 normally installs from a prebuild for node 22 linux-x64, not a compile | `npm ci` 19.9 s, zero gyp output, and the deps image has only `build/Release/better_sqlite3.node` with no gyp artifacts | CONFIRMED |
| The kept python3/make/g++ is a working fallback if the prebuild fails or is unavailable | Forced prebuild failure: prebuild-install ECONNREFUSED, node-gyp compiled to `gyp info ok`, module loaded and returned a query result | CONFIRMED (tested here for the first time) |
| Removing the toolchain leaves nothing to fall back to | Matched control build without the toolchain fails: `Could not find any Python installation to use`, exit 1 | CONFIRMED |
| The toolchain never reaches the runtime image | gcc, g++, cc, make, python3, python, node-gyp all absent; size delta versus a node:20 build of the same commit is exactly the base-image delta | CONFIRMED |
| The app builds and serves on node 22 | Image built clean; `/` 200; all gated redirects correct; 3 authenticated pages 200; the tier-3 anomaly detail API returns a full payload from SQLite | CONFIRMED |
| Tests, typechecks, lint and build are clean | 113 of 113 on Linux node 22, tsc 0, mcp tsc 0, next lint clean, build clean | CONFIRMED |
| "a docker build with it removed hit a prebuild-install network timeout once (2026-09-19) ... an immediate retry with no other changes built cleanly" | Not reproducible after the fact. A one-off historical event with no artifact. The conclusion it supports is independently true (4.3), so the decision stands on its own evidence | TAKEN AS REPORTED, not confirmed |
| Ledger: the run stage takes "no node_modules" from the build stage | Imprecise. `.next/standalone` contains a traced `node_modules`, including better-sqlite3's compiled `.node`. The claim that matters, that the toolchain does not ship, is true | PARTIAL (see W3) |

## 9. Blockers

None.

## 10. Warnings (non-blocking)

### W1. `@types/node` is still `^20` while the runtime is node 22
`package.json` devDependencies pin `"@types/node": "^20"` and there is no
`engines` field anywhere. Both typechecks are clean, so nothing is broken today,
but the type surface being checked is node 20's while the container runs node
22. **Fix:** bump to `^22` and consider adding `"engines": { "node": ">=22" }`.
**Tier:** Sonnet executor.

### W2. `eslint ^8` and `eslint-config-next 15.5.25` with a deprecated `next lint`
`next lint` prints "`next lint` is deprecated and will be removed in Next.js 16".
Unrelated to node 22, but the lint step in this repo is on borrowed time, and the
sibling demo-axlepoint has already moved to a flat `eslint .` config. **Fix:**
migrate to the ESLint CLI. **Tier:** Sonnet executor.

### W3. Ledger wording: "no node_modules" in the runtime image
The ledger says the run stage takes ".next/standalone, .next/static, and data
from the build stage, no node_modules". `.next/standalone` ships its own traced
`node_modules` (that is where the verified
`/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node` comes
from). The intended claim, that the compiler toolchain does not ship, is true and
was verified. **Fix:** reword to "no build toolchain". **Tier:** Sonnet executor.

### W4. Pre-existing: recharts SSR warnings in the container log
The runtime log carries repeated `The width(-1) and height(-1) of chart should be
greater than 0` lines. **Controlled precisely:** the node:20 image of this same
commit, driven over the same three pages, emitted the identical count (38 on
node:20, 38 on node:22). Node 22 did not introduce it. Cosmetic log noise only.
**Tier:** Sonnet executor, not tier-3, and not this PR.

### W5. CI cannot catch a node-version regression here
`.github/workflows/verify.yml` runs only the offline gate test and the quick
smoke against `verify/smoke.yml`. It never runs `npm ci`, the unit tests or
`docker build`, and the workflow's own comment records that `npm ci` 401s in
Actions on the private `@paradigm-codes/*` scope. A green CI on this PR says
nothing about node 22. The only evidence that this change works is a local run
like this one. **Fix:** consider a `docker build` job once a cross-org
`read:packages` token exists. **Tier:** Sonnet executor, with a workflow change
Drew should see.

## 11. Coverage gaps (stated so the verdict is not overclaimed)

- **Layer 5 (headed Chrome) was not run**, by dispatch rule. No real-mouse pass
  over the anomaly drill-down.
- No headless browser layer either this round: the UI was exercised through curl
  and raw page source, not Playwright. The drill-down panel's client-side
  rendering and the per-visitor localStorage triage were therefore not
  re-checked in a browser. The server render, the API surface and the database
  path were.
- No axe, no visual regression, no cross-browser.
- Latency was measured on local Docker Desktop, not the deployed host.
- The "prebuild-install network timeout" anecdote in the decisions entry and the
  Dockerfile comment is historical and could not be reproduced. It is recorded as
  taken on report; the decision it supports was proven independently.
- `anomaly-detection-backend` (a tier-3 surface) was covered through the unit
  suite and through the seeded 23-row dataset being intact and served, not
  through a fresh `npm run seed:full` comparison against a prior dataset. The
  build stage did run `seed:full` successfully on node 22.

## 12. Run artifacts

Scratch evidence (local, not committed), under
`...\scratchpad\verify-runs\`:
- `B-build.log`, `B-deps.log`, `B-buildstage.log`, `B-tests.log`;
- `B-fallback-withtc.log`, `B-fallback-notc.log`, `B-node20-baseline.log`;
- `Dockerfile.fallback-withtc`, `Dockerfile.fallback-notc`,
  `Dockerfile.lumen-node20-baseline` (scratch only, never committed, and
  `git status` in the worktree stayed clean apart from this report).

Cleanup: `dvn39-app`, `dvn39-n20` and every `dvlum:*` image created for this run
were removed at the end. The live `demo-lumenanalytics` container was never
touched.
