import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { PRODUCTION_SITE_URL } from "@/lib/constants";
import { openExternalUrl } from "@/platform/external-links";

/**
 * iOS cannot process real-money payment for in-app digital access without
 * Apple's IAP (App Store Review Guideline 3.1.1) — WaafiPay / Paystack can't
 * ship in-app on iOS. Instead, iOS sends the member to the website (same
 * account, same backend) to complete membership there, in the system browser.
 * Android keeps the existing in-app WaafiPay / Paystack flow.
 */
export function shouldUseWebCheckout(): boolean {
  return Capacitor.getPlatform() === "ios";
}

/** Opens the website login in the system browser (SFSafariViewController on iOS).
 * Once signed in there, the website's own post-login routing sends an unpaid
 * member straight to its payment page — no query params to wire up. */
export async function openWebCheckout(): Promise<void> {
  await openExternalUrl(`${PRODUCTION_SITE_URL}/login`, {
    title: "helcalafkaaga.com",
  });
}

/**
 * Calls `onReturn` whenever the member could plausibly have just finished
 * paying on the website: the in-app browser closed, or the app came back to
 * the foreground. Cheap to over-call — the caller just re-fetches access
 * state, there is no local "pending session" to reconcile.
 */
export function subscribeWebCheckoutReturn(onReturn: () => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined;

  let alive = true;
  const handles: Array<{ remove: () => Promise<void> }> = [];

  void Browser.addListener("browserFinished", () => {
    if (!alive) return;
    onReturn();
  }).then((h) => handles.push(h));

  void App.addListener("resume", () => {
    if (!alive) return;
    onReturn();
  }).then((h) => handles.push(h));

  return () => {
    alive = false;
    for (const h of handles) void h.remove();
  };
}
