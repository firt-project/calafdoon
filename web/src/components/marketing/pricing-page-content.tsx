"use client";

import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { AuthRegisterCta } from "@/components/auth/auth-register-cta";
import { MONTHLY_PRICE, REGISTRATION_PRICE, formatMoney } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";

export function PricingPageContent() {
  const { t } = useTranslation();
  const price = formatMoney(REGISTRATION_PRICE);
  const monthly = formatMoney(MONTHLY_PRICE);

  const features = [
    t("landing.priceFeatureProfile"),
    t("landing.priceFeatureMatches"),
    t("landing.priceFeatureChat"),
    t("landing.priceFeatureLikes"),
    t("landing.priceFeatureWali"),
  ];

  return (
    <MarketingPage
      eyebrow={t("landing.priceEyebrow")}
      title={t("landing.priceTitle")}
      subtitle={t("landing.priceLead")}
    >
      <div className="flex flex-wrap items-start gap-10">
        <div className="w-full max-w-[360px] flex-1 rounded-2xl border border-border bg-card p-8 shadow-md">
          <div className="font-display text-[3rem] font-semibold leading-none tracking-tight tabular-nums">
            ${price}{" "}
            <span className="text-base font-medium text-muted-foreground">
              {t("landing.priceOnce")}
            </span>
          </div>
          <p className="mt-2.5 text-[0.9rem] font-medium text-primary">
            {t("landing.priceThen", { monthly })}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t("landing.samePriceNote")}
          </p>
          <ul className="my-6 flex flex-col gap-2.5">
            {features.map((f) => (
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

        <div className="max-w-[40ch] flex-1 space-y-5">
          <p className="font-display text-[1.5rem] font-medium italic leading-snug tracking-tight text-balance">
            {t("landing.priceCompare")}
          </p>
          <p className="text-[0.98rem] leading-relaxed text-muted-foreground">
            {t("landing.priceAsideBody", { basic: price, monthly })}
          </p>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-gold" />
            {t("payment.secureStripe")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("pricing.questions")}{" "}
            <Link
              href="/faq"
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              {t("pricing.viewFaq")}
            </Link>
          </p>
        </div>
      </div>
    </MarketingPage>
  );
}
