import { GoogleAnalytics } from "@next/third-parties/google";

/** GA4 Measurement ID from env, e.g. G-XXXXXXXXXX */
const DEFAULT_GA_MEASUREMENT_ID = "G-R2KHEZ77P6";

export function getGaMeasurementId(): string | undefined {
  const id =
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || DEFAULT_GA_MEASUREMENT_ID;
  if (!id || !id.startsWith("G-")) return undefined;
  return id;
}

/**
 * Loads Google Analytics 4 when NEXT_PUBLIC_GA_MEASUREMENT_ID is set.
 * Tracks visitors from all sources (WhatsApp, direct, ads, Google Search, etc.).
 */
export function SiteAnalytics() {
  const gaId = getGaMeasurementId();
  if (!gaId) return null;
  return <GoogleAnalytics gaId={gaId} />;
}
