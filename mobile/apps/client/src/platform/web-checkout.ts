import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { PRODUCTION_SITE_URL } from "@/lib/constants";
import { openExternalUrl } from "@/platform/external-links";

/**
 * iOS web-checkout switch. Off: iOS pays in-app with WaafiPay / Paystack,
 * exactly like Android. Flip to true to send iOS members to the website
 * instead — the fallback if App Review rejects the build under Guideline
 * 3.1.1 (in-app payment for digital access without Apple IAP).
 */
const IOS_WEB_CHECKOUT = false;

export function shouldUseWebCheckout(): boolean {
  return IOS_WEB_CHECKOUT && Capacitor.getPlatform() === "ios";
}

/** iOS opens the Paystack page in the browser (Safari view); Android keeps
 * the original in-app iframe sheet unchanged. */
export function paystackOpensInBrowser(): boolean {
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
