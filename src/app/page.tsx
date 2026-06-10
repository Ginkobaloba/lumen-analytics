import Link from "next/link";

/*
  Placeholder landing page. The full marketing landing (hero, feature
  blocks, social proof strip, Paradigm banner) is chunk 2.12.
*/
export default function Home() {
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
      <Link
        href="/app"
        className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-spruce"
      >
        Open the dashboard
      </Link>
      <p className="text-xs text-muted-foreground">
        A demo product by Paradigm Coding Solutions. All data is synthetic.
      </p>
    </main>
  );
}
