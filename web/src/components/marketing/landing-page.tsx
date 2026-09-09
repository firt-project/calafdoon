"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ShieldCheck,
  Check,
  Users,
  CreditCard,
  Smartphone,
  Languages,
  Coffee,
} from "lucide-react";
import { AuthRegisterCta } from "@/components/auth/auth-register-cta";
import { FAQAccordion } from "@/components/marketing/faq-accordion";
import {
  MIN_COMPATIBILITY_SCORE,
  MONTHLY_PRICE,
  REGISTRATION_PRICE,
  formatMoney,
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

function SectionHead({
  title,
  lead,
}: {
  title: ReactNode;
  lead?: string;
}) {
  return (
    <Reveal className="mb-10 max-w-2xl sm:mb-12">
      <h2 className="font-display text-3xl font-medium leading-[1.12] tracking-tight text-balance sm:text-[2.6rem]">
        {title}
      </h2>
      {lead ? (
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          {lead}
        </p>
      ) : null}
    </Reveal>
  );
}

/** Example compatibility match — a real person is never shown. */
function MatchCard() {
  const { t } = useTranslation();
  const score = 82;
  const circumference = 2 * Math.PI * 30;
  const rows = [
    { k: t("landing.matchRowDeen"), v: t("landing.matchRowValueAligned") },
    { k: t("landing.matchRowChildren"), v: t("landing.matchRowValueBoth") },
    { k: t("landing.matchRowFamily"), v: t("landing.matchRowValueWelcome") },
  ];

  return (
    <div className="w-[17rem] rounded-3xl border border-border bg-card/95 p-5 shadow-lg backdrop-blur-sm">
      <div className="flex items-center gap-3.5">
        <span className="relative h-16 w-16 shrink-0">
          <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
            <circle cx="32" cy="32" r="30" fill="none" stroke="var(--border)" strokeWidth="5" />
            <circle
              cx="32"
              cy="32"
              r="30"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - score / 100)}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-display text-lg font-semibold">
            {score}%
          </span>
        </span>
        <div className="min-w-0">
          <p className="font-display text-base font-semibold">
            {t("landing.matchExampleName")}
          </p>
          <p className="text-[0.8rem] text-muted-foreground">
            {t("landing.matchExampleMeta")}
          </p>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.k} className="flex items-center justify-between gap-3 text-[0.85rem]">
            <span className="text-muted-foreground">{row.k}</span>
            <span className="inline-flex items-center gap-1 font-medium text-leaf">
              <Check className="h-3.5 w-3.5" />
              {row.v}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-center gap-1.5 border-t border-border/70 pt-3 text-[0.78rem] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-gold" />
        {t("landing.matchReviewedBy")}
      </p>
    </div>
  );
}

