"use client";

import Link from "next/link";
import { Check, Coffee, ShieldCheck } from "lucide-react";
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
      <div className="mx-auto max-w-2xl">
        <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-lg">
          <div className="h-1.5 bg-gradient-to-r from-primary via-gold to-primary" />
          <div className="p-6 sm:p-9">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-end gap-2">
                  <span className="font-display text-[3.5rem] font-semibold leading-[0.9] tracking-tight tabular-nums text-primary">
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

            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {t("landing.samePriceNote")}
            </p>

            <div className="my-7 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
                {t("landing.priceIncluded")}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {features.map((f) => (
                <li key={f} className="flex gap-2.5 text-[0.96rem]">
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
        <div className="mt-4 flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-gold" />
            {t("payment.secureStripe")}
          </p>
          <p>
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
