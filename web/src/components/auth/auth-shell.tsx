"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Sparkles, Users } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import { BrandLogo } from "@/components/layout/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Optional eyebrow above the form title (e.g. step label). */
  eyebrow?: string;
}

export function AuthShell({
  title,
  description,
  children,
  footer,
  eyebrow,
}: AuthShellProps) {
  const { t } = useTranslation();

  const features = [
    { icon: ShieldCheck, text: t("auth.feature1") },
    { icon: Users, text: t("auth.feature2") },
    { icon: Sparkles, text: t("auth.feature3") },
  ];

  return (
    <div className="auth-bg relative min-h-dvh overflow-hidden">
      {/* One quiet pomegranate wash — not a layered mesh */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(ellipse 60% 45% at 15% 15%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 60%), radial-gradient(ellipse 45% 40% at 88% 10%, color-mix(in srgb, var(--gold) 10%, transparent), transparent 55%)",
        }}
      />

      <div className="relative mx-auto grid min-h-dvh max-w-6xl lg:grid-cols-2 lg:items-stretch">
        {/* Brand plane — desktop only */}
        <aside className="relative hidden overflow-hidden px-10 py-12 lg:flex lg:flex-col lg:justify-between xl:px-14 xl:py-14">
          <div
            className="absolute inset-4 rounded-2xl bg-gradient-to-br from-brand-dark via-primary to-[#5e1626]"
            aria-hidden
          />
          <div
            className="absolute inset-4 rounded-2xl opacity-40"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse 70% 55% at 100% 0%, rgba(169,123,60,0.32), transparent 55%), radial-gradient(ellipse 55% 50% at 0% 100%, rgba(0,0,0,0.3), transparent 60%)",
            }}
          />

          <div className="relative z-10 flex h-full flex-col justify-between p-4 text-white">
            <BrandLogo href="/" variant="light" />

            <div className="max-w-md space-y-8 py-10">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="mb-3 font-mono text-[0.7rem] font-medium uppercase tracking-[0.14em] text-gold">
                  {t("brand.tagline")}
                </p>
                <h1 className="font-display text-3xl font-medium leading-tight tracking-tight text-white xl:text-4xl">
                  {t("auth.findMatch")}
                </h1>
                <p className="mt-4 text-base leading-relaxed text-white/75">
                  {t("auth.findMatchDesc")}
                </p>
              </motion.div>

              <motion.ul
                className="space-y-3"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
              >
                {features.map(({ icon: Icon, text }) => (
                  <li
                    key={text}
                    className="flex items-center gap-3 text-sm text-white/90 sm:text-base"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                      <Icon className="h-4 w-4" />
                    </span>
                    {text}
                  </li>
                ))}
              </motion.ul>
            </div>

            <p className="relative font-mono text-[0.7rem] text-white/55">
              &copy; {new Date().getFullYear()} {APP_NAME}. {t("common.copyright")}
            </p>
          </div>
        </aside>

        {/* Form plane */}
        <section className="relative flex flex-col justify-center px-4 py-8 sm:px-8 sm:py-10 lg:px-12 xl:px-16">
          <div className="absolute right-4 top-4 z-20 flex items-center gap-2 sm:right-6 sm:top-6">
            <LanguageToggle className="h-9 rounded-lg px-2.5" />
            <ThemeToggle />
          </div>

          <motion.div
            className="mx-auto w-full max-w-[26rem]"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-6 pt-8 lg:hidden">
              <BrandLogo href="/" />
            </div>

            <div className={cn("auth-form-panel space-y-6 p-5 sm:space-y-7 sm:p-7")}>
              <header className="space-y-2">
                {eyebrow ? (
                  <p className="font-mono text-[0.7rem] font-medium uppercase tracking-[0.14em] text-primary">
                    {eyebrow}
                  </p>
                ) : null}
                <h2 className="font-display text-2xl font-medium tracking-tight text-foreground sm:text-[1.75rem]">
                  {title}
                </h2>
                <p className="text-[0.98rem] leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </header>

              {children}

              {footer ? (
                <div className="border-t border-border/70 pt-5">{footer}</div>
              ) : null}
            </div>
          </motion.div>
        </section>
      </div>
    </div>
  );
}
