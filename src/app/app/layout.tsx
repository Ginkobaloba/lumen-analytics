import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import ParadigmBanner from "@/components/paradigm-banner";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <ParadigmBanner />
      <AppShell>{children}</AppShell>
    </>
  );
}
