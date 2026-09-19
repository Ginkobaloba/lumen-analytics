/**
 * Rate limiter for POST /api/alerts/slack (finding W8).
 *
 * Two sliding windows, both enforced:
 *   - global: GLOBAL_LIMIT calls per WINDOW_MS across every caller (the
 *     ceiling that has always existed; it bounds webhook traffic no matter
 *     how many clients show up);
 *   - per client: PER_CLIENT_LIMIT calls per WINDOW_MS per client, keyed on
 *     the CF-Connecting-IP header, so one anonymous client can no longer
 *     burn the whole global window by itself.
 *
 * Client identity is CF-Connecting-IP ONLY. Cloudflare sets it on every
 * request that comes through the tunnel and overwrites any client-supplied
 * value, so it cannot be spoofed on that path. X-Forwarded-For and X-Real-IP
 * are client-controlled and are never read. When CF-Connecting-IP is absent
 * or implausible (a local or direct call that bypassed the tunnel), the
 * request is subject to the global limit only.
 *
 * A call is recorded in BOTH windows only when BOTH admit it: a call
 * rejected by the per-client window never consumes global budget, and a call
 * rejected globally never consumes the client's budget.
 *
 * The per-client map is bounded and pruned. Because entries are recorded
 * only for admitted calls, and the global window admits at most GLOBAL_LIMIT
 * calls per window, at most GLOBAL_LIMIT keys hold live timestamps at any
 * moment. Every call prunes expired entries, and MAX_TRACKED_CLIENTS is a
 * hard cap (oldest-first eviction) as defense in depth should the limits
 * ever be raised.
 */

export const GLOBAL_LIMIT = 5;
export const PER_CLIENT_LIMIT = 2;
export const WINDOW_MS = 60 * 1000;
export const MAX_TRACKED_CLIENTS = 1000;

/** Longest textual IPv6 address (with embedded IPv4) is 45 characters. */
const MAX_IP_LENGTH = 45;
const PLAUSIBLE_IP = /^[0-9A-Fa-f:.]+$/;

export type RateLimitDecision =
  | { limited: false }
  | { limited: true; scope: "global" | "client" };

/** Minimal header reader, satisfied by Headers / NextRequest.headers. */
interface HeaderReader {
  get(name: string): string | null;
}

/**
 * The client key for per-client limiting, or null when the request carries
 * no usable CF-Connecting-IP. Deliberately ignores X-Forwarded-For.
 */
export function clientKeyFromHeaders(headers: HeaderReader): string | null {
  const raw = headers.get("cf-connecting-ip");
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > MAX_IP_LENGTH) return null;
  if (!PLAUSIBLE_IP.test(value)) return null;
  return value;
}

export class AlertRateLimiter {
  private readonly global: number[] = [];
  private readonly clients = new Map<string, number[]>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly limits = {
      global: GLOBAL_LIMIT,
      perClient: PER_CLIENT_LIMIT,
      windowMs: WINDOW_MS,
      maxClients: MAX_TRACKED_CLIENTS,
    },
  ) {}

  /** Check both windows and record the call only if both admit it. */
  check(clientKey: string | null): RateLimitDecision {
    const now = this.now();
    this.prune(now);

    if (clientKey !== null) {
      const history = this.clients.get(clientKey);
      if (history && history.length >= this.limits.perClient) {
        return { limited: true, scope: "client" };
      }
    }
    if (this.global.length >= this.limits.global) {
      return { limited: true, scope: "global" };
    }

    this.global.push(now);
    if (clientKey !== null) {
      const history = this.clients.get(clientKey);
      if (history) {
        history.push(now);
      } else {
        this.enforceClientCap();
        this.clients.set(clientKey, [now]);
      }
    }
    return { limited: false };
  }

  /** Number of client keys currently tracked (for tests and diagnostics). */
  trackedClients(): number {
    return this.clients.size;
  }

  private prune(now: number): void {
    const cutoff = now - this.limits.windowMs;
    while (this.global.length > 0 && this.global[0] <= cutoff) {
      this.global.shift();
    }
    for (const [key, history] of this.clients) {
      while (history.length > 0 && history[0] <= cutoff) {
        history.shift();
      }
      if (history.length === 0) this.clients.delete(key);
    }
  }

  private enforceClientCap(): void {
    while (this.clients.size >= this.limits.maxClients) {
      const oldest = this.clients.keys().next();
      if (oldest.done) return;
      this.clients.delete(oldest.value);
    }
  }
}
