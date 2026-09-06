import { useEffect, useRef, useState } from "react";
import { payments, ApiClientError } from "@hel/api-client";

type Props = {
  /** Paystack hosted-checkout URL from startCheckout(). Rendered in-app. */
  url: string;
  /** Transaction reference to verify against our API. */
  reference: string;
  amountLabel: string;
  onSuccess: () => void;
  onClose: () => void;
};

const POLL_MS = 3500;

/**
 * In-app Paystack checkout. The hosted page is embedded in an iframe (same
 * technique Paystack's own inline library uses) so the member never leaves the
 * app. We poll our verify endpoint because the iframe redirect back to the
 * callback URL is cross-origin and not readable from here.
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
    let alive = true;

    async function verifyOnce(manual: boolean) {
      if (settled.current) return;
      if (manual) setChecking(true);
      try {
        await payments.paystack.verify(reference);
        settled.current = true;
        if (alive) onSuccess();
      } catch (e) {
        if (!alive) return;
        if (manual) {
          setChecking(false);
          setNote(
            e instanceof ApiClientError && /not (completed|paid|finished)/i.test(e.message)
              ? "Payment not finished yet — complete the prompt on your phone."
              : "Not confirmed yet. If you've paid, wait a moment and tap again."
          );
        }
      }
    }

    const timer = window.setInterval(() => void verifyOnce(false), POLL_MS);
    const onManual = () => void verifyOnce(true);
    window.addEventListener("paystack:check", onManual);

    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("paystack:check", onManual);
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

      <iframe
        src={url}
        title="Card or M-Pesa payment via Paystack"
        className="pay-sheet-frame"
        allow="payment"
      />

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
          Card charges instantly; M-Pesa sends a PIN prompt to your phone. This
          screen unlocks automatically once payment clears.
        </p>
      </div>
    </div>
  );
}