export function LandingPage() {
  const { t } = useTranslation();
  const price = formatMoney(REGISTRATION_PRICE);
  const monthly = formatMoney(MONTHLY_PRICE);

  const steps = [
    { t: t("landing.howStep1Title"), d: t("landing.howStep1Desc") },
    { t: t("landing.howStep2Title"), d: t("landing.howStep2Desc") },
    { t: t("landing.howStep3Title"), d: t("landing.howStep3Desc") },
  ];

  const life = [
    { icon: Users, t: t("landing.lifeFamilyTitle"), d: t("landing.lifeFamilyDesc") },
    { icon: CreditCard, t: t("landing.lifePayTitle"), d: t("landing.lifePayDesc") },
    { icon: Smartphone, t: t("landing.lifePhoneTitle"), d: t("landing.lifePhoneDesc") },
    { icon: Languages, t: t("landing.lifeLangTitle"), d: t("landing.lifeLangDesc") },
  ];

  const safety = [
    t("landing.safe1"),
    t("landing.safe2"),
    t("landing.safe3"),
    t("landing.safe4"),
  ];

  const priceFeatures = [
    t("landing.priceFeatureProfile"),
    t("landing.priceFeatureMatches"),
    t("landing.priceFeatureChat"),
    t("landing.priceFeatureLikes"),
    t("landing.priceFeatureWali"),
  ];

  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="gradient-hero">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:px-8">
          <div className="min-w-0">
            <Reveal delayMs={40}>
              <span className="inline-flex max-w-full items-center gap-2 rounded-2xl bg-accent px-3.5 py-1.5 text-[0.78rem] font-semibold text-primary">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {t("landing.heroEyebrow")}
              </span>
            </Reveal>
            <Reveal delayMs={110}>
              <h1 className="mt-5 font-display text-[2.7rem] font-medium leading-[1.05] tracking-tight text-balance sm:text-[3.75rem]">
                {t("landing.heroLine1")}{" "}
                <span className="italic text-primary">{t("landing.heroLine2")}</span>
              </h1>
            </Reveal>
            <Reveal delayMs={180}>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-muted-foreground sm:text-xl">
                {t("landing.heroLead")}
              </p>
            </Reveal>
            <Reveal delayMs={260} className="mt-8 flex flex-wrap items-center gap-4">
              <AuthRegisterCta
                registerLabel={t("landing.heroCta", { price })}
                plan="basic"
                size="lg"
                className="min-h-13 h-auto whitespace-normal rounded-full px-6 py-2.5 text-center text-[15px] leading-snug shadow-lg shadow-primary/20 sm:px-8"
              />
              <Link
                href="/how-it-works"
                className="text-[15px] font-semibold text-foreground/80 underline-offset-4 transition-colors hover:text-primary hover:underline"
              >
                {t("landing.seeHowItWorks")}
              </Link>
            </Reveal>
            <Reveal
              delayMs={330}
              className="mt-7 flex max-w-sm items-start gap-2.5 text-[0.95rem] text-muted-foreground"
            >
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <span>{t("landing.heroAssurance")}</span>
            </Reveal>
          </div>

          <Reveal
            delayMs={220}
            className="relative mx-auto w-full max-w-lg lg:mx-0 lg:ml-auto"
          >
            <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] shadow-lg sm:aspect-square">
              <Image
                src="/images/hero-couple.webp"
                alt=""
                fill
                priority
                sizes="(max-width: 1024px) 90vw, 45vw"
                className="object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-brand-dark/25 via-transparent to-transparent" />
            </div>
            <div
              className="absolute -bottom-6 -left-4 hidden sm:block motion-safe:animate-reveal"
              style={{ animationDelay: "440ms" }}
            >
              <MatchCard />
            </div>
          </Reveal>
          <div className="-mt-4 flex justify-center sm:hidden">
            <MatchCard />
          </div>
        </div>
      </section>

      {/* Proof */}
      <div className="border-y border-border/60 bg-card">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-x-10 gap-y-3 px-4 py-6 text-center text-[0.95rem] text-muted-foreground sm:flex-row sm:justify-between sm:px-6 sm:text-left lg:px-8">
          <span className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-gold" />
            {t("landing.proofReviewed")}
          </span>
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-gold" />
            {t("landing.proofReach")}
          </span>
          <span className="flex flex-wrap items-center justify-center gap-2">
            {t("landing.proofPayWith")}
            <span className="font-semibold text-foreground/80">
              M-Pesa · EVC Plus · Hormuud
            </span>
          </span>
        </div>
      </div>

      {/* How it works */}
      <section className="marketing-section" id="how-it-works">
        <div className="mx-auto max-w-6xl">
          <SectionHead title={t("landing.howTitle")} lead={t("landing.howLead")} />
          <ol className="grid gap-5 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li
                key={step.t}
                className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm motion-safe:animate-reveal"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <span className="font-display text-3xl font-semibold text-primary/70">
                  {i + 1}
                </span>
                <h3 className="mt-2 font-display text-xl font-semibold tracking-tight">
                  {step.t}
                </h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">
                  {step.d}
                </p>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex max-w-2xl items-start gap-3.5 rounded-3xl bg-accent p-6">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
              <Check className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <p className="leading-relaxed text-accent-foreground">
              <span className="font-display font-semibold">
                {t("landing.floorLabel")}.
              </span>{" "}
              {t("landing.floorNote", { score: MIN_COMPATIBILITY_SCORE })}
            </p>
          </div>
        </div>
      </section>

      {/* Warm photo band */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/images/hero-couple.webp"
            alt=""
            fill
            sizes="100vw"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-brand-dark/[0.78]" />
        </div>
        <div className="relative mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-24">
          <p className="font-display text-2xl font-medium italic leading-snug text-white text-balance sm:text-[2rem]">
            &ldquo;{t("landing.quote")}&rdquo;
          </p>
          <p className="mt-4 text-sm font-medium uppercase tracking-wide text-white/60">
            {t("landing.quoteAuthor")}
          </p>
        </div>
      </section>

      {/* Why Hel Calafkaaga */}
      <section className="marketing-section" id="why">
        <div className="mx-auto max-w-6xl">
          <SectionHead title={t("landing.lifeTitle")} lead={t("landing.lifeLead")} />
          <div className="grid gap-5 sm:grid-cols-2">
            {life.map((item) => (
              <div
                key={item.t}
                className="flex gap-4 rounded-3xl border border-border/70 bg-card p-6 shadow-sm"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <item.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-display text-lg font-semibold">{item.t}</h3>
                  <p className="mt-1.5 leading-relaxed text-muted-foreground">
                    {item.d}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Safety */}
      <section className="marketing-section bg-muted/40">
        <div className="mx-auto max-w-6xl">
          <SectionHead
            title={t("landing.safetyTitle")}
            lead={t("landing.safetyLead")}
          />
          <ul className="grid max-w-3xl gap-x-10 gap-y-5 sm:grid-cols-2">
            {safety.map((s) => (
              <li
                key={s}
                className="flex items-start gap-3 text-[1.05rem] leading-relaxed"
              >
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-leaf/15 text-leaf">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Pricing */}
      <section className="marketing-section" id="pricing">
        <div className="mx-auto max-w-3xl">
          <SectionHead title={t("landing.priceTitle")} lead={t("landing.priceLead")} />

          <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-lg">
            <div className="h-1.5 bg-gradient-to-r from-primary via-gold to-primary" />
            <div className="p-6 sm:p-9">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-muted-foreground">
                    {t("landing.priceEyebrow")}
                  </p>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="font-display text-[3.75rem] font-semibold leading-[0.9] tracking-tight text-primary">
                      ${price}
                    </span>
                    <span className="pb-2 text-base text-muted-foreground">
                      {t("landing.priceOnce")}
                    </span>
                  </div>
                  <p className="mt-2.5 flex items-center gap-2 text-[0.95rem] text-muted-foreground">
                    <Coffee className="h-4 w-4 shrink-0 text-gold" />
                    {t("landing.priceCoffee")}
                  </p>
                  <p className="mt-1 text-[0.95rem] font-medium text-primary">
                    {t("landing.priceThen", { monthly })}
                  </p>
                </div>
                <AuthRegisterCta
                  registerLabel={t("common.joinNow")}
                  plan="basic"
                  size="lg"
                  className="min-h-13 h-auto w-full shrink-0 whitespace-normal rounded-full px-6 py-2.5 text-center leading-snug sm:w-auto sm:px-8"
                />
              </div>

              <div className="my-7 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
                  {t("landing.priceIncluded")}
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {priceFeatures.map((f) => (
                  <li key={f} className="flex gap-3 text-[0.98rem]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mx-auto mt-6 max-w-xl text-center text-[0.95rem] leading-relaxed text-muted-foreground">
            {t("landing.priceAsideBody", { basic: price, monthly })}
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="marketing-section bg-muted/40">
        <div className="mx-auto max-w-3xl">
          <SectionHead title={t("landing.faqSubtitle")} />
          <FAQAccordion
            limit={4}
            viewAllHref="/faq"
            viewAllLabel={t("landing.viewAllFaq")}
          />
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-primary py-20 text-center text-primary-foreground">
        <div className="mx-auto max-w-2xl px-4">
          <h2 className="font-display text-[2.25rem] font-medium leading-[1.08] tracking-tight text-balance sm:text-[3rem]">
            {t("landing.finalTitle")}
          </h2>
          <p className="mx-auto mt-4 max-w-md text-lg text-primary-foreground/80">
            {t("landing.finalLead")}
          </p>
          <div className="mt-8 flex justify-center">
            <AuthRegisterCta
              registerLabel={t("landing.heroCta", { price })}
              plan="basic"
              size="lg"
              className="min-h-13 h-auto whitespace-normal rounded-full border-0 bg-primary-foreground px-6 py-2.5 text-center text-[15px] leading-snug text-primary hover:bg-primary-foreground/90 sm:px-8"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
