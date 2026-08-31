"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Phone, Mail, MapPin } from "lucide-react";
import { useUnifiedAuth } from "@/data/auth/hooks";
import {
  APP_NAME,
  formatMoney,
  PERSONAL_SUPPORT_PRICE,
  REGISTRATION_PRICE,
  SUPPORT_EMAIL,
  WOMEN_BASIC_PRICE,
  WHATSAPP_DISPLAY,
  WHATSAPP_URL,
} from "@/lib/constants";
import { isAppShellRoute } from "@/lib/routes";
import { useTranslation } from "@/lib/i18n/context";
import { useNavLinks } from "@/lib/i18n/hooks";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/layout/brand-logo";
import { AuthRegisterCta } from "@/components/auth/auth-register-cta";
import { AndroidDownloadLink } from "@/components/marketing/android-download-link";

const SUPPORT_LINKS = [
  { href: "/faq", label: "Help Center" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/delete-account", label: "Delete account" },
  { href: "/child-safety", label: "Child safety" },
] as const;

export function Footer() {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useUnifiedAuth();

  const { t } = useTranslation();
  const navLinks = useNavLinks();

  if (isAppShellRoute(pathname)) {
    return null;
  }

  const quickLinks = navLinks.filter((l) => l.href !== "/");

  return (
    <footer className="bg-brand-dark text-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1.2fr]">
          {/* Brand */}
          <div className="space-y-4">
            <BrandLogo variant="light" showTagline />
            <p className="text-sm text-white/70 max-w-xs">{t("brand.description")}</p>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-whatsapp/20 px-3 py-2 text-sm text-white hover:bg-whatsapp/30 transition-colors"
            >
              <span className="font-semibold">WhatsApp</span>
              <span className="text-white/80">{WHATSAPP_DISPLAY}</span>
            </a>
            <div className="space-y-1.5 pt-1">
              <AndroidDownloadLink variant="footer" className="w-full sm:w-auto" />
              <p className="text-xs text-white/55">{t("common.downloadAndroidHint")}</p>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-sm font-semibold mb-4">{t("common.quickLinks")}</h3>
            <ul className="space-y-2">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/70 hover:text-primary transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-sm font-semibold mb-4">{t("common.support")}</h3>
            <ul className="space-y-2">
              {SUPPORT_LINKS.map((link) => {
                const label =
                  link.href === "/faq"
                    ? t("common.helpCenter")
                    : link.href === "/privacy"
                      ? t("nav.privacy")
                      : link.href === "/terms"
                        ? t("nav.terms")
                        : link.href === "/delete-account"
                          ? t("nav.deleteAccount")
                          : t("nav.childSafety");
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/70 hover:text-primary transition-colors"
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-sm font-semibold mb-4">{t("common.contactUs")}</h3>
            <ul className="space-y-3">
              <li>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-white/70 hover:text-primary transition-colors"
                >
                  <Phone className="h-4 w-4 text-primary shrink-0" />
                  {WHATSAPP_DISPLAY}
                </a>
              </li>
              <li className="flex items-center gap-2 text-sm text-white/70">
                <Mail className="h-4 w-4 text-primary shrink-0" />
                {SUPPORT_EMAIL}
              </li>
              <li className="flex items-center gap-2 text-sm text-white/70">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                {t("common.locationSomalia")}
              </li>
            </ul>
          </div>

          {/* CTA Box */}
          <div className="rounded-2xl bg-primary p-6 lg:p-8">
            <h3 className="text-lg font-bold text-white">
              {t("common.readyToMatch")}
            </h3>
            <p className="mt-2 text-sm text-white/90">
              {t("common.joinPlans", {
                basic: REGISTRATION_PRICE,
                premium: PERSONAL_SUPPORT_PRICE,
                womenBasic: formatMoney(WOMEN_BASIC_PRICE),
              })}
            </p>
            {!isLoading && isAuthenticated ? (
              <Link
                href="/matches"
                className={cn(
                  "mt-4 inline-flex items-center justify-center rounded-xl bg-primary-foreground px-6 py-3 text-sm font-semibold text-primary hover:bg-primary-foreground/90 transition-colors w-full"
                )}
              >
                {t("common.goToDashboard")}
              </Link>
            ) : (
              <AuthRegisterCta
                registerLabel={t("common.joinNow")}
                className="mt-4 w-full bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                size="default"
              />
            )}
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6">
          <p className="text-center text-sm text-white/50">
            &copy; {new Date().getFullYear()} {APP_NAME}. {t("common.copyright")}
          </p>
        </div>
      </div>
    </footer>
  );
}
