import { Link } from "react-router-dom";
import { ArrowRight, Check, ClipboardList, Lock, MessageCircleHeart, Search, Shield, UserPlus } from "lucide-react";
import {
  formatMoney,
  HOW_TO_USE_YOUTUBE_EMBED_URL,
  MIN_COMPATIBILITY_SCORE,
  PERSONAL_SUPPORT_PRICE,
  PREMIUM_UPGRADE_PRICE,
  REGISTRATION_PRICE,
  SITE_BRAND_NAME,
  WHATSAPP_URL,
  WOMEN_BASIC_PRICE,
} from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import { MarketingLayout } from "@/components/layout/MarketingLayout";

export function HomePage() {
  const { t } = useTranslation();

  const steps = [
    { icon: UserPlus, title: t("landing.step1Title"), desc: t("landing.step1Desc") },
    { icon: ClipboardList, title: t("landing.step2Title"), desc: t("landing.step2Desc") },
    { icon: Search, title: t("landing.step3Title"), desc: t("landing.step3Desc") },
    { icon: MessageCircleHeart, title: t("landing.step4Title"), desc: t("landing.step4Desc") },
  ];

  return (
    <MarketingLayout>
      <section className="hero">
        <div className="hero-media" aria-hidden />
        <div className="hero-content">
          <p className="hero-brand font-display">{SITE_BRAND_NAME}</p>
          <div className="gold-rule" />
          <h1>
            {t("landing.heroTitle")}{" "}
            <span style={{ opacity: 0.85 }}>{t("landing.heroHighlight")}</span>
          </h1>
          <p style={{ marginTop: "1.15rem", opacity: 0.85, maxWidth: "28rem" }}>
            {t("landing.heroDesc")}
          </p>
          <div className="row" style={{ marginTop: "1.75rem" }}>
            <Link to="/register" className="btn btn-primary btn-lg">
              {t("common.joinNow")}
            </Link>
            <Link to="/how-it-works" className="btn btn-ghost" style={{ color: "#fff" }}>
              {t("landing.seeHowItWorks")} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container stack">
          <h2 className="section-title">{t("landing.videoTitle")}</h2>
          <p className="section-sub">{t("landing.videoDesc")}</p>
          <div
            style={{
              borderRadius: "1.25rem",
              overflow: "hidden",
              border: "1px solid var(--border)",
              aspectRatio: "16 / 9",
              background: "#000",
            }}
          >
            <iframe
              title={t("landing.videoIframeTitle")}
              src={HOW_TO_USE_YOUTUBE_EMBED_URL}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ width: "100%", height: "100%", border: 0 }}
            />
          </div>
        </div>
      </section>

      <section className="section" style={{ background: "var(--muted)" }}>
        <div className="container">
          <h2 className="section-title">{t("landing.howWorks")}</h2>
          <div className="grid-2" style={{ marginTop: "1.5rem" }}>
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <article key={step.title} className="feature-card reveal">
                  <Icon color="var(--primary)" size={22} />
                  <h3 style={{ margin: "0.6rem 0 0.35rem" }}>{step.title}</h3>
                  <p className="muted" style={{ margin: 0 }}>
                    {step.desc}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section" id="pricing">
        <div className="container">
          <h2 className="section-title">{t("landing.pricingTitle")}</h2>
          <p className="section-sub">
            {t("landing.pricingSubtitle", {
              basic: formatMoney(REGISTRATION_PRICE),
              premium: formatMoney(PERSONAL_SUPPORT_PRICE),
              womenBasic: formatMoney(WOMEN_BASIC_PRICE),
              womenPremium: formatMoney(PREMIUM_UPGRADE_PRICE),
            })}
          </p>
          <div className="grid-2" style={{ marginTop: "1.5rem" }}>
            <article className="plan-card">
              <h3>{t("landing.basicPlan")}</h3>
              <p className="muted">{t("landing.basicPlanDesc")}</p>
              <p className="plan-price">${formatMoney(REGISTRATION_PRICE)}</p>
              <ul className="checklist">
                {[1, 2, 3, 4, 5].map((n) => (
                  <li key={n}>
                    <Check size={16} color="var(--primary)" />
                    {t(`landing.basicFeature${n}` as "landing.basicFeature1")}
                  </li>
                ))}
              </ul>
              <Link to="/register" className="btn btn-secondary btn-block" style={{ marginTop: "1rem" }}>
                {t("common.joinNow")}
              </Link>
            </article>
            <article className="plan-card featured">
              <span className="badge badge-gold">{t("landing.recommended")}</span>
              <h3>{t("landing.premiumPlan")}</h3>
              <p className="muted">{t("landing.premiumPlanDesc")}</p>
              <p className="plan-price">${formatMoney(PERSONAL_SUPPORT_PRICE)}</p>
              <ul className="checklist">
                {[1, 2, 3].map((n) => (
                  <li key={n}>
                    <Check size={16} color="var(--gold)" />
                    {t(`landing.premiumFeature${n}` as "landing.premiumFeature1")}
                  </li>
                ))}
              </ul>
              <Link to="/register" className="btn btn-primary btn-block" style={{ marginTop: "1rem" }}>
                {t("common.joinNow")}
              </Link>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container grid-3">
          <article className="feature-card">
            <Shield color="var(--primary)" />
            <h3>{t("landing.heroFeature2")}</h3>
            <p className="muted">{t("landing.whyPay2Desc")}</p>
          </article>
          <article className="feature-card">
            <Lock color="var(--primary)" />
            <h3>{t("landing.heroFeature3")}</h3>
            <p className="muted">{t("landing.whyPay4Desc")}</p>
          </article>
          <article className="feature-card">
            <MessageCircleHeart color="var(--primary)" />
            <h3>{t("landing.matchingTitle")}</h3>
            <p className="muted">
              {t("landing.matchingDesc", { score: MIN_COMPATIBILITY_SCORE })}
            </p>
          </article>
        </div>
      </section>

      <section className="section" id="success-stories" style={{ background: "var(--muted)" }}>
        <div className="container">
          <h2 className="section-title">{t("landing.successStories")}</h2>
          <div className="grid-3" style={{ marginTop: "1.25rem" }}>
            {[1, 2, 3].map((n) => (
              <article key={n} className="story-card">
                <p style={{ fontStyle: "italic" }}>
                  “{t(`landing.story${n}Quote` as "landing.story1Quote")}”
                </p>
                <p className="muted" style={{ marginBottom: 0 }}>
                  {t(`landing.story${n}Location` as "landing.story1Location")}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ textAlign: "center" }}>
          <h2 className="section-title">{t("landing.finalCtaTitle")}</h2>
          <p className="section-sub" style={{ marginInline: "auto" }}>
            {t("landing.finalCtaDesc")}
          </p>
          <div className="row" style={{ justifyContent: "center", marginTop: "1.25rem" }}>
            <Link to="/register" className="btn btn-primary btn-lg">
              {t("common.joinNow")}
            </Link>
            <a href={WHATSAPP_URL} className="btn btn-whatsapp btn-lg" target="_blank" rel="noreferrer">
              {t("landing.chatWhatsApp")}
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
