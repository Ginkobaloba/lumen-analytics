# Portal Federation (chunk 4b)

Lumen Analytics accepts sign-ins from the Paradigm Portal by verifying the
RS256 JWT that the portal mints during its launch redirect. Verification is
local (path 1 of `PORTAL_GATE_CONTRACT.md`): the JWKS is fetched once, cached
for an hour with a 10-minute stale-while-revalidate window, and applied to
every incoming token.

## Flow

1. User clicks the Lumen tile on the portal dashboard.
2. Portal runs its access resolver and mints a 60-minute JWT with
   `aud=lumenanalytics`.
3. Portal redirects the browser to `<lumen_base_url>/#portal_token=<JWT>`.
   The token rides in the URL fragment so it never reaches any HTTP server
   log on either side.
4. `<PortalTokenClaim />` mounts on the home page, reads
   `window.location.hash`, scrubs it via `history.replaceState`, and POSTs
   the token to `/api/portal/handoff`.
5. The route verifies signature, issuer, audience, expiry, and subject; on
   success it sets the existing `lumen_demo_session` cookie carrying the
   verified subject and returns `{ ok: true, redirect: "/app", ... }`.
6. The client navigates to `/app`. Middleware lets the request through
   because the demo session cookie is now set.

## Existing cookie shortcut

`POST /api/session` still signs the user in as the demo user without going
through the portal. This is intentional for local development and for
demos where the portal subdomain is not reachable. Both code paths
converge on the same `lumen_demo_session` cookie.

## Configuration

See `.env.example`. The three required vars:

- `PORTAL_JWKS_URL`
- `PORTAL_EXPECTED_ISSUER`
- `PORTAL_EXPECTED_AUD` (always `lumenanalytics`)

Missing env vars cause `/api/portal/handoff` to return HTTP 500 with a
`misconfigured` error code, which is intentional: silent 401s would be
much harder to debug.

## Rotation

The portal publishes both the active and the previous public key during
its rotation grace window. `verifyPortalToken` iterates every JWK in the
set, so tokens minted moments before rotation continue to verify until
the previous key drops off the JWKS.

## Failure reasons

`verifyPortalToken` returns a tagged union; the handoff route forwards
the `reason` in the response `detail` field. Reasons in current use:

- `missing_token`
- `jwks_fetch_failed`
- `no_matching_key`
- `bad_signature`
- `bad_issuer`
- `bad_audience`
- `expired`
- `missing_subject`
- `malformed`

## Tests

- `tests/portal-jwks.test.ts` exercises the verifier against an
  in-memory JWKS (generated keypair, JWK exported, fed via the
  `fetchJwks` config override).
- `tests/portal-handoff.test.ts` exercises the route by stubbing
  `global.fetch` to serve the in-memory JWKS, then invoking the route's
  POST handler with a NextRequest.
