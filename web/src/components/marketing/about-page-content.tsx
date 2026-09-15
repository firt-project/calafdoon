"use client";

import { MarketingPage } from "@/components/marketing/marketing-page";
import { APP_NAME } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";

export function AboutPageContent() {
  const { t } = useTranslation();

  const values = [
    { title: t("aboutPage.valueHalalTitle"), desc: t("aboutPage.valueHalalDesc") },
    { title: t("aboutPage.valuePrivacyTitle"), desc: t("aboutPage.valuePrivacyDesc") },
    {
      title: t("aboutPage.valueAuthenticityTitle"),
      desc: t("aboutPage.valueAuthenticityDesc"),
    },
    {
      title: t("aboutPage.valueIntentionTitle"),
      desc: t("aboutPage.valueIntentionDesc"),
    },
  ];

  return (
    <MarketingPage
      title={t("aboutPage.title", { name: APP_NAME })}
      subtitle={t("aboutPage.subtitle")}
    >
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
        <p className="text-lg text-muted-foreground leading-relaxed">{t("aboutPage.p1")}</p>
        <p className="text-muted-foreground leading-relaxed">{t("aboutPage.p2")}</p>
        <h2 className="mt-8 text-2xl font-bold text-foreground">{t("aboutPage.valuesTitle")}</h2>
        <ul className="space-y-3 text-muted-foreground">
          {values.map((value) => (
            <li key={value.title}>
              <strong className="text-foreground">{value.title}</strong> {value.desc}
            </li>
          ))}
        </ul>
      </div>
    </MarketingPage>
  );
}
