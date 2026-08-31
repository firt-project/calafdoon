import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { payments, ApiClientError, profile } from "@hel/api-client";
import {
  formatMoney,
  REGISTRATION_PRICE,
  WAAFI_ACCESS_DAYS,
} from "@/lib/constants";
import { useSession } from "@/features/auth/SessionProvider";

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
 * Mobile plans / paywall — WaafiPay only (no Stripe card, no EVC proof upload).
 */
export function PlansPage() {
  const navigate = useNavigate();
  const { accessState, refresh } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waafiEnabled, setWaafiEnabled] = useState<boolean | null>(null);
  const [localMobile, setLocalMobile] = useState("");
  const [profilePhone, setProfilePhone] = useState("");

  const priceLabel = formatMoney(REGISTRATION_PRICE);

  const alreadyGranted =
    accessState?.hasPaidAccess === true ||
    (accessState?.hasPaidAccess !== false &&
      (accessState?.approved === true ||
        String(accessState?.reviewStatus ?? "") === "approved"));

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
                : "Pay with WaafiPay"}
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
                  : `You can use Home and Discover. Membership renews every ${WAAFI_ACCESS_DAYS} days with WaafiPay ($${priceLabel}).`}
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
                  Your {WAAFI_ACCESS_DAYS}-day access ended. Pay ${priceLabel}{" "}
                  with WaafiPay to unlock another {WAAFI_ACCESS_DAYS} days.
                </p>
              </div>
            ) : (
              <p className="muted">
                Pay ${priceLabel} with WaafiPay to unlock matches and messaging
                for {WAAFI_ACCESS_DAYS} days. Use EVC Plus, WAAFI, ZAAD, SAHAL,
                or M-Pesa — approve the PIN on your phone.
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
            {waafiEnabled === false && (
              <div className="form-error" role="alert">
                WaafiPay is temporarily unavailable. Please try again later.
              </div>
            )}

            <div
              className="admin-pay-card"
              style={{ display: "grid", gap: "0.75rem" }}
            >
              <strong>WaafiPay · mobile wallet</strong>
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
                  busy ||
                  waafiEnabled === false ||
                  localMobile.length < 8
                }
                onClick={() => void payWithWaafi()}
              >
                {busy
                  ? "Waiting for phone approval…"
                  : `Pay $${priceLabel} with WaafiPay`}
              </button>
            </div>

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
