import { Link, NavLink } from "react-router-dom";
import { Menu, Moon, Sun, X } from "lucide-react";
import { useState } from "react";
import { SITE_BRAND_NAME, WHATSAPP_URL } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import { useApp } from "@/hooks/use-app";
import { cn } from "@/utils/cn";

const MARKETING_LINKS = [
  { to: "/", key: "nav.home" as const },
  { to: "/about", key: "nav.about" as const },
  { to: "/how-it-works", key: "nav.howItWorks" as const },
  { to: "/pricing", key: "nav.pricing" as const },
  { to: "/faq", key: "nav.faq" as const },
  { to: "/contact", key: "nav.contact" as const },
];

export function Navbar() {
  const { t, locale, setLocale } = useTranslation();
  const { session, theme, toggleTheme } = useApp();
  const [open, setOpen] = useState(false);

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand" onClick={() => setOpen(false)}>
          {SITE_BRAND_NAME}
        </Link>
        <nav className="nav-links" aria-label="Primary">
          {MARKETING_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === "/"}>
              {t(link.key)}
            </NavLink>
          ))}
        </nav>
        <div className="nav-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={t("common.toggleLanguage")}
            onClick={() => setLocale(locale === "so" ? "en" : "so")}
          >
            {locale === "so" ? "EN" : "SO"}
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={t("common.toggleTheme")}
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {session ? (
            <Link to="/dashboard" className="btn btn-primary">
              {t("common.goToDashboard")}
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost">
                {t("nav.memberLogin")}
              </Link>
              <Link to="/register" className="btn btn-primary">
                {t("common.joinNow")}
              </Link>
            </>
          )}
          <button
            type="button"
            className="icon-btn mobile-toggle"
            aria-label={open ? t("common.a11yCloseMenu") : t("common.a11yOpenMenu")}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
      <div className={cn("mobile-nav-panel", open && "open")}>
        {MARKETING_LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.to === "/"} onClick={() => setOpen(false)}>
            {t(link.key)}
          </NavLink>
        ))}
        <a href={WHATSAPP_URL} target="_blank" rel="noreferrer">
          {t("common.a11yWhatsapp")}
        </a>
      </div>
    </header>
  );
}

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <h3 className="font-display">{SITE_BRAND_NAME}</h3>
          <p className="muted">{t("brand.description")}</p>
        </div>
        <div>
          <h3>{t("common.quickLinks")}</h3>
          <ul>
            {MARKETING_LINKS.map((link) => (
              <li key={link.to}>
                <Link to={link.to}>{t(link.key)}</Link>
              </li>
            ))}
            <li>
              <Link to="/privacy">{t("nav.privacy")}</Link>
            </li>
            <li>
              <Link to="/terms">{t("nav.terms")}</Link>
            </li>
          </ul>
        </div>
        <div>
          <h3>{t("common.support")}</h3>
          <ul>
            <li>
              <Link to="/contact">{t("common.contactUs")}</Link>
            </li>
            <li>
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            </li>
            <li>
              <Link to="/settings">Local data &amp; settings</Link>
            </li>
          </ul>
        </div>
      </div>
      <p className="container muted" style={{ marginTop: "1.5rem", fontSize: "0.9rem" }}>
        © {new Date().getFullYear()} {SITE_BRAND_NAME}. {t("common.copyright")}
      </p>
    </footer>
  );
}

export function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="site-main">{children}</main>
      <Footer />
    </div>
  );
}
