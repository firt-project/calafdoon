"use client";

import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { AuthRegisterCta } from "@/components/auth/auth-register-cta";
import { Card, CardContent } from "@/components/ui/card";
import { REGISTRATION_PRICE, MONTHLY_PRICE, formatMoney } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";

export function PricingPageContent() {
  const { t } = useTranslation();

  const basicFeatures = [
    t("pricing.feature1"),
    t("pricing.feature2"),
    t("pricing.feature3"),
    t("pricing.feature4"),
    t("pricing.feature5"),
  ];

  return (
    <MarketingPage
      title={t("pricing.title")}
      subtitle={t("pricing.subtitleBasicOnly")}
    >
      <div className="mx-auto max-w-md">
        <Card className="rounded-3xl border-primary/30 bg-gradient-to-b from-primary/10 via-card to-card shadow-xl shadow-primary/10 ring-2 ring-primary/30">
          <CardContent className="p-8">
            <h2 className="text-xl font-bold text-center">{t("pricing.membership")}</h2>
            <div className="mt-3 text-center space-y-1">
              <div>
                <span className="text-4xl font-bold">${formatMoney(REGISTRATION_PRICE)}</span>
                <span className="text-muted-foreground ml-2">{t("common.oneTime")}</span>
              </div>
              <p className="text-sm font-semibold text-primary">
                {t("common.thenMonthly", {
                  monthly: formatMoney(MONTHLY_PRICE),
                })}
              </p>
            </div>
            <p className="text-muted-foreground mt-3 text-center text-sm leading-relaxed">
              {t("pricing.basicDesc")}
            </p>
            <p className="text-center text-xs font-medium text-primary mt-2">
              {t("landing.samePriceNote")}
            </p>
            <ul className="mt-8 space-y-3">
              {basicFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <AuthRegisterCta
              registerLabel={t("common.joinNow")}
              plan="basic"
              className="mt-8 w-full"
              size="lg"
            />
          </CardContent>
        </Card>
      </div>

      <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted-foreground leading-relaxed">
        {t("pricing.payOnceBasicOnly")}
      </p>

      <div className="mx-auto mt-8 flex max-w-xl flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {t("payment.secureStripe")}
        </span>
      </div>

      <div className="mx-auto mt-10 max-w-xl text-center">
        <p className="text-sm text-muted-foreground">{t("pricing.questions")}</p>
        <Link href="/faq" className="mt-2 inline-block text-sm font-semibold text-primary">
          {t("pricing.viewFaq")}
        </Link>
      </div>
    </MarketingPage>
  );
}
