import { useMemo } from "react";
import {
  ArrowLeft,
  BookOpen,
  HeartHandshake,
  HelpCircle,
  Info,
  Mail,
  Scale,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { SITE_BRAND_NAME, APP_ID, SUPPORT_EMAIL } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import type { TranslationPath } from "@/lib/i18n/translations";
import { openMailTo } from "@/platform/external-links";
import {
  GUIDELINES_SECTION_COUNT,
  PRIVACY_SECTION_COUNT,
  SAFETY_INFO_SECTION_COUNT,
  TERMS_SECTION_COUNT,
} from "./legal-sections";

type LegalDocConfig = {
  pageKey: "privacyPage" | "termsPage" | "guidelinesPage" | "safetyInfoPage";
  sectionCount: number;
  icon: typeof Shield;
  highlight?: boolean;
};

function sectionKeys(
  pageKey: LegalDocConfig["pageKey"],
  index: number
): { title: TranslationPath; body: TranslationPath } {
  const n = String(index);
  return {
    title: `${pageKey}.s${n}Title` as TranslationPath,
    body: `${pageKey}.s${n}Body` as TranslationPath,
  };
}

function LegalDocumentPage({
  pageKey,
  sectionCount,
  icon: Icon,
  highlight = false,
}: LegalDocConfig) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const brand = SITE_BRAND_NAME;
  const email = SUPPORT_EMAIL;

  const sections = useMemo(
    () =>
      Array.from({ length: sectionCount }, (_, i) => {
        const keys = sectionKeys(pageKey, i + 1);
        return {
          id: `section-${i + 1}`,
          index: i + 1,
          title: t(keys.title, { name: brand, email }),
          body: t(keys.body, { name: brand, email }),
        };
      }),
    [pageKey, sectionCount, t, brand, email]
  );

  return (
    <div className="legal-screen">
      <header className="legal-topbar">
        <button
          type="button"
          className="legal-back"
          aria-label={t("legalCommon.back")}
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={20} />
        </button>
        <span className="legal-topbar-title">
          {t(`${pageKey}.title`, { name: brand, email })}
        </span>
        <span className="legal-topbar-spacer" aria-hidden />
      </header>

      <div className="legal-hero">
        <div className="legal-hero-icon" aria-hidden>
          <Icon size={26} strokeWidth={1.75} />
        </div>
        <h1 className="legal-hero-title">{t(`${pageKey}.title`, { name: brand, email })}</h1>
        <p className="legal-hero-subtitle">{t(`${pageKey}.subtitle`)}</p>
        <p className="legal-hero-intro">{t(`${pageKey}.intro`, { name: brand, email })}</p>
      </div>

      {highlight ? (
        <aside className="legal-highlight" aria-label={t("legalCommon.highlightTitle")}>
          <ShieldCheck size={20} strokeWidth={2} aria-hidden />
          <div>
            <strong>{t("legalCommon.highlightTitle")}</strong>
            <p>{t("legalCommon.highlightBody", { name: brand })}</p>
          </div>
        </aside>
      ) : null}

      <nav className="legal-toc" aria-label={t("legalCommon.tocTitle")}>
        <p className="legal-toc-label">{t("legalCommon.onThisPage")}</p>
        <div className="legal-toc-list">
          {sections.map((section) => (
            <a key={section.id} href={`#${section.id}`} className="legal-toc-chip">
              <span className="legal-toc-num">{section.index}</span>
              <span className="legal-toc-text">{section.title.replace(/^\d+\.\s*/, "")}</span>
            </a>
          ))}
        </div>
      </nav>

      <div className="legal-sections">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="legal-section">
            <div className="legal-section-head">
              <span className="legal-section-num">{section.index}</span>
              <h2>{section.title.replace(/^\d+\.\s*/, "")}</h2>
            </div>
            <div className="legal-section-body">
              {section.body.split("\n\n").map((paragraph) => (
                <p key={paragraph.slice(0, 48)}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="legal-contact">
        <div className="legal-contact-copy">
          <Mail size={20} aria-hidden />
          <div>
            <h3>{t("legalCommon.contactTitle")}</h3>
            <p>{t("legalCommon.contactDesc", { name: brand })}</p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary legal-contact-btn"
          onClick={() => void openMailTo(email, `${brand} — legal inquiry`)}
        >
          {t("legalCommon.emailUs")} {email}
        </button>
        <p className="legal-related">
          <Link to="/legal/privacy">{t("nav.privacy")}</Link>
          <span aria-hidden>·</span>
          <Link to="/legal/terms">{t("nav.terms")}</Link>
        </p>
      </footer>
    </div>
  );
}

function SimpleLegalPage({
  pageKey,
  children,
  icon: Icon,
}: {
  pageKey: "helpPage" | "aboutPage";
  children: React.ReactNode;
  icon: typeof HelpCircle;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const brand = SITE_BRAND_NAME;
  const email = SUPPORT_EMAIL;

  return (
    <div className="legal-screen legal-screen-simple">
      <header className="legal-topbar">
        <button
          type="button"
          className="legal-back"
          aria-label={t("legalCommon.back")}
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={20} />
        </button>
        <span className="legal-topbar-title">
          {t(`${pageKey}.title`, { name: brand, email })}
        </span>
        <span className="legal-topbar-spacer" aria-hidden />
      </header>

      <div className="legal-hero">
        <div className="legal-hero-icon" aria-hidden>
          <Icon size={26} strokeWidth={1.75} />
        </div>
        <h1 className="legal-hero-title">{t(`${pageKey}.title`, { name: brand, email })}</h1>
        <p className="legal-hero-intro">{t(`${pageKey}.intro`, { name: brand, email })}</p>
      </div>

      <div className="legal-simple-card">{children}</div>

      <footer className="legal-contact">
        <button
          type="button"
          className="btn btn-primary legal-contact-btn"
          onClick={() => void openMailTo(email, `${brand} — support`)}
        >
          {t("helpPage.emailCta")} {email}
        </button>
      </footer>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalDocumentPage
      pageKey="privacyPage"
      sectionCount={PRIVACY_SECTION_COUNT}
      icon={Shield}
      highlight
    />
  );
}

export function TermsPage() {
  return (
    <LegalDocumentPage
      pageKey="termsPage"
      sectionCount={TERMS_SECTION_COUNT}
      icon={Scale}
    />
  );
}

export function CommunityGuidelinesPage() {
  return (
    <LegalDocumentPage
      pageKey="guidelinesPage"
      sectionCount={GUIDELINES_SECTION_COUNT}
      icon={BookOpen}
    />
  );
}

export function SafetyPage() {
  return (
    <LegalDocumentPage
      pageKey="safetyInfoPage"
      sectionCount={SAFETY_INFO_SECTION_COUNT}
      icon={HeartHandshake}
    />
  );
}

export function HelpPage() {
  const { t } = useTranslation();
  const email = SUPPORT_EMAIL;

  return (
    <SimpleLegalPage pageKey="helpPage" icon={HelpCircle}>
      <ul className="legal-bullet-list">
        <li>{t("helpPage.point1", { email })}</li>
        <li>{t("helpPage.point2")}</li>
        <li>{t("helpPage.point3")}</li>
        <li>{t("helpPage.point4")}</li>
      </ul>
    </SimpleLegalPage>
  );
}

export function AboutPage() {
  const { t } = useTranslation();
  const brand = SITE_BRAND_NAME;

  return (
    <SimpleLegalPage pageKey="aboutPage" icon={Info}>
      <p className="legal-about-lead">
        <strong>{brand}</strong> {t("aboutPage.mission", { name: brand })}
      </p>
      <p>{t("aboutPage.details", { name: brand })}</p>
      <dl className="legal-meta">
        <div>
          <dt>{t("aboutPage.appIdLabel")}</dt>
          <dd>{APP_ID}</dd>
        </div>
        <div>
          <dt>{t("aboutPage.websiteLabel")}</dt>
          <dd>
            <a href="https://www.helcalafkaaga.com" target="_blank" rel="noreferrer">
              helcalafkaaga.com
            </a>
          </dd>
        </div>
      </dl>
    </SimpleLegalPage>
  );
}
