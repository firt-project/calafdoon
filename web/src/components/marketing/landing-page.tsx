"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Shield,
  Lock,
  Landmark,
  UserPlus,
  Search,
  MessageCircleHeart,
  ClipboardList,
  ArrowRight,
  Check,
} from "lucide-react";
import { AuthRegisterCta } from "@/components/auth/auth-register-cta";
import { Button } from "@/components/ui/button";
import { FAQAccordion } from "@/components/marketing/faq-accordion";
import {
  HOW_TO_USE_YOUTUBE_ID,
  MIN_COMPATIBILITY_SCORE,
  REGISTRATION_PRICE,
  SITE_BRAND_NAME,
} from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

function Reveal({
  children,
  className,
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  return (
    <div
      className={cn("motion-safe:animate-reveal", className)}
      style={delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}

export function LandingPage() {
  const { t } = useTranslation();

  const steps = [
    { icon: UserPlus, title: t("landing.step1Title"), desc: t("landing.step1Desc") },
    { icon: ClipboardList, title: t("landing.step2Title"), desc: t("landing.step2Desc") },
    { icon: Search, title: t("landing.step3Title"), desc: t("landing.step3Desc") },
    { icon: MessageCircleHeart, title: t("landing.step4Title"), desc: t("landing.step4Desc") },
  ];

  const values = [
    { icon: Landmark, title: t("landing.heroFeature4"), desc: t("landing.whyPay1Desc") },
    { icon: Shield, title: t("landing.heroFeature2"), desc: t("landing.whyPay2Desc") },
    { icon: Lock, title: t("landing.heroFeature3"), desc: t("landing.whyPay4Desc") },
  ];

  const basicFeatures = [
    t("landing.basicFeature1"),
    t("landing.basicFeature2"),
    t("landing.basicFeature3"),
    t("landing.basicFeature4"),
    t("landing.basicFeature5"),
  ];

  return (
    <div className="overflow-hidden">
      {/* Hero — message-first hierarchy with how-to video */}
      <section
        id="how-to-use"
        className="relative overflow-hidden bg-[#120d0e] scroll-mt-20"
      >
        <div className="absolute inset-0 motion-safe:animate-hero-zoom">
          <Image
            src="/images/hero-couple.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-[72%_center] sm:object-[center_28%]"
            aria-hidden
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/35 sm:via-black/50 sm:to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/35" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--background)] to-transparent opacity-90" />

        <div className="relative mx-auto w-full max-w-7xl px-4 pb-14 pt-20 sm:px-6 sm:pb-20 sm:pt-24 lg:px-8 lg:pb-24 lg:pt-28">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-12">
            <div className="max-w-xl">
              <p
                className="motion-safe:animate-hero-rise text-sm font-medium tracking-wide text-gold sm:text-base"
                style={{ animationDelay: "70ms" }}
              >
                {SITE_BRAND_NAME}
              </p>

              <h1
                className="motion-safe:animate-hero-rise mt-3 font-display text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl lg:text-[2.5rem]"
                style={{ animationDelay: "120ms" }}
              >
                {t("landing.heroTitle")}{" "}
                <span className="text-white/85">{t("landing.heroHighlight")}</span>
              </h1>

              <p
                className="motion-safe:animate-hero-rise mt-4 max-w-md text-base leading-relaxed text-white/80 sm:mt-5 sm:text-lg"
                style={{ animationDelay: "200ms" }}
              >
                {t("landing.heroDesc")}
              </p>

              <div
                className="motion-safe:animate-hero-rise mt-8 flex flex-col items-stretch gap-3 sm:mt-9 sm:flex-row sm:items-center"
                style={{ animationDelay: "280ms" }}
              >
                <AuthRegisterCta
                  registerLabel={t("common.joinNow")}
                  className="h-12 rounded-2xl px-8 text-base shadow-lg shadow-black/25"
                  size="lg"
                />
                <Link
                  href="/how-it-works"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-2 text-sm font-semibold text-white/90 transition-colors hover:text-white sm:px-4"
                >
                  {t("landing.seeHowItWorks")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div
              className="motion-safe:animate-hero-rise w-full"
              style={{ animationDelay: "400ms" }}
            >
              <p className="mb-3 text-sm font-medium text-white/80 sm:text-base">
                {t("landing.videoTitle")}
              </p>
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black/80 ring-1 ring-white/15 shadow-xl shadow-black/30">
                <iframe
                  src={`https://www.youtube.com/embed/${HOW_TO_USE_YOUTUBE_ID}?rel=0`}
                  title={t("landing.videoIframeTitle")}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="absolute inset-0 h-full w-full border-0"
                />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/70 sm:text-base">
                {t("landing.videoDesc")}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="why-trust" className="marketing-section scroll-mt-20 gradient-hero">
        <div className="mx-auto max-w-5xl">
          <Reveal className="marketing-section-intro text-center max-w-2xl mx-auto mb-12 sm:mb-14">
            <h2 className="marketing-h2 landing-section-title">
              {t("landing.badge")}
            </h2>
            <p className="mt-4 marketing-lead">
              {t("landing.previewSubtitle")}
            </p>
          </Reveal>

          <div className="grid gap-8 sm:grid-cols-3 sm:gap-10">
            {values.map((item, i) => (
              <Reveal key={item.title} delayMs={i * 80} className="text-center sm:text-left">
                <div className="mx-auto sm:mx-0 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 marketing-body">
                  {item.desc}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section bg-muted/50">
        <div className="mx-auto max-w-6xl">
          <Reveal className="text-center max-w-2xl mx-auto mb-12 sm:mb-14">
            <h2 className="marketing-h2 landing-section-title">
              {t("landing.howWorks")}
            </h2>
          </Reveal>

          <ol className="grid gap-8 sm:grid-cols-2 sm:gap-10 lg:grid-cols-4">
            {steps.map((step, i) => (
              <li key={step.title} className="relative motion-safe:animate-reveal" style={{ animationDelay: `${i * 70}ms` }}>
                <span className="font-display text-3xl font-semibold text-primary/25 sm:text-4xl">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="mt-3 flex h-11 w-11 items-center justify-center rounded-xl bg-card border border-border text-primary shadow-sm">
                  <step.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold sm:text-lg">{step.title}</h3>
                <p className="mt-2 marketing-body">
                  {step.desc}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="marketing-section">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-gold">
            {t("landing.stat1")}
          </p>
          <h2 className="mt-3 marketing-h2">
            {t("landing.matchingTitle")}
          </h2>
          <p className="mt-4 marketing-lead sm:mt-5">
            {t("landing.matchingDesc", { score: MIN_COMPATIBILITY_SCORE })}
          </p>
        </Reveal>
      </section>

      <section className="marketing-section bg-muted/50">
        <div className="mx-auto max-w-5xl">
          <Reveal className="text-center max-w-2xl mx-auto mb-10 sm:mb-12">
            <h2 className="marketing-h2 landing-section-title">
              {t("landing.pricingTitle")}
            </h2>
            <p className="mt-4 marketing-lead">
              {t("landing.pricingBasicOnly", {
                basic: REGISTRATION_PRICE,
              })}
            </p>
          </Reveal>

          <div className="mx-auto max-w-md">
            <Reveal className="rounded-2xl border border-primary/30 bg-card p-6 shadow-md sm:p-8">
              <h3 className="text-lg font-semibold sm:text-xl">{t("landing.basicPlan")}</h3>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-display text-4xl font-semibold text-primary sm:text-[2.75rem]">
                  ${REGISTRATION_PRICE}
                </span>
                <span className="text-sm text-muted-foreground">{t("common.oneTime")}</span>
              </div>
              <p className="mt-2 text-sm font-medium text-primary">
                {t("landing.samePriceNote")}
              </p>
              <ul className="mt-6 space-y-3">
                {basicFeatures.map((feature) => (
                  <li key={feature} className="flex gap-3 marketing-body">
                    <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <AuthRegisterCta
                registerLabel={t("common.joinNow")}
                plan="basic"
                className="w-full mt-8"
              />
            </Reveal>
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <div className="mx-auto max-w-3xl">
          <Reveal className="text-center mb-10 sm:mb-12">
            <h2 className="marketing-h2 landing-section-title">
              {t("landing.faqTitle")}
            </h2>
            <p className="mt-4 marketing-lead">{t("landing.faqSubtitle")}</p>
          </Reveal>
          <FAQAccordion
            limit={4}
            viewAllHref="/faq"
            viewAllLabel={t("landing.viewAllFaq")}
          />
        </div>
      </section>

      <section className="marketing-section pt-0 sm:pt-0">
        <Reveal className="mx-auto max-w-4xl rounded-3xl bg-brand-dark px-6 py-10 sm:px-12 sm:py-14 text-center text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(201,162,39,0.18),transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(16,185,129,0.2),transparent_50%)]" />
          <div className="relative">
            <h2 className="marketing-h2 text-white">
              {t("landing.finalCtaTitle")}
            </h2>
            <p className="mt-4 text-base text-white/80 max-w-xl mx-auto leading-relaxed sm:text-lg">
              {t("landing.finalCtaDesc")}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <AuthRegisterCta
                registerLabel={t("common.joinNow")}
                className="bg-gold text-gold-foreground hover:bg-gold/90 border-0"
              />
              <Button
                asChild
                variant="outline"
                className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/pricing">
                  {t("nav.pricing")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
