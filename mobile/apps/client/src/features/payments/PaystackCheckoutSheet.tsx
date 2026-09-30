import { useEffect, useRef, useState } from "react";
import { Browser } from "@capacitor/browser";
import { payments, ApiClientError } from "@hel/api-client";
import { openExternalUrl } from "@/platform/external-links";
import {
  paystackOpensInBrowser,
  subscribeWebCheckoutReturn,
} from "@/platform/web-checkout";

type Props = {
  /** Paystack hosted-checkout URL from startCheckout(). */
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
 * Paystack checkout. iOS: the hosted page opens in the browser (Safari view)
 * and this screen waits behind it, re-checking the moment the browser closes
 * or the app returns to the foreground. Android: the hosted page is embedded
 * in an iframe so the member never leaves the app (unchanged). Both poll our
 * verify endpoint, since the redirect back to the callback URL is not
 * readable from here.
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
  const inBrowser = paystackOpensInBrowser();

  useEffect(() => {
    if (inBrowser) openCheckout(url);
  }, [inBrowser, url]);

  useEffect(() => {
    let alive = true;

    async function verifyOnce(manual: boolean) {
      if (settled.current) return;
      if (manual) setChecking(true);
      try {
        await payments.paystack.verify(reference);
        settled.current = true;
        if (inBrowser) void Browser.close().catch(() => undefined);
        if (alive) onSuccess();
      } catch (e) {
        if (!alive) return;
        if (manual) {
          setChecking(false);
          setNote(
            e instanceof ApiClientError &&
              /not (completed|paid|finished)/i.test(e.message)
              ? inBrowser
                ? "Payment not finished yet — complete it in the browser."
                : "Payment not finished yet — complete the prompt on your phone."
              : "Not confirmed yet. If you've paid, wait a moment and tap again.",
          );
        }
      }
    }

    const timer = window.setInterval(() => void verifyOnce(false), POLL_MS);
    const onManual = () => void verifyOnce(true);
    window.addEventListener("paystack:check", onManual);
    const stopReturn = inBrowser
      ? subscribeWebCheckoutReturn(() => void verifyOnce(false))
      : () => undefined;

    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("paystack:check", onManual);
      stopReturn();
    };
  }, [reference, onSuccess, inBrowser]);

  return (
    <div
      className="pay-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Card or M-Pesa payment"
    >
      <div className="pay-sheet-bar">
        <span className="pay-sheet-title">
          <span className="pay-sheet-dot" aria-hidden="true" />
          Secure payment · Paystack
        </span>
        <button type="button" className="pay-sheet-close" onClick={onClose}>
          Close
        </button>
      </div>

      {inBrowser ? (
        <div className="pay-sheet-wait">
          <strong>Finish paying {amountLabel} in your browser</strong>
          <p className="muted small">
            The Paystack page opened in your browser. Choose card, M-Pesa or
            bank there, then come back — this screen unlocks automatically once
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
      ) : (
        <iframe
          src={url}
          title="Card or M-Pesa payment via Paystack"
          className="pay-sheet-frame"
          allow="payment"
        />
      )}

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
          {inBrowser
            ? "Card charges instantly; M-Pesa sends a PIN prompt to your phone."
            : "Card charges instantly; M-Pesa sends a PIN prompt to your phone. This screen unlocks automatically once payment clears."}
        </p>
      </div>
    </div>
  );
}
