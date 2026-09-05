import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { ClearStaleServiceWorkers } from "@/components/clear-stale-service-workers";
import { SiteShell } from "@/components/layout/site-shell";
import { SiteAnalytics } from "@/components/analytics/site-analytics";
import { rootMetadata } from "@/lib/seo/metadata";
import "./globals.css";

// Body / UI text — unchanged.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

// Display face (Rummaan system). Replaces Cormorant Garamond; the CSS var name is
// kept as --font-cormorant so existing @theme wiring keeps working.
const fraunces = Fraunces({
  variable: "--font-cormorant",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});

// Data / labels / prices — mono utility face.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = rootMetadata();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // translate="no": Google Translate / in-app browsers rewrite the DOM and
    // crash React on iPhone (removeChild), which shows "Waxbaa khaldamay".
    <html
      lang="so"
      translate="no"
      suppressHydrationWarning
      className={`notranslate ${jakarta.variable} ${fraunces.variable} ${plexMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col antialiased font-sans">
        {/* One-time cleanup for browsers that still have the old PWA worker */}
        <ClearStaleServiceWorkers />
        <Providers>
          <SiteShell>{children}</SiteShell>
        </Providers>
        <SiteAnalytics />
      </body>
    </html>
  );
}
