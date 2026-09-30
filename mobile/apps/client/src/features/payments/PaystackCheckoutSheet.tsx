import { useEffect, useRef, useState } from "react";
import { Browser } from "@capacitor/browser";
import { payments, ApiClientError } from "@hel/api-client";
import { openExternalUrl } from "@/platform/external-links";
import { subscribeWebCheckoutReturn } from "@/platform/web-checkout";

type Props = {
  /** Paystack hosted-checkout URL from startCheckout(). Opened in the browser. */
  url: string;
  /** Transaction reference to verify against our API. */
  reference: string;
  amountLabel: string;
  onSuccess: () => void;
  onClose: () => void;
};

const POLL_MS = 3500;

function openCheckout(url: string) {
  void openExternalUrl(url, { title: "Paystack" }).catch(() => undefined);
}

/**
 * Paystack checkout in the browser (Safari view on iOS, Chrome tab on
 * Android), not inside the app. This screen waits behind it: we poll our
 * verify endpoint, and also re-check the moment the browser closes or the app
 * returns to the foreground. Once payment clears the browser is closed where
 * the platform allows it.
 */
export function PaystackCheckoutSheet({
  url,
  reference,
  amountLabel,
  onSuccess,
  onClose,
}: Props) {
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    openCheckout(url);
  }, [url]);

  useEffect(() => {
    let alive = true;

    async function verifyOnce(manual: boolean) {
      if (settled.current) return;
      if (manual) setChecking(true);
      try {
        await payments.paystack.verify(reference);
        settled.current = true;
        // Browser.close() is iOS/web only; Android's tab closes itself on return.
        void Browser.close().catch(() => undefined);
        if (alive) onSuccess();
      } catch (e) {
        if (!alive) return;
        if (manual) {
          setChecking(false);
          setNote(
            e instanceof ApiClientError && /not (completed|paid|finished)/i.test(e.message)
              ? "Payment not finished yet — complete it in the browser."
              : "Not confirmed yet. If you've paid, wait a moment and tap again."
          );
        }
      }
    }

    const timer = window.setInterval(() => void verifyOnce(false), POLL_MS);
    const onManual = () => void verifyOnce(true);
    window.addEventListener("paystack:check", onManual);
    const stopReturn = subscribeWebCheckoutReturn(() => void verifyOnce(false));

    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("paystack:check", onManual);
      stopReturn();
    };
  }, [reference, onSuccess]);

  return (
    <div className="pay-sheet" role="dialog" aria-modal="true" aria-label="Card or M-Pesa payment">
      <div className="pay-sheet-bar">
        <span className="pay-sheet-title">
          <span className="pay-sheet-dot" aria-hidden="true" />
          Secure payment · Paystack
        </span>
        <button type="button" className="pay-sheet-close" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="pay-sheet-wait">
        <strong>Finish paying {amountLabel} in your browser</strong>
        <p className="muted small">
          The Paystack page opened in your browser. Choose card, M-Pesa or bank
          there, then come back — this screen unlocks automatically once
          payment clears.
        </p>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={() => openCheckout(url)}
        >
          Open payment page again
        </button>
      </div>

      <div className="pay-sheet-foot">
        {note ? <p className="pay-sheet-note">{note}</p> : null}
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={checking}
          onClick={() => window.dispatchEvent(new Event("paystack:check"))}
        >
          {checking ? "Checking…" : `I've paid ${amountLabel} — confirm`}
        </button>
        <p className="pay-sheet-hint muted small">
          Card charges instantly; M-Pesa sends a PIN prompt to your phone.
        </p>
      </div>
    </div>
  );
}
