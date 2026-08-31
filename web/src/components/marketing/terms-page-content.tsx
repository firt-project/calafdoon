"use client";

import { MarketingPage } from "@/components/marketing/marketing-page";
import { APP_NAME, PERSONAL_SUPPORT_PRICE, REGISTRATION_PRICE } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";

export function TermsPageContent() {
  const { t } = useTranslation();

  const priceParams = { basic: REGISTRATION_PRICE, premium: PERSONAL_SUPPORT_PRICE };
  const sections = [
    { title: t("termsPage.s1Title"), body: t("termsPage.s1Body", { name: APP_NAME }) },
    { title: t("termsPage.s2Title"), body: t("termsPage.s2Body", { name: APP_NAME }) },
    { title: t("termsPage.s3Title"), body: t("termsPage.s3Body") },
    { title: t("termsPage.s4Title"), body: t("termsPage.s4Body", priceParams) },
    { title: t("termsPage.s5Title"), body: t("termsPage.s5Body") },
    { title: t("termsPage.s6Title"), body: t("termsPage.s6Body", { name: APP_NAME }) },
  ];

  return (
    <MarketingPage title={t("termsPage.title")} subtitle={t("termsPage.subtitle")}>
      <div className="prose prose-neutral dark:prose-invert mx-auto max-w-3xl space-y-6 text-muted-foreground">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-bold text-foreground">{section.title}</h2>
            <p>{section.body}</p>
          </section>
        ))}
      </div>
    </MarketingPage>
  );
}
