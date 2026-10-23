# 2026-10-01 12:05 CDT - move demo hostnames to paradigm.codes
- **Who:** Claude (subagent of the main session), for Drew, who authorized the move on 2026-10-01.
- **Change:** SITE_URL, banner link, README and verify/smoke.yml (deploy_url and both redirects_to) move to lumenanalytics.paradigm.codes.
- **Why:** projectnexuscode.org lapses around 2026-10-31. The demos move to <name>.paradigm.codes additively: both names serve, then the legacy names 301, then they are removed. Sequencing is in cloudflare-config docs/demos/MIGRATE_TO_PARADIGM_CODES_2026-10.md.
- **State after:** Not merged or deployed. Also set APP_BASE_URL=https://lumenanalytics.paradigm.codes at the next redeploy (Slack alert links). vitest and next build pass.
- **Refs:** cloudflare-config docs/demos/MIGRATE_TO_PARADIGM_CODES_2026-10.md (runbook, step 3).
