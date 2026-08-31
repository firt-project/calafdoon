import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { matchingActions } from "@/services/matching-actions";
import {
  FAQ_ITEMS,
  formatMoney,
  PERSONAL_SUPPORT_PRICE,
  REGISTRATION_PRICE,
  SITE_BRAND_NAME,
  SUPPORT_EMAIL,
  WHATSAPP_URL,
  WOMEN_BASIC_PRICE,
  PREMIUM_UPGRADE_PRICE,
} from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import { safeErrorMessage } from "@/utils/cn";
import { z } from "zod";

export function AboutPage() {
  const { t } = useTranslation();
  return (
    <MarketingLayout>
      <section className="section">
        <div className="container-narrow">
          <h1 className="font-display">{t("aboutPage.title", { name: SITE_BRAND_NAME })}</h1>
          <p className="muted">{t("aboutPage.subtitle")}</p>
          <p>{t("aboutPage.p1")}</p>
          <p>{t("aboutPage.p2")}</p>
        </div>
      </section>
    </MarketingLayout>
  );
}

export function HowItWorksPage() {
  const { t } = useTranslation();
  return (
    <MarketingLayout>
      <section className="section">
        <div className="container">
          <h1 className="font-display">{t("nav.howItWorks")}</h1>
          <div className="grid-2" style={{ marginTop: "1.25rem" }}>
            {[1, 2, 3, 4].map((n) => (
              <article key={n} className="feature-card">
                <h2>{t(`landing.step${n}Title` as "landing.step1Title")}</h2>
                <p className="muted">{t(`landing.step${n}Desc` as "landing.step1Desc")}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}

export function PricingPage() {
  const { t } = useTranslation();
  return (
    <MarketingLayout>
      <section className="section">
        <div className="container">
          <h1 className="font-display">{t("nav.pricing")}</h1>
          <p className="section-sub">
            {t("landing.pricingSubtitle", {
              basic: formatMoney(REGISTRATION_PRICE),
              premium: formatMoney(PERSONAL_SUPPORT_PRICE),
              womenBasic: formatMoney(WOMEN_BASIC_PRICE),
              womenPremium: formatMoney(PREMIUM_UPGRADE_PRICE),
            })}
          </p>
          <div className="grid-2" style={{ marginTop: "1.25rem" }}>
            <article className="plan-card">
              <h2>{t("landing.basicPlan")}</h2>
              <p className="plan-price">${formatMoney(REGISTRATION_PRICE)}</p>
              <Link to="/register" className="btn btn-secondary btn-block">
                {t("common.joinNow")}
              </Link>
            </article>
            <article className="plan-card featured">
              <h2>{t("landing.premiumPlan")}</h2>
              <p className="plan-price">${formatMoney(PERSONAL_SUPPORT_PRICE)}</p>
              <Link to="/register" className="btn btn-primary btn-block">
                {t("common.joinNow")}
              </Link>
            </article>
          </div>
          <p className="muted" style={{ marginTop: "1rem" }}>
            In this offline app, plan selection unlocks features locally and does not charge a card.
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}

export function FaqPage() {
  const { t } = useTranslation();
  return (
    <MarketingLayout>
      <section className="section">
        <div className="container-narrow stack">
          <h1 className="font-display">{t("nav.faq")}</h1>
          {FAQ_ITEMS.map((item) => (
            <details key={item.question} className="card" style={{ padding: "1rem" }}>
              <summary style={{ fontWeight: 600, cursor: "pointer" }}>{item.question}</summary>
              <p className="muted">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}

export function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <MarketingLayout>
      <section className="section">
        <div className="container-narrow stack">
          <h1 className="font-display">{t("privacyPage.title")}</h1>
          <p className="muted">{t("privacyPage.subtitle")}</p>
          <h2>{t("privacyPage.s1Title")}</h2>
          <p>{t("privacyPage.s1Body", { name: SITE_BRAND_NAME })}</p>
          <h2>{t("privacyPage.s2Title")}</h2>
          <p>{t("privacyPage.s2Body")}</p>
          <h2>{t("privacyPage.s5Title")}</h2>
          <p>{t("privacyPage.s5Body")}</p>
          <p className="muted">
            This standalone build stores data only in your browser. Export or delete it anytime from
            Settings.
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}

export function TermsPage() {
  const { t } = useTranslation();
  return (
    <MarketingLayout>
      <section className="section">
        <div className="container-narrow stack">
          <h1 className="font-display">{t("termsPage.title")}</h1>
          <p className="muted">{t("termsPage.subtitle")}</p>
          <h2>{t("termsPage.s1Title")}</h2>
          <p>{t("termsPage.s1Body", { name: SITE_BRAND_NAME })}</p>
          <h2>{t("termsPage.s2Title")}</h2>
          <p>{t("termsPage.s2Body", { name: SITE_BRAND_NAME })}</p>
          <h2>{t("termsPage.s3Title")}</h2>
          <p>{t("termsPage.s3Body")}</p>
          <p className="muted">
            Offline plan unlocks in this app do not process Stripe payments.
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Invalid email address"),
  subject: z.string().trim().min(1, "Subject is required"),
  message: z.string().trim().min(10, "Message must be at least 10 characters"),
});

export function ContactPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const parsed = contactSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid form");
      return;
    }
    try {
      matchingActions.addContact(parsed.data);
      setSuccess("Message saved on this device. You can also reach us on WhatsApp.");
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch (err) {
      setError(safeErrorMessage(err, "Could not save message."));
    }
  }

  return (
    <MarketingLayout>
      <section className="section">
        <div className="container-narrow">
          <h1 className="font-display">{t("nav.contact")}</h1>
          <p className="muted">
            {SITE_BRAND_NAME} · {SUPPORT_EMAIL}
          </p>
          {error && <div className="form-error">{error}</div>}
          {success && <div className="form-success">{success}</div>}
          <form className="card" style={{ padding: "1.25rem" }} onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="c-name">Name</label>
              <input
                id="c-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="c-email">Email</label>
              <input
                id="c-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="c-subject">Subject</label>
              <input
                id="c-subject"
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="c-message">Message</label>
              <textarea
                id="c-message"
                rows={5}
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary">
              Save message locally
            </button>
            <a
              href={WHATSAPP_URL}
              className="btn btn-whatsapp"
              style={{ marginLeft: "0.5rem" }}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          </form>
        </div>
      </section>
    </MarketingLayout>
  );
}

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <MarketingLayout>
      <section className="section">
        <div className="container-narrow" style={{ textAlign: "center" }}>
          <h1 className="font-display">{t("notFound.title")}</h1>
          <p className="muted">{t("notFound.subtitle")}</p>
          <Link to="/" className="btn btn-primary">
            {t("notFound.backHome")}
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
