"use client";

import { MarketingPage } from "@/components/marketing/marketing-page";
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";

export function PrivacyPageContent() {
  const { t } = useTranslation();

  const sections = [
    { title: t("privacyPage.s1Title"), body: t("privacyPage.s1Body", { name: APP_NAME }) },
    { title: t("privacyPage.s2Title"), body: t("privacyPage.s2Body", { name: APP_NAME }) },
    { title: t("privacyPage.s3Title"), body: t("privacyPage.s3Body") },
    { title: t("privacyPage.s4Title"), body: t("privacyPage.s4Body") },
    { title: t("privacyPage.s5Title"), body: t("privacyPage.s5Body") },
    { title: t("privacyPage.s6Title"), body: t("privacyPage.s6Body", { email: SUPPORT_EMAIL }) },
  ];

  return (
    <MarketingPage title={t("privacyPage.title")} subtitle={t("privacyPage.subtitle")}>
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
