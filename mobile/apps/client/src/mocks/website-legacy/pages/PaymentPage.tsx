import { Link, Navigate, useNavigate } from "react-router-dom";
import { RequireAuth } from "@/components/auth/gates";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { bumpData, useApp } from "@/hooks/use-app";
import {
  formatMoney,
  PERSONAL_SUPPORT_PRICE,
  planPricesForGender,
  PREMIUM_UPGRADE_PRICE,
  REGISTRATION_PRICE,
  WHATSAPP_URL,
  WOMEN_BASIC_PRICE,
} from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import { authService } from "@/services/auth-service";

export function PaymentPage() {
  const { t } = useTranslation();
  const { session, profile, refresh } = useApp();
  const navigate = useNavigate();

  if (!session) return <Navigate to="/login" replace />;
  if (!profile?.questionnaireComplete) return <Navigate to="/questionnaire" replace />;
  if (profile.accessUnlocked) return <Navigate to="/dashboard" replace />;

  const prices = planPricesForGender(profile.answers.gender);

  function unlock(plan: "basic" | "premium") {
    authService.unlockPlan(session!.userId, plan);
    bumpData();
    refresh();
    navigate("/dashboard");
  }

  return (
    <RequireAuth>
      <MarketingLayout>
        <section className="section">
          <div className="container">
            <h1 className="font-display">Unlock your local access (deprecated demo)</h1>
            <p className="section-sub">
              DEPRECATED: This unlocks features only in the local-demo Vite client. Production
              payments use Nest Stripe Checkout / EVC flows. Set VITE_USE_LOCAL_DEMO=false and call
              the API for real access grants.
            </p>
            <p className="section-sub" style={{ display: "none" }}>
              This standalone app does not process real card payments. Choosing a plan unlocks
              discover, likes, and chat on this device only. For live WhatsApp support, message
              the team after unlocking Premium.
            </p>
            <div className="grid-2" style={{ marginTop: "1.5rem" }}>
              <article className="plan-card">
                <h2>{t("landing.basicPlan")}</h2>
                <p className="plan-price">${formatMoney(prices.basic)}</p>
                <p className="muted">{t("landing.basicPlanDesc")}</p>
                <p className="muted" style={{ fontSize: "0.85rem" }}>
                  Reference pricing: men ${formatMoney(REGISTRATION_PRICE)} · women $
                  {formatMoney(WOMEN_BASIC_PRICE)}
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  style={{ marginTop: "1rem" }}
                  onClick={() => unlock("basic")}
                >
                  Unlock Basic locally
                </button>
              </article>
              <article className="plan-card featured">
                <span className="badge badge-gold">{t("landing.recommended")}</span>
                <h2>{t("landing.premiumPlan")}</h2>
                <p className="plan-price">${formatMoney(prices.premium)}</p>
                <p className="muted">{t("landing.premiumPlanDesc")}</p>
                <p className="muted" style={{ fontSize: "0.85rem" }}>
                  Reference: Premium ${formatMoney(PERSONAL_SUPPORT_PRICE)} / upgrade $
                  {formatMoney(PREMIUM_UPGRADE_PRICE)}
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  style={{ marginTop: "1rem" }}
                  onClick={() => unlock("premium")}
                >
                  Unlock Premium locally
                </button>
                <a
                  href={WHATSAPP_URL}
                  className="btn btn-whatsapp btn-block"
                  style={{ marginTop: "0.65rem" }}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("landing.chatWhatsApp")}
                </a>
              </article>
            </div>
            <p className="muted" style={{ marginTop: "1.25rem" }}>
              <Link to="/settings">Manage local data</Link>
            </p>
          </div>
        </section>
      </MarketingLayout>
    </RequireAuth>
  );
}
