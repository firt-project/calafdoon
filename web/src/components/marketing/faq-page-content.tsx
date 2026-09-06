"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { FAQAccordion } from "@/components/marketing/faq-accordion";
import { AuthRegisterCta } from "@/components/auth/auth-register-cta";
import { useTranslation } from "@/lib/i18n/context";

export function FaqPageContent() {
  const { t } = useTranslation();

  return (
    <MarketingPage title={t("faq.title")} subtitle={t("faq.subtitle")}>
      <FAQAccordion />

      <div className="mt-14 max-w-2xl rounded-3xl bg-accent p-7">
        <MessageCircle className="h-7 w-7 text-primary" />
        <h2 className="mt-3 font-display text-xl font-semibold tracking-tight text-accent-foreground">
          {t("faq.stillHaveQuestions")}
        </h2>
        <p className="mt-2 leading-relaxed text-accent-foreground/80">
          {t("faq.stillHaveQuestionsDesc")}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <AuthRegisterCta
            registerLabel={t("common.joinNow")}
            plan="basic"
            className="w-full rounded-full sm:w-auto"
            size="lg"
          />
          <Link
            href="/contact"
            className="inline-flex h-13 w-full items-center justify-center rounded-full border border-border bg-card px-6 text-sm font-semibold transition-colors hover:border-primary hover:text-primary sm:w-auto"
          >
            {t("faq.contactTeam")}
          </Link>
        </div>
      </div>
    </MarketingPage>
  );
}
