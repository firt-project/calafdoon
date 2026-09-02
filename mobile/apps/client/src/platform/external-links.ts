import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

const ALLOWED_HOST_SUFFIXES = [
  "stripe.com",
  "checkout.stripe.com",
  "billing.stripe.com",
  "paystack.com",
  "checkout.paystack.com",
  "helcalafkaaga.com",
  "www.helcalafkaaga.com",
];

function isAllowedExternalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
}

/**
 * Open only legitimate external HTTPS URLs (payments, verified hosts).
 * Always uses Capacitor Browser on native so leaving the app is visible.
 */
export async function openExternalUrl(
  url: string,
  opts?: { title?: string }
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid external URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Only https external links are allowed.");
  }
  if (!isAllowedExternalHost(parsed.hostname)) {
    throw new Error("That external destination is not allowed by this app.");
  }
  if (Capacitor.isNativePlatform()) {
    await Browser.open({
      url: parsed.toString(),
      presentationStyle: "popover",
      windowName: opts?.title,
    });
    return;
  }
  window.open(parsed.toString(), "_blank", "noopener,noreferrer");
}

export async function openMailTo(email: string, subject?: string): Promise<void> {
  const q = subject ? `?subject=${encodeURIComponent(subject)}` : "";
  window.location.href = `mailto:${email}${q}`;
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function platformId(): string {
  return Capacitor.getPlatform();
}
