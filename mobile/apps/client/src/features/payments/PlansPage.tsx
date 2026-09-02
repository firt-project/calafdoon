import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { payments, ApiClientError, profile } from "@hel/api-client";
import {
  formatMoney,
  REGISTRATION_PRICE,
  WAAFI_ACCESS_DAYS,
} from "@/lib/constants";
import { useSession } from "@/features/auth/SessionProvider";
import {
  openPaystackCheckout,
  rememberPendingPaystackReference,
  subscribePaystackReturn,
  verifyPendingPaystackReference,
} from "@/platform/paystack-checkout";

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

/**
 * Mobile plans / paywall — WaafiPay (mobile wallet) and M-Pesa (via Paystack)
 * only. No Stripe card, no EVC proof upload.
 */
export function PlansPage() {
  const navigate = useNavigate();
  const { accessState, refresh } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mpesaBusy, setMpesaBusy] = useState(false);
  const [waafiEnabled, setWaafiEnabled] = useState<boolean | null>(null);
  const [paystackEnabled, setPaystackEnabled] = useState<boolean | null>(null);
  const [localMobile, setLocalMobile] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [mpesaStarted, setMpesaStarted] = useState(false);

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
    void profile
      .getProfile()
      .then((p) => {
        const phone =
          p && typeof p === "object" && "phone" in p
            ? String((p as { phone?: string | null }).phone ?? "").trim()
            : "";
        if (!cancelled) {
          setProfilePhone(phone);
          const prefill = toLocalMobileDigits(phone);
          if (prefill.length >= 8) setLocalMobile(prefill);
        }
      })
      .catch(() => {
        /* optional */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // When the Paystack browser closes / deep-links back, verify and unlock.
  useEffect(() => {
    const unsubscribe = subscribePaystackReturn((result) => {
      setMpesaBusy(false);
      if (result.ok) {
        setError(null);
        setStatus("Payment successful. Unlocking your account…");
        void refresh().then(() => navigate("/home", { replace: true }));
      } else if (result.message) {
        setError(result.message);
      }
    });
    return unsubscribe;
  }, [navigate, refresh]);

  async function payWithWaafi() {
    if (waafiEnabled === false) {
      setError("WaafiPay is not available right now. Please try again later.");
      return;
    }
    const digits = toLocalMobileDigits(localMobile);
    if (digits.length < 8) {
      setError("Enter your mobile number after +252 (at least 8 digits).");
      return;
    }
    if (!profilePhone) {
      setError("Add a phone number in your profile before paying with WaafiPay.");
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
      setStatus("Payment successful. Unlocking your account…");
      await refresh();
      navigate("/home", { replace: true });
    } catch (e) {
      setError(
        e instanceof ApiClientError
          ? e.message
          : "WaafiPay payment failed. Check your number and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  async function payWithMpesa() {
    if (paystackEnabled === false) {
      setError("M-Pesa is not available right now. Please try WaafiPay.");
      return;
    }
    setMpesaBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await payments.paystack.startCheckout({ tier: "basic" });
      if (!result?.authorizationUrl || !result?.reference) {
        throw new Error("Could not start the M-Pesa payment.");
      }
      await rememberPendingPaystackReference(result.reference);
      setMpesaStarted(true);
      await openPaystackCheckout(result.authorizationUrl);
      setMpesaBusy(false);
      setStatus(
        "Finish the M-Pesa payment in the browser, then come back to this screen."
      );
    } catch (e) {
      setMpesaBusy(false);
      setError(
        e instanceof ApiClientError
          ? e.message
          : "Could not start the M-Pesa payment. Please try again."
      );
    }
  }

  async function checkMpesaPayment() {
    setMpesaBusy(true);
    setError(null);
    const result = await verifyPendingPaystackReference();
    setMpesaBusy(false);
    if (result.ok) {
      setStatus("Payment successful. Unlocking your account…");
      await refresh();
      navigate("/home", { replace: true });
    } else if (result.message) {
      setError(result.message);
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <button
          type="button"
          className="back-btn"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          ←
        </button>
        <h1>
          {isPremium
            ? "Your plan"
            : alreadyGranted
              ? "Membership"
              : membershipExpired
                ? "Renew membership"
                : "Pay to unlock"}
        </h1>
        <span />
      </header>

      <div className="plans-body">
        {isPremium || alreadyGranted ? (
          <>
            <div className="admin-pay-card">
              <strong>
                {isPremium ? "Premium active" : "Access unlocked"}
              </strong>
              <p className="muted small" style={{ margin: "0.35rem 0 0" }}>
                {isPremium
                  ? "You have full access plus personal support. No further payment is needed."
                  : `You can use Home and Discover. Membership renews every ${WAAFI_ACCESS_DAYS} days.`}
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
            {membershipExpired ? (
              <div className="admin-pay-card" style={{ marginBottom: "0.75rem" }}>
                <strong>Membership expired</strong>
                <p className="muted small" style={{ margin: "0.35rem 0 0" }}>
                  Your {WAAFI_ACCESS_DAYS}-day access ended. Pay ${priceLabel} to
                  unlock another {WAAFI_ACCESS_DAYS} days.
                </p>
              </div>
            ) : (
              <p className="muted">
                Pay ${priceLabel} to unlock matches and messaging for{" "}
                {WAAFI_ACCESS_DAYS} days. Use WaafiPay (EVC Plus, WAAFI, ZAAD,
                SAHAL) or M-Pesa.
              </p>
            )}

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

            <div
              className="admin-pay-card"
              style={{ display: "grid", gap: "0.75rem" }}
            >
              <strong>WaafiPay · mobile wallet</strong>
              {waafiEnabled === false && (
                <p className="form-error small" role="alert" style={{ margin: 0 }}>
                  WaafiPay is temporarily unavailable.
                </p>
              )}
              <p className="muted small" style={{ margin: 0 }}>
                Enter the wallet number that will receive the payment prompt.
              </p>
              <label className="muted small" htmlFor="waafi-mobile">
                Wallet number (+{WAAFI_COUNTRY_CODE})
              </label>
              <input
                id="waafi-mobile"
                className="input"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="61xxxxxxx"
                value={localMobile}
                onChange={(e) =>
                  setLocalMobile(toLocalMobileDigits(e.target.value))
                }
              />
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
              <div
                className="admin-pay-card"
                style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}
              >
                <strong>M-Pesa</strong>
                <p className="muted small" style={{ margin: 0 }}>
                  Pay with M-Pesa on Paystack's secure page. You'll get an M-Pesa
                  prompt on your phone, then come back here.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-block btn-lg"
                  disabled={mpesaBusy || paystackEnabled === null}
                  onClick={() => void payWithMpesa()}
                >
                  {mpesaBusy ? "Opening M-Pesa…" : `Pay $${priceLabel} with M-Pesa`}
                </button>
                {mpesaStarted && (
                  <button
                    type="button"
                    className="btn btn-block"
                    disabled={mpesaBusy}
                    onClick={() => void checkMpesaPayment()}
                  >
                    I've paid — check payment
                  </button>
                )}
              </div>
            )}

            <p className="muted small center" style={{ marginTop: "1rem" }}>
              <Link to="/settings">Settings</Link>
              {" · "}
              <Link to="/profile">Profile</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
