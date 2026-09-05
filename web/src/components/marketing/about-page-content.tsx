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
      <div className="max-w-[62ch] space-y-6">
        <p className="text-lg leading-relaxed text-muted-foreground">{t("aboutPage.p1")}</p>
        <p className="leading-relaxed text-muted-foreground">{t("aboutPage.p2")}</p>
        <h2 className="pt-4 font-display text-2xl font-semibold tracking-tight text-foreground">
          {t("aboutPage.valuesTitle")}
        </h2>
        <ul className="space-y-4">
          {values.map((value) => (
            <li key={value.title} className="border-l-2 border-border pl-4">
              <strong className="font-display font-semibold text-foreground">
                {value.title}
              </strong>{" "}
              <span className="text-muted-foreground">{value.desc}</span>
            </li>
          ))}
        </ul>
      </div>
    </MarketingPage>
  );
}
