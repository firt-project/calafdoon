"use client";

import Link from "next/link";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { DeleteAccountCard } from "@/components/profile/delete-account-card";
import { Button } from "@/components/ui/button";
import { useUnifiedAuth } from "@/data/auth/hooks";
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";

function StepsBlock({ text }: { text: string }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
      {text
        .split("\n")
        .map((line) => line.replace(/^\d+\.\s*/, "").trim())
        .filter(Boolean)
        .map((line) => (
          <li key={line}>{line}</li>
        ))}
    </ol>
  );
}

export function DeleteAccountPageContent() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useUnifiedAuth();

  return (
    <MarketingPage
      title={t("deleteAccountPage.title")}
      subtitle={t("deleteAccountPage.subtitle")}
    >
      <div className="mx-auto max-w-3xl space-y-8 text-muted-foreground">
        <p className="text-base leading-relaxed">{t("deleteAccountPage.intro")}</p>

        <section className="space-y-3 rounded-2xl border border-border bg-card/60 p-5 sm:p-6">
          <h2 className="text-xl font-bold text-foreground">
            {t("deleteAccountPage.webTitle")}
          </h2>
          <StepsBlock text={t("deleteAccountPage.webSteps")} />
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card/60 p-5 sm:p-6">
          <h2 className="text-xl font-bold text-foreground">
            {t("deleteAccountPage.appTitle")}
          </h2>
          <StepsBlock text={t("deleteAccountPage.appSteps")} />
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">
            {t("deleteAccountPage.whatDeletedTitle")}
          </h2>
          <p className="leading-relaxed">{t("deleteAccountPage.whatDeletedBody")}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">
            {t("deleteAccountPage.whatRetainedTitle")}
          </h2>
          <p className="leading-relaxed">{t("deleteAccountPage.whatRetainedBody")}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">
            {t("deleteAccountPage.supportTitle")}
          </h2>
          <p className="leading-relaxed">
            {t("deleteAccountPage.supportBody", { email: SUPPORT_EMAIL })}
          </p>
          <p>
            <a
              className="font-semibold text-primary hover:underline"
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                `${APP_NAME} account deletion request`
              )}`}
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
          {!isLoading && isAuthenticated ? (
            <>
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {t("deleteAccountPage.signedInTitle")}
                </h2>
                <p className="mt-2 text-sm leading-relaxed">
                  {t("deleteAccountPage.signedInBody")}
                </p>
              </div>
              <DeleteAccountCard embedded />
              <Button asChild variant="outline" className="rounded-xl">
                <Link href="/profile">{t("deleteAccountPage.profileLink")}</Link>
              </Button>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed">
                {t("deleteAccountPage.signInCta")}
              </p>
              <Button asChild className="rounded-xl">
                <Link href="/login?next=/delete-account">
                  {t("deleteAccountPage.signInCta")}
                </Link>
              </Button>
            </div>
          )}
        </section>

        <p className="text-sm">
          <Link href="/privacy" className="font-semibold text-primary hover:underline">
            {t("deleteAccountPage.privacyLink")}
          </Link>
        </p>
      </div>
    </MarketingPage>
  );
}
