import { ArrowRight } from "lucide-react";

/*
  Placeholder landing page. The full marketing landing (hero, feature
  blocks, social proof strip, Paradigm banner) is chunk 2.12. Sign-in is
  the AxlePoint demo pattern: one click sets the session cookie.
*/
export default function Home({
  searchParams,
}: {
  searchParams: { signin?: string };
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex items-center gap-3">
        <span className="inline-block h-4 w-4 rounded-full border-[3px] border-brand-pine" aria-hidden />
        <h1 className="text-4xl font-semibold tracking-tight text-brand-forest">
          Lumen Analytics
        </h1>
      </div>
      <p className="max-w-md text-lg text-muted-foreground">
        See changes in your business before they hit your P&amp;L.
      </p>
      {searchParams.signin === "required" && (
        <p className="rounded-md border border-anomaly-moderate/40 bg-anomaly-moderate/10 px-4 py-2 text-sm text-anomaly-moderate-text">
          Sign in to open the demo workspace.
        </p>
      )}
      <form method="POST" action="/api/session">
        <button
          type="submit"
          className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-spruce"
        >
          Sign in as demo user
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </form>
      <p className="text-xs text-muted-foreground">
        A demo product by Paradigm Coding Solutions. All data is synthetic.
      </p>
    </main>
  );
}
