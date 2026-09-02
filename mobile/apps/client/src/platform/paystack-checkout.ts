import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { payments, ApiClientError } from "@hel/api-client";
import { openExternalUrl } from "@/platform/external-links";

const PENDING_KEY = "paystack_pending_reference";

export async function rememberPendingPaystackReference(
  reference: string
): Promise<void> {
  await Preferences.set({ key: PENDING_KEY, value: reference });
}

export async function clearPendingPaystackReference(): Promise<void> {
  await Preferences.remove({ key: PENDING_KEY });
}

export async function readPendingPaystackReference(): Promise<string | null> {
  const { value } = await Preferences.get({ key: PENDING_KEY });
  return value || null;
}

export function paystackReferenceFromUrl(url: string): string | null {
  const read = (params: URLSearchParams) =>
    params.get("paystack_reference") ||
    params.get("reference") ||
    params.get("trxref");
  try {
    return read(new URL(url).searchParams);
  } catch {
    const q = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
    return read(new URLSearchParams(q));
  }
}

export async function openPaystackCheckout(url: string): Promise<void> {
  await openExternalUrl(url, { title: "Paystack" });
}

/**
 * After the Paystack page closes / redirects back, verify the pending
 * reference. Returns true when access was granted.
 */
export async function verifyPendingPaystackReference(
  reference?: string | null
): Promise<{ ok: boolean; message?: string; silent?: boolean }> {
  const ref = reference || (await readPendingPaystackReference());
  if (!ref) {
    return { ok: false, silent: true, message: "No pending M-Pesa payment to verify." };
  }
  try {
    await payments.paystack.verify(ref);
    await clearPendingPaystackReference();
    try {
      await Browser.close();
    } catch {
      /* not open */
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiClientError) {
      if (/not completed|not paid|not completed yet/i.test(e.message)) {
        return {
          ok: false,
          message:
            "Payment not finished yet. Complete the M-Pesa prompt, then return here.",
        };
      }
      return { ok: false, message: e.message };
    }
    return {
      ok: false,
      message: "Could not verify the M-Pesa payment. Try again in a moment.",
    };
  }
}

/** Wire deep-link + in-app browser close → verify. Call once from Plans. */
export function subscribePaystackReturn(
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

  const runVerify = async (reference?: string | null) => {
    if (!alive || verifying) return;
    verifying = true;
    try {
      const result = await verifyPendingPaystackReference(reference);
      if (alive && !result.silent) onResult(result);
    } finally {
      verifying = false;
    }
  };

  void App.addListener("appUrlOpen", (event) => {
    if (!alive) return;
    const ref = paystackReferenceFromUrl(event.url);
    if (ref) void runVerify(ref);
  }).then((h) => handles.push(h));

  void Browser.addListener("browserFinished", () => {
    if (!alive) return;
    void (async () => {
      // Give Paystack / the webhook a moment to settle before verify.
      await new Promise((r) => setTimeout(r, 1200));
      await runVerify();
    })();
  }).then((h) => handles.push(h));

  return () => {
    alive = false;
    for (const h of handles) void h.remove();
  };
}
