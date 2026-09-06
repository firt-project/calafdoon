import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { payments, ApiClientError, profile } from "@hel/api-client";
import {
  formatMoney,
  REGISTRATION_PRICE,
  WAAFI_ACCESS_DAYS,
} from "@/lib/constants";
import { useSession } from "@/features/auth/SessionProvider";
import { PaystackCheckoutSheet } from "@/features/payments/PaystackCheckoutSheet";

const WAAFI_COUNTRY_CODE = "252";

function toLocalMobileDigits(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith(WAAFI_COUNTRY_CODE)) {
    digits = digits.slice(WAAFI_COUNTRY_CODE.length);
  }
  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 12);
}

type PaystackSession = { url: string; reference: string };

/**
 * Mobile paywall — WaafiPay (Somali mobile wallet) and Paystack (card, M-Pesa,
 * bank). Both complete inside the app: WaafiPay via a phone PIN prompt, Paystack
 * via an embedded checkout sheet. No EVC proof upload, no browser jump.
 */
export function PlansPage() {
  const navigate = useNavigate();
  const { accessState, refresh, logout } = useSession();

  async function handleLogout() {
    await logout();
    navigate("/welcome", { replace: true });
  }
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mpesaBusy, setMpesaBusy] = useState(false);
  const [waafiEnabled, setWaafiEnabled] = useState<boolean | null>(null);
  const [paystackEnabled, setPaystackEnabled] = useState<boolean | null>(null);
  const [localMobile, setLocalMobile] = useState("");
  const [paystackSession, setPaystackSession] = useState<PaystackSession | null>(
    null
  );

  const priceLabel = formatMoney(REGISTRATION_PRICE);

  // Match Nest hasPaidAccess — approval alone does not unlock.
  const alreadyGranted = accessState?.hasPaidAccess === true;

  const membershipExpired =
    accessState?.hasPaidAccess === false &&
    (accessState?.hasPaid === true || accessState?.paidUntil != null);

  const isPremium =
    accessState?.isPremium === true ||
    accessState?.hasPersonalSupport === true;

  useEffect(() => {
    let cancelled = false;
    void payments.waafi
      .status()
      .then((s) => {
        if (!cancelled) setWaafiEnabled(Boolean(s?.enabled));
      })
      .catch(() => {
        if (!cancelled) setWaafiEnabled(false);
      });
    void payments.paystack
      .status()
      .then((s) => {
        if (!cancelled) setPaystackEnabled(Boolean(s?.enabled));
      })
      .catch(() => {
        if (!cancelled) setPaystackEnabled(false);
      });
    // Prefill the wallet field from the profile phone as a convenience only —
    // any wallet number is accepted, it need not match the profile.
    void profile
      .getProfile()
      .then((p) => {
        const phone =
          p && typeof p === "object" && "phone" in p
            ? String((p as { phone?: string | null }).phone ?? "").trim()
            : "";
        const prefill = toLocalMobileDigits(phone);
        if (!cancelled && prefill.length >= 8) setLocalMobile(prefill);
      })
      .catch(() => {
        /* optional */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function payWithWaafi() {
    if (waafiEnabled === false) {
      setError("WaafiPay is not available right now. Please try again later.");
      return;
    }
    const digits = toLocalMobileDigits(localMobile);
    if (digits.length < 8) {
      setError("Enter the wallet number to charge, after +252 (8+ digits).");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await payments.waafi.purchase({
        accountNo: `${WAAFI_COUNTRY_CODE}${digits}`,
        tier: "basic",
      });
      setStatus("Payment received. Unlocking your account…");
      await refresh();
      navigate("/home", { replace: true });
    } catch (e) {
      setError(
        e instanceof ApiClientError
          ? e.message
          : "WaafiPay payment failed. Check the wallet number and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  async function payWithPaystack() {
    if (paystackEnabled === false) {
      setError("Card / M-Pesa is not available right now. Please try WaafiPay.");
      return;
    }
    setMpesaBusy(true);
    setError(null);
    setStatus(null);
    try {
      // No channel restriction — Paystack shows card, M-Pesa and bank.
      const result = await payments.paystack.startCheckout({ tier: "basic" });
      if (!result?.authorizationUrl || !result?.reference) {
        throw new Error("Could not start the payment.");
      }
      setPaystackSession({
        url: result.authorizationUrl,
        reference: result.reference,
      });
    } catch (e) {
      setError(
        e instanceof ApiClientError
          ? e.message
          : "Could not start the payment. Please try again."
      );
    } finally {
      setMpesaBusy(false);
    }
  }

  if (paystackSession) {
    return (
      <PaystackCheckoutSheet
        url={paystackSession.url}
        reference={paystackSession.reference}
        amountLabel={`$${priceLabel}`}
        onSuccess={() => {
          setPaystackSession(null);
          setStatus("Payment received. Unlocking your account…");
          void refresh().then(() => navigate("/home", { replace: true }));
        }}
        onClose={() => setPaystackSession(null)}
      />
    );
  }

  const heading = isPremium
    ? "Your plan"
    : alreadyGranted
      ? "Membership"
      : membershipExpired
        ? "Renew membership"
        : "Unlock matches";

  return (
    <div className="screen">
      <header className="screen-header">
        <button
          type="button"
          className="back-btn"
          onClick={() =>
            navigate(isPremium || alreadyGranted ? "/home" : "/settings", {
              replace: true,
            })
          }
          aria-label="Back"
        >
          ←
        </button>
        <h1>{heading}</h1>
        <span />
      </header>

      <div className="plans-body">
        {isPremium || alreadyGranted ? (
          <>
            <div className="pay-plan">
              <span className="pay-plan-eyebrow">
                {isPremium ? "Premium" : "Member"}
              </span>
              <strong className="pay-plan-title">
                {isPremium ? "Premium active" : "Access unlocked"}
              </strong>
              <p className="muted small" style={{ margin: "0.4rem 0 0" }}>
                {isPremium
                  ? "Full access plus personal support. No further payment needed."
                  : `Home and Discover are open. Membership renews every ${WAAFI_ACCESS_DAYS} days.`}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => navigate("/home", { replace: true })}
            >
              Back to Home
            </button>
            <p className="muted small center" style={{ marginTop: "1rem" }}>
              <Link to="/settings">Settings</Link>
            </p>
          </>
        ) : (
          <>
            <div className="pay-plan">
              <span className="pay-plan-eyebrow">
                {membershipExpired ? "Renewal" : "Membership"}
              </span>
              <div className="pay-plan-price">
                <span className="pay-plan-amount">${priceLabel}</span>
                <span className="pay-plan-per">
                  / {WAAFI_ACCESS_DAYS} days
                </span>
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                {membershipExpired
                  ? `Your ${WAAFI_ACCESS_DAYS}-day access ended. Pay to unlock another ${WAAFI_ACCESS_DAYS} days of matches and messaging.`
                  : "Unlocks matches and messaging. Pay with a Somali mobile wallet, or by card / M-Pesa — everything finishes here in the app."}
              </p>
            </div>

            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            {status && (
              <div className="form-success" role="status">
                {status}
              </div>
            )}

            <div className="pay-method">
              <div className="pay-method-head">
                <span className="pay-method-name">WaafiPay</span>
                <span className="pay-method-tag">EVC Plus · WAAFI · ZAAD · SAHAL</span>
              </div>
              {waafiEnabled === false ? (
                <p className="form-error small" role="alert" style={{ margin: 0 }}>
                  WaafiPay is temporarily unavailable.
                </p>
              ) : (
                <p className="muted small" style={{ margin: 0 }}>
                  The wallet you enter gets the PIN prompt — it can be yours or a
                  relative's.
                </p>
              )}
              <label className="pay-field-label" htmlFor="waafi-mobile">
                Wallet number
              </label>
              <div className="pay-phone-input">
                <span className="pay-phone-cc">+{WAAFI_COUNTRY_CODE}</span>
                <input
                  id="waafi-mobile"
                  className="input"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="61 234 5678"
                  value={localMobile}
                  onChange={(e) =>
                    setLocalMobile(toLocalMobileDigits(e.target.value))
                  }
                />
              </div>
              <button
                type="button"
                className="btn btn-primary btn-block btn-lg"
                disabled={
                  busy || waafiEnabled === false || localMobile.length < 8
                }
                onClick={() => void payWithWaafi()}
              >
                {busy
                  ? "Waiting for phone approval…"
                  : `Pay $${priceLabel} with WaafiPay`}
              </button>
            </div>

            {paystackEnabled !== false && (
              <div className="pay-method">
                <div className="pay-method-head">
                  <span className="pay-method-name">Card &amp; M-Pesa</span>
                  <span className="pay-method-tag">Card · M-Pesa · bank · Paystack</span>
                </div>
                <p className="muted small" style={{ margin: 0 }}>
                  Opens a secure payment sheet inside the app. Choose card, M-Pesa
                  or bank on the next screen.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-block btn-lg"
                  disabled={mpesaBusy || paystackEnabled === null}
                  onClick={() => void payWithPaystack()}
                >
                  {mpesaBusy
                    ? "Starting payment…"
                    : `Pay $${priceLabel} by card or M-Pesa`}
                </button>
              </div>
            )}

            <p className="muted small" style={{ marginTop: "0.5rem" }}>
              You can open <Link to="/settings">Settings</Link> or sign out any
              time. Matches, Discover and messaging stay locked until you pay.
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => void handleLogout()}
              style={{ marginTop: "0.25rem" }}
            >
              Log out
            </button>
          </>
        )}
      </div>
    </div>
  );
}
