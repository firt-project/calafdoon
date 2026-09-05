"use client";

import { MarketingPage } from "@/components/marketing/marketing-page";
import { HowItWorksContent } from "@/components/marketing/how-it-works-content";
import { useTranslation } from "@/lib/i18n/context";

export function HowItWorksPageContent() {
  const { t } = useTranslation();

  return (
    <MarketingPage
      eyebrow={t("landing.howEyebrow")}
      title={t("howItWorks.title")}
      subtitle={t("howItWorks.subtitle")}
    >
      <HowItWorksContent />
    </MarketingPage>
  );
}
