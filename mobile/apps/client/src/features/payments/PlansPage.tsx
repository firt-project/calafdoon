import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { payments, ApiClientError, profile } from "@hel/api-client";
import {
  formatMoney,
  MONTHLY_PRICE,
  PERSONAL_SUPPORT_PRICE,
  PREMIUM_UPGRADE_PRICE,
  REGISTRATION_PRICE,
  WAAFI_ACCESS_DAYS,
} from "@/lib/constants";
import { useSession } from "@/features/auth/SessionProvider";

type Tier = "basic" | "premium";

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

export function PlansPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { accessState, refresh } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<"basic" | "premium" | "waafi" | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [waafiEnabled, setWaafiEnabled] = useState(false);
  const [localMobile, setLocalMobile] = useState("");
  const [profilePhone, setProfilePhone] = useState("");

  const gender =
    accessState?.gender === "female" || accessState?.gender === "male"
      ? accessState.gender
      : undefined;
  const isWoman = gender === "female";
  const basicPrice = REGISTRATION_PRICE;
  const premiumPrice = isWoman ? PREMIUM_UPGRADE_PRICE : PERSONAL_SUPPORT_PRICE;
  const priceLabel = formatMoney(basicPrice);

  // Prefer server hasPaidAccess so expired Waafi/EVC members can renew.
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

  /** Paid/approved member who can still buy Premium (Settings, Home unlock, etc.). */
  const upgradeMode = alreadyGranted && !isPremium;

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
        if (!cancelled) setProfilePhone(phone);
      })
      .catch(() => {
        /* optional */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sessionId =
      searchParams.get("session_id") || searchParams.get("checkout_session_id");
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      setVerifying(true);
      setError(null);
      try {
        const { verifyPendingStripeSession } = await import(
          "@/platform/stripe-checkout"
        );
        const result = await verifyPendingStripeSession(sessionId);
        await refresh();
        if (cancelled) return;
        if (result.ok) navigate("/home", { replace: true });
        else setError(result.message ?? "Could not verify Stripe payment.");
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof ApiClientError
              ? e.message
              : "Could not verify Stripe payment. If you paid, wait a moment and reopen the app."
          );
        }
      } finally {
        if (!cancelled) setVerifying(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, refresh, searchParams]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: () => void = () => {};
    void import("@/platform/stripe-checkout").then(({ subscribeStripeReturn }) => {
      if (cancelled) return;
      unsubscribe = subscribeStripeReturn((result) => {
        void (async () => {
          if (result.silent) return;
          setVerifying(true);
          setError(null);
          setStatus(null);
          try {
            if (result.ok) {
              await refresh();
              setStatus("Payment confirmed. Unlocking your account…");
              navigate("/home", { replace: true });
            } else if (result.message) {
              setError(result.message);
            }
          } finally {
            setVerifying(false);
          }
        })();
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [navigate, refresh]);

  async function startCheckout(tier: Tier) {
    setBusy(tier);
    setError(null);
    setStatus(null);
    try {
      const {
        checkoutClient,
        openStripeCheckout,
        rememberPendingCheckoutSession,
      } = await import("@/platform/stripe-checkout");
      const client = checkoutClient();
      // Paid members upgrading must use premium-upgrade checkout (not registration).
      const res =
        upgradeMode || (alreadyGranted && tier === "premium")
          ? await payments.createPremiumUpgradeCheckout({ client })
          : tier === "premium"
            ? await payments
                .createPremiumUpgradeCheckout({ client })
                .catch(() =>
                  payments.createRegistrationCheckout("premium", { client })
                )
            : await payments.createRegistrationCheckout("basic", { client });
      const url = res.url;
      const sessionId =
        typeof res.sessionId === "string" ? res.sessionId : null;
      if (sessionId) await rememberPendingCheckoutSession(sessionId);
      if (url) {
        setStatus(
          client === "mobile"
            ? "Opening secure Stripe checkout… After paying, return to this app."
            : "Opening Stripe…"
        );
        await openStripeCheckout(url);
      } else {
        setError("Checkout did not return a URL. Check API Stripe configuration.");
      }
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Checkout failed");
    } finally {
      setBusy(null);
    }
  }

  async function payWithWaafi() {
    const digits = toLocalMobileDigits(localMobile);
    if (digits.length < 8) {
      setError("Enter your mobile number after +252 (at least 8 digits).");
      return;
    }
    if (!profilePhone) {
      setError("Add a phone number in your profile before paying with WaafiPay.");
      return;
    }
    setBusy("waafi");
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
      setBusy(null);
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
            : upgradeMode
              ? "Unlock Premium"
              : membershipExpired
                ? "Renew membership"
                : "Choose a plan"}
        </h1>
        <span />
      </header>

      <div className="plans-body">
        {isPremium ? (
          <>
            <div className="admin-pay-card">
              <strong>Premium active</strong>
              <p className="muted small" style={{ margin: "0.35rem 0 0" }}>
                You have full access plus WhatsApp personal support. No further
                payment is needed for Premium.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => navigate("/home")}
            >
              Back to Home
            </button>
            <p className="muted small center" style={{ marginTop: "1rem" }}>
              <Link to="/settings">Settings</Link>
            </p>
          </>
        ) : (
          <>
            {upgradeMode ? (
              <div className="admin-pay-card" style={{ marginBottom: "0.75rem" }}>
                <strong>Access unlocked</strong>
                <p className="muted small" style={{ margin: "0.35rem 0 0.75rem" }}>
                  You can use Home and Discover now. Premium is optional —
                  WhatsApp personal support and help finding your match.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={() => navigate("/home", { replace: true })}
                >
                  Continue to Home
                </button>
              </div>
            ) : null}

            {membershipExpired ? (
              <div className="admin-pay-card" style={{ marginBottom: "0.75rem" }}>
                <strong>Membership expired</strong>
                <p className="muted small" style={{ margin: "0.35rem 0 0" }}>
                  Your {WAAFI_ACCESS_DAYS}-day mobile wallet access ended. Pay $
                  {priceLabel} again to unlock another {WAAFI_ACCESS_DAYS} days.
                </p>
              </div>
            ) : null}

            <p className="muted">
              {upgradeMode
                ? "Or stay here to unlock Premium with Stripe."
                : `Basic is $${priceLabel} first, then $${formatMoney(MONTHLY_PRICE)}/month with card. Mobile wallet unlocks ${WAAFI_ACCESS_DAYS} days for $${priceLabel}.`}
            </p>

            {verifying && (
              <div className="form-success" role="status">
                Verifying Stripe payment…
              </div>
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

            <div className="plans-stripe" style={{ display: "grid", gap: "0.75rem" }}>
              {!upgradeMode && (
                <button
                  type="button"
                  className="btn btn-primary btn-block btn-lg"
                  disabled={busy !== null || verifying}
                  onClick={() => void startCheckout("basic")}
                >
                  {busy === "basic"
                    ? "Opening Stripe…"
                    : `Card · $${priceLabel} then $${formatMoney(MONTHLY_PRICE)}/mo`}
                </button>
              )}
              <button
                type="button"
                className={`btn ${upgradeMode ? "btn-primary" : "btn-secondary"} btn-block btn-lg`}
                disabled={busy !== null || verifying}
                onClick={() => void startCheckout("premium")}
              >
                {busy === "premium"
                  ? "Opening Stripe…"
                  : upgradeMode
                    ? `Unlock Premium · $${formatMoney(premiumPrice)}`
                    : `Premium · $${formatMoney(premiumPrice)}`}
              </button>
              <p className="muted small center">
                Secure card checkout powered by Stripe.
              </p>
            </div>

            {!upgradeMode && waafiEnabled ? (
              <div
                className="admin-pay-card"
                style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}
              >
                <strong>WaafiPay · mobile wallet</strong>
                <p className="muted small" style={{ margin: 0 }}>
                  EVC Plus, WAAFI, ZAAD, SAHAL, or M-Pesa. Approve the PIN on
                  your phone. Access lasts {WAAFI_ACCESS_DAYS} days, then renew
                  for ${priceLabel}.
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
                  className="btn btn-primary btn-block"
                  disabled={busy !== null || verifying || localMobile.length < 8}
                  onClick={() => void payWithWaafi()}
                >
                  {busy === "waafi"
                    ? "Waiting for phone approval…"
                    : `Pay $${priceLabel} with WaafiPay`}
                </button>
              </div>
            ) : null}

            <p className="muted small center" style={{ marginTop: "1rem" }}>
              <Link to="/settings">Settings</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
