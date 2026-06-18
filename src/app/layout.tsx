import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const SITE_URL = "https://lumenanalytics.projectnexuscode.org";
const SITE_DESCRIPTION =
  "Customer behavior and revenue analytics for B2B SaaS. See changes in your business before they hit your P&L.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Lumen Analytics",
    template: "%s | Lumen Analytics",
  },
  description: SITE_DESCRIPTION,
  robots: { index: false, follow: false },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Lumen Analytics",
    title: "Lumen Analytics",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
        alt: "Lumen Analytics, a Paradigm Coding Solutions portfolio demo.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lumen Analytics",
    description: SITE_DESCRIPTION,
    images: ["/og-default.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
