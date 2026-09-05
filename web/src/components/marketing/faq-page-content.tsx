"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { FAQAccordion } from "@/components/marketing/faq-accordion";
import { AuthRegisterCta } from "@/components/auth/auth-register-cta";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/context";

export function FaqPageContent() {
  const { t } = useTranslation();

  return (
    <MarketingPage
      eyebrow={t("landing.faqTitle")}
      title={t("faq.title")}
      subtitle={t("faq.subtitle")}
    >
      <FAQAccordion />

      <Card className="mt-14 max-w-2xl border-l-[3px] border-l-gold bg-card">
        <CardContent className="p-7">
          <MessageCircle className="h-7 w-7 text-primary" />
          <h2 className="mt-3 font-display text-xl font-semibold tracking-tight">
            {t("faq.stillHaveQuestions")}
          </h2>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            {t("faq.stillHaveQuestionsDesc")}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <AuthRegisterCta
              registerLabel={t("common.joinNow")}
              plan="basic"
              className="w-full sm:w-auto"
              size="lg"
            />
            <Link
              href="/contact"
              className="inline-flex h-13 w-full items-center justify-center rounded-lg border border-border px-6 font-mono text-[0.8rem] uppercase tracking-wide transition-colors hover:border-primary hover:text-primary sm:w-auto"
            >
              {t("faq.contactTeam")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </MarketingPage>
  );
}
