"use client";

import { useEffect, useState } from "react";

/**
 * Client-side portal token claimer (chunk 4b).
 *
 * The portal hands off via the URL fragment so the JWT never reaches any
 * HTTP server log:
 *
 *   https://lumen.example.com/#portal_token=<JWT>
 *
 * On mount we read `window.location.hash`, scrub it from the address bar,
 * and POST the token to /api/portal/handoff. On success the server has set
 * our session cookie and we navigate to the redirect it returned.
 *
 * Failure modes are intentionally quiet for the demo: a banner explains
 * what happened so the user can fall back to the "Sign in as demo user"
 * button. We do not surface the raw failure reason because the verifier's
 * categories are not useful to an end user.
 */
export default function PortalTokenClaim() {
  const [status, setStatus] = useState<
    "idle" | "claiming" | "ok" | "error"
  >("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash || "";
    const token = readPortalToken(hash);
    if (!token) return;

    // Scrub the fragment immediately so a refresh or share does not re-leak
    // the token, and so the browser history loses it.
    try {
      const cleanUrl =
        window.location.pathname + window.location.search;
      window.history.replaceState(null, "", cleanUrl);
    } catch {
      // History API failures are not fatal; we still POST the token.
    }

    setStatus("claiming");
    void claim(token)
      .then((target) => {
        setStatus("ok");
        window.location.replace(target);
      })
      .catch(() => {
        setStatus("error");
      });
  }, []);

  if (status === "idle") return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md border bg-card px-4 py-2 text-sm shadow-md"
    >
      {status === "claiming" && "Signing you in from the portal..."}
      {status === "ok" && "Portal sign-in complete. Redirecting..."}
      {status === "error" &&
        "We could not verify the portal handoff. Use the sign-in button below."}
    </div>
  );
}

function readPortalToken(hash: string): string | null {
  if (!hash || hash.length < 2) return null;
  // Strip the leading "#".
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const token = params.get("portal_token");
  if (!token || token.length === 0) return null;
  return token;
}

async function claim(token: string): Promise<string> {
  const res = await fetch("/api/portal/handoff", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    throw new Error("handoff failed: " + res.status);
  }
  const body = (await res.json()) as { ok: boolean; redirect?: string };
  if (!body.ok || typeof body.redirect !== "string") {
    throw new Error("handoff returned a malformed body");
  }
  return body.redirect;
}
