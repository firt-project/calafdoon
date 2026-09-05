"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Check,
  Users,
  CreditCard,
  Smartphone,
  Languages,
  ArrowRight,
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

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[0.72rem] font-medium uppercase tracking-[0.16em] text-primary">
      {children}
    </p>
  );
}

function SectionHead({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: string;
}) {
  return (
    <Reveal className="mb-12 max-w-[46ch] sm:mb-14">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 font-display text-3xl font-medium leading-[1.08] tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {lead ? (
        <p className="mt-4 text-[1.0625rem] leading-relaxed text-muted-foreground">
          {lead}
        </p>
      ) : null}
    </Reveal>
  );
}

/** Example compatibility match — the hero visual. Not a real member. */
function MatchCard() {
  const { t } = useTranslation();
  const score = 82;
  const circumference = 2 * Math.PI * 32; // r = 32
  const rows = [
    { k: t("landing.matchRowDeen"), v: t("landing.matchRowValueAligned") },
    { k: t("landing.matchRowChildren"), v: t("landing.matchRowValueBoth") },
    { k: t("landing.matchRowRelocate"), v: t("landing.matchRowValueYou") },
    { k: t("landing.matchRowFamily"), v: t("landing.matchRowValueWelcome") },
  ];

  return (
    <Reveal
      delayMs={360}
      className="w-full max-w-[380px] justify-self-center lg:justify-self-end"
    >
      <div className="rounded-[1.25rem] border border-border bg-card p-6 shadow-lg">
        <div className="flex items-center gap-4 border-b border-border/70 pb-5">
          <span className="relative h-[74px] w-[74px] shrink-0">
            <svg
              width="74"
              height="74"
              viewBox="0 0 74 74"
              className="-rotate-90"
              aria-hidden
            >
              <circle
                cx="37"
                cy="37"
                r="32"
                fill="none"
                stroke="var(--border)"
                strokeWidth="6"
              />
              <circle
                cx="37"
                cy="37"
                r="32"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - score / 100)}
              />
            </svg>
            <span className="absolute inset-0 flex flex-col items-center justify-center">
              <b className="font-display text-[1.15rem] font-semibold leading-none">
                {score}%
              </b>
              <span className="font-mono text-[0.52rem] uppercase tracking-[0.1em] text-muted-foreground">
                {t("landing.matchScoreLabel")}
              </span>
            </span>
          </span>
          <span>
            <b className="block font-display text-lg font-semibold">
              {t("landing.matchExampleName")}
            </b>
            <span className="font-mono text-[0.68rem] uppercase tracking-wide text-muted-foreground">
              {t("landing.matchExampleMeta")}
            </span>
          </span>
        </div>
        <ul className="mt-[1.1rem] flex flex-col gap-3">
          {rows.map((row) => (
            <li
              key={row.k}
              className="flex items-center justify-between gap-4 text-[0.9rem]"
            >
              <span className="text-muted-foreground">{row.k}</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[0.72rem] uppercase tracking-wide text-leaf">
                <Check className="h-3.5 w-3.5" />
                {row.v}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-5 flex items-center gap-2 border-t border-border/70 pt-4 font-mono text-[0.68rem] uppercase tracking-wide text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-gold" />
          {t("landing.matchReviewedBy")}
        </p>
      </div>
    </Reveal>
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

  const payMarks = ["M-Pesa", "EVC Plus", "Hormuud", "Card"];

  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="gradient-hero border-b border-border/60">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-8">
          <div>
            <Reveal delayMs={40}>
              <Eyebrow>{t("landing.heroEyebrow")}</Eyebrow>
            </Reveal>
            <Reveal delayMs={110}>
              <h1 className="mt-5 font-display text-[2.6rem] font-medium leading-[1.02] tracking-tight text-balance sm:text-6xl">
                {t("landing.heroLine1")}
                <br />
                <em className="italic text-primary">{t("landing.heroLine2")}</em>
              </h1>
            </Reveal>
            <Reveal delayMs={190}>
              <p className="mt-6 max-w-[42ch] text-[1.24rem] leading-[1.5] text-muted-foreground">
                {t("landing.heroLead")}
              </p>
            </Reveal>
            <Reveal
              delayMs={280}
              className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4"
            >
              <AuthRegisterCta
                registerLabel={t("landing.heroCta", { price })}
                plan="basic"
                size="lg"
                className="shadow-lg"
              />
              <Link
                href="/how-it-works"
                className="inline-flex items-center gap-1.5 border-b border-border pb-0.5 font-mono text-[0.8rem] uppercase tracking-wide text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {t("landing.seeHowItWorks")}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Reveal>
            <Reveal
              delayMs={340}
              className="mt-8 flex max-w-[42ch] items-start gap-2.5 text-[0.95rem] text-muted-foreground"
            >
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <span>{t("landing.heroAssurance")}</span>
            </Reveal>
          </div>

          <MatchCard />
        </div>
      </section>

      {/* Proof strip */}
      <div className="border-b border-border/60 bg-muted/50">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 py-5 text-sm text-muted-foreground sm:px-6 lg:px-8">
          <span className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-gold" />
            {t("landing.proofReviewed")}
          </span>
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-gold" />
            {t("landing.proofReach")}
          </span>
          <span className="flex items-center gap-2">
            {t("landing.proofPayWith")}
            <span className="flex flex-wrap gap-1.5">
              {payMarks.map((m) => (
                <span
                  key={m}
                  className="rounded-md border border-border bg-card px-1.5 py-1 font-mono text-[0.64rem] font-medium uppercase tracking-wide"
                >
                  {m}
                </span>
              ))}
            </span>
          </span>
        </div>
      </div>

      {/* How it works */}
      <section className="marketing-section" id="how-it-works">
        <div className="mx-auto max-w-6xl">
          <SectionHead
            eyebrow={t("landing.howEyebrow")}
            title={t("landing.howTitle")}
            lead={t("landing.howLead")}
          />
          <ol className="grid gap-8 sm:grid-cols-3 sm:gap-8">
            {steps.map((step, i) => (
              <li
                key={step.t}
                className="border-t-2 border-primary pt-6 motion-safe:animate-reveal"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <span className="font-mono text-[0.74rem] font-medium tracking-[0.1em] text-gold">
                  {`STEP 0${i + 1}`}
                </span>
                <h3 className="mt-2 font-display text-xl font-semibold tracking-tight">
                  {step.t}
                </h3>
                <p className="mt-2 text-[0.98rem] leading-relaxed text-muted-foreground">
                  {step.d}
                </p>
              </li>
            ))}
          </ol>

          <div className="mt-12 flex max-w-[60ch] items-start gap-4 rounded-xl border border-border border-l-[3px] border-l-gold bg-card p-5">
            <span>
              <span className="mb-1.5 block font-mono text-[0.66rem] uppercase tracking-[0.12em] text-gold">
                {t("landing.floorLabel")}
              </span>
              <p className="text-[0.98rem] leading-relaxed">
                {t("landing.floorNote", { score: MIN_COMPATIBILITY_SCORE })}
              </p>
            </span>
          </div>
        </div>
      </section>

      {/* Why Hel Calafkaaga */}
      <section className="marketing-section bg-muted/50">
        <div className="mx-auto max-w-6xl">
          <SectionHead
            eyebrow={t("landing.lifeEyebrow")}
            title={<em className="italic text-primary">{t("landing.lifeTitle")}</em>}
            lead={t("landing.lifeLead")}
          />
          <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
            {life.map((item) => (
              <div key={item.t} className="bg-card p-7">
                <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-[0.6rem] border border-border text-primary">
                  <item.icon className="h-[18px] w-[18px]" />
                </span>
                <h3 className="font-display text-[1.12rem] font-semibold">
                  {item.t}
                </h3>
                <p className="mt-1.5 text-[0.95rem] leading-relaxed text-muted-foreground">
                  {item.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Safety */}
      <section className="marketing-section">
        <div className="mx-auto max-w-6xl">
          <SectionHead
            eyebrow={t("landing.safetyEyebrow")}
            title={t("landing.safetyTitle")}
            lead={t("landing.safetyLead")}
          />
          <ul className="grid max-w-[60ch] gap-x-10 gap-y-5 sm:grid-cols-2">
            {safety.map((s) => (
              <li key={s} className="flex items-start gap-3 text-[1rem]">
                <Check className="mt-1 h-4 w-4 shrink-0 text-leaf" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Pricing */}
      <section className="marketing-section bg-muted/50" id="pricing">
        <div className="mx-auto max-w-6xl">
          <SectionHead
            eyebrow={t("landing.priceEyebrow")}
            title={<em className="italic text-primary">{t("landing.priceTitle")}</em>}
            lead={t("landing.priceLead")}
          />
          <div className="flex flex-wrap items-center gap-10">
            <div className="w-full max-w-[360px] flex-1 rounded-2xl border border-border bg-card p-8 shadow-md">
              <div className="font-display text-[3rem] font-semibold leading-none tracking-tight tabular-nums">
                ${price}{" "}
                <span className="font-mono text-base font-medium text-muted-foreground">
                  {t("landing.priceOnce")}
                </span>
              </div>
              <p className="mt-2.5 font-mono text-[0.82rem] tracking-wide text-primary">
                {t("landing.priceThen", { monthly })}
              </p>
              <ul className="my-6 flex flex-col gap-2.5">
                {priceFeatures.map((f) => (
                  <li key={f} className="flex gap-2.5 text-[0.96rem]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <AuthRegisterCta
                registerLabel={t("common.joinNow")}
                plan="basic"
                size="lg"
                className="w-full"
              />
            </div>
            <div className="max-w-[40ch] flex-1">
              <p className="mb-4 font-display text-[1.5rem] font-medium italic leading-snug tracking-tight text-balance">
                {t("landing.priceCompare")}
              </p>
              <p className="text-[0.98rem] leading-relaxed text-muted-foreground">
                {t("landing.priceAsideBody", { basic: price, monthly })}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="marketing-section">
        <div className="mx-auto max-w-3xl">
          <SectionHead
            eyebrow={t("landing.faqTitle")}
            title={t("landing.faqSubtitle")}
          />
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
          <h2 className="font-display text-4xl font-medium leading-[1.05] tracking-tight text-balance sm:text-5xl">
            {t("landing.finalTitle")}
          </h2>
          <p className="mx-auto mt-4 max-w-[44ch] text-[1.1rem] text-primary-foreground/80">
            {t("landing.finalLead")}
          </p>
          <div className="mt-8 flex justify-center">
            <AuthRegisterCta
              registerLabel={t("landing.heroCta", { price })}
              plan="basic"
              size="lg"
              className="border-0 bg-primary-foreground text-primary hover:bg-primary-foreground/90"
            />
          </div>
          <p className="mt-6 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-primary-foreground/60">
            {t("landing.finalEyebrowLine")}
          </p>
        </div>
      </section>
    </div>
  );
}
