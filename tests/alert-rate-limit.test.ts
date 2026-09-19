import { describe, expect, it } from "vitest";
import {
  AlertRateLimiter,
  GLOBAL_LIMIT,
  PER_CLIENT_LIMIT,
  WINDOW_MS,
  clientKeyFromHeaders,
} from "@/lib/alert-rate-limit";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("AlertRateLimiter (W8)", () => {
  it("ships the documented limits: 5 global, 2 per client, per 60s", () => {
    expect(GLOBAL_LIMIT).toBe(5);
    expect(PER_CLIENT_LIMIT).toBe(2);
    expect(WINDOW_MS).toBe(60_000);
  });

  it("limits a client at its 3rd call and names the scope", () => {
    const limiter = new AlertRateLimiter(clock().now);
    expect(limiter.check("a").limited).toBe(false);
    expect(limiter.check("a").limited).toBe(false);
    expect(limiter.check("a")).toEqual({ limited: true, scope: "client" });
  });

  it("a client-limited call does not consume global budget", () => {
    const limiter = new AlertRateLimiter(clock().now);
    limiter.check("a");
    limiter.check("a");
    for (let i = 0; i < 10; i++) limiter.check("a"); // all client-limited
    // 3 more distinct clients fit in the remaining global budget of 3.
    expect(limiter.check("b").limited).toBe(false);
    expect(limiter.check("c").limited).toBe(false);
    expect(limiter.check("d").limited).toBe(false);
    expect(limiter.check("e")).toEqual({ limited: true, scope: "global" });
  });

  it("a globally limited call does not consume the client's budget", () => {
    const c = clock();
    const limiter = new AlertRateLimiter(c.now);
    for (const k of ["a", "b", "c", "d", "e"]) limiter.check(k);
    expect(limiter.check("z")).toEqual({ limited: true, scope: "global" });
    c.advance(WINDOW_MS);
    // z's two calls are both still available after the window rolls.
    expect(limiter.check("z").limited).toBe(false);
    expect(limiter.check("z").limited).toBe(false);
  });

  it("windows slide: calls older than 60s stop counting", () => {
    const c = clock();
    const limiter = new AlertRateLimiter(c.now);
    limiter.check("a");
    limiter.check("a");
    expect(limiter.check("a").limited).toBe(true);
    c.advance(WINDOW_MS - 1);
    expect(limiter.check("a").limited).toBe(true);
    c.advance(1);
    expect(limiter.check("a").limited).toBe(false);
  });

  it("null client key is global-only", () => {
    const limiter = new AlertRateLimiter(clock().now);
    for (let i = 0; i < 5; i++) expect(limiter.check(null).limited).toBe(false);
    expect(limiter.check(null)).toEqual({ limited: true, scope: "global" });
    expect(limiter.trackedClients()).toBe(0);
  });

  it("prunes expired client entries so the map does not grow", () => {
    const c = clock();
    const limiter = new AlertRateLimiter(c.now);
    for (let round = 0; round < 50; round++) {
      for (let i = 0; i < 5; i++) limiter.check(`ip-${round}-${i}`);
      expect(limiter.trackedClients()).toBeLessThanOrEqual(GLOBAL_LIMIT);
      c.advance(WINDOW_MS);
    }
    limiter.check(null);
    expect(limiter.trackedClients()).toBe(0);
  });

  it("enforces a hard cap on tracked clients even with generous limits", () => {
    const limiter = new AlertRateLimiter(clock().now, {
      global: 1_000_000,
      perClient: 2,
      windowMs: WINDOW_MS,
      maxClients: 10,
    });
    for (let i = 0; i < 500; i++) limiter.check(`ip-${i}`);
    expect(limiter.trackedClients()).toBe(10);
  });
});

describe("clientKeyFromHeaders", () => {
  it("reads CF-Connecting-IP and normalizes it", () => {
    expect(clientKeyFromHeaders(new Headers({ "CF-Connecting-IP": " 2001:DB8::1 " }))).toBe("2001:db8::1");
    expect(clientKeyFromHeaders(new Headers({ "cf-connecting-ip": "203.0.113.5" }))).toBe("203.0.113.5");
  });

  it("never reads X-Forwarded-For or X-Real-IP", () => {
    expect(
      clientKeyFromHeaders(new Headers({ "X-Forwarded-For": "203.0.113.5", "X-Real-IP": "203.0.113.6" })),
    ).toBeNull();
  });

  it("treats an absent, empty, oversized or non-IP value as absent (global only)", () => {
    expect(clientKeyFromHeaders(new Headers())).toBeNull();
    expect(clientKeyFromHeaders(new Headers({ "cf-connecting-ip": "   " }))).toBeNull();
    expect(clientKeyFromHeaders(new Headers({ "cf-connecting-ip": "1".repeat(46) }))).toBeNull();
    expect(clientKeyFromHeaders(new Headers({ "cf-connecting-ip": "evil<script>" }))).toBeNull();
    expect(clientKeyFromHeaders(new Headers({ "cf-connecting-ip": "1.2.3.4, 5.6.7.8" }))).toBeNull();
  });
});
