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
    <MarketingPage title={t("faq.title")} subtitle={t("faq.subtitle")}>
      <FAQAccordion />

      <Card className="mx-auto mt-12 max-w-3xl rounded-3xl border-border/80 bg-card/80">
        <CardContent className="p-8 text-center">
          <MessageCircle className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-4 text-xl font-bold">{t("faq.stillHaveQuestions")}</h2>
          <p className="mt-2 text-muted-foreground leading-relaxed">{t("faq.stillHaveQuestionsDesc")}</p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <AuthRegisterCta
              registerLabel={t("common.joinNow")}
              className="w-full sm:w-auto"
              size="lg"
            />
            <Link
              href="/contact"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-border px-6 text-sm font-semibold transition-colors hover:bg-accent sm:w-auto"
            >
              {t("faq.contactTeam")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </MarketingPage>
  );
}
