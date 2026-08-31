import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { payments, ApiClientError } from "@hel/api-client";
import { openExternalUrl } from "@/platform/external-links";

const PENDING_KEY = "stripe_pending_session_id";

export function checkoutClient(): "web" | "mobile" {
  return Capacitor.isNativePlatform() ? "mobile" : "web";
}

export async function rememberPendingCheckoutSession(
  sessionId: string
): Promise<void> {
  await Preferences.set({ key: PENDING_KEY, value: sessionId });
}

export async function clearPendingCheckoutSession(): Promise<void> {
  await Preferences.remove({ key: PENDING_KEY });
}

export async function readPendingCheckoutSession(): Promise<string | null> {
  const { value } = await Preferences.get({ key: PENDING_KEY });
  return value || null;
}

export function sessionIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return (
      parsed.searchParams.get("session_id") ||
      parsed.searchParams.get("checkout_session_id")
    );
  } catch {
    // Custom schemes like helcalaf://plans?session_id=...
    const q = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
    const params = new URLSearchParams(q);
    return params.get("session_id") || params.get("checkout_session_id");
  }
}

export async function openStripeCheckout(url: string): Promise<void> {
  await openExternalUrl(url, { title: "Stripe Checkout" });
}

/**
 * After Stripe Checkout closes / redirects back, verify the pending session.
 * Returns true when access was granted.
 */
export async function verifyPendingStripeSession(
  sessionId?: string | null
): Promise<{ ok: boolean; message?: string; silent?: boolean }> {
  const id = sessionId || (await readPendingCheckoutSession());
  if (!id) {
    return { ok: false, silent: true, message: "No pending card payment to verify." };
  }
  try {
    await payments.verifySession(id);
    await clearPendingCheckoutSession();
    try {
      await Browser.close();
    } catch {
      /* not open */
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiClientError) {
      // User closed the browser without paying — keep pending for another try.
      if (/not completed|not paid|Payment not completed/i.test(e.message)) {
        return {
          ok: false,
          message:
            "Payment not finished yet. Complete checkout in Stripe, then return here.",
        };
      }
      return { ok: false, message: e.message };
    }
    return {
      ok: false,
      message: "Could not verify Stripe payment. Try again in a moment.",
    };
  }
}

/** Wire deep-link + in-app browser close → verify. Call once from Plans. */
export function subscribeStripeReturn(
  onResult: (result: {
    ok: boolean;
    message?: string;
    silent?: boolean;
  }) => void
): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined;

  let alive = true;
  let verifying = false;
  const handles: Array<{ remove: () => Promise<void> }> = [];

  const runVerify = async (sessionId?: string | null, canceled = false) => {
    if (!alive || verifying) return;
    if (canceled) {
      onResult({
        ok: false,
        message: "Checkout canceled. You can try card payment again.",
      });
      try {
        await Browser.close();
      } catch {
        /* ignore */
      }
      return;
    }
    verifying = true;
    try {
      const result = await verifyPendingStripeSession(sessionId);
      if (alive && !result.silent) onResult(result);
    } finally {
      verifying = false;
    }
  };

  void App.addListener("appUrlOpen", (event) => {
    if (!alive) return;
    const id = sessionIdFromUrl(event.url);
    const canceled = /canceled=true/i.test(event.url) && !id;
    void runVerify(id, canceled);
  }).then((h) => handles.push(h));

  void Browser.addListener("browserFinished", () => {
    if (!alive) return;
    void (async () => {
      // Give Stripe a moment to mark the session paid before verify.
      await new Promise((r) => setTimeout(r, 800));
      await runVerify();
    })();
  }).then((h) => handles.push(h));

  return () => {
    alive = false;
    for (const h of handles) void h.remove();
  };
}
