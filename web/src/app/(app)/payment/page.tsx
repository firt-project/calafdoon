"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProfile } from "@/data/profile/hooks";
import type { Profile } from "@/types";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { MemberDataLoading } from "@/components/auth/member-data-loading";
import { Skeleton } from "@/components/ui/skeleton";
import { DataLoadError } from "@/components/ui/data-load-error";
import { PaymentGate } from "@/components/payment/payment-gate";
import { useTranslation } from "@/lib/i18n/context";
import { hasPaidAccess, isStaffRole } from "@/lib/access";
import { isTrialExpired } from "@/lib/trial";
import { formatMoney, planPricesForGender } from "@/lib/constants";
import { toast } from "sonner";
import { useMarkNotificationsRead } from "@/hooks/use-mark-notifications-read";

export default function PaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canceled = searchParams.get("canceled") === "true";
  const {
    profile: profileRaw,
    error: profileError,
    refresh: refreshProfile,
  } = useProfile();
  const profile = profileRaw as Profile | null | undefined;
  const { t } = useTranslation();

  useMarkNotificationsRead(["payment"], profile !== undefined);

  useEffect(() => {
    if (canceled) {
      toast.message(t("payment.paymentCanceled"));
    }
  }, [canceled, t]);

  useEffect(() => {
    if (isStaffRole(profile?.role)) {
      router.replace("/admin");
      return;
    }
    if (profile?.registrationComplete === false) {
      router.replace("/register/details");
      return;
    }
    if (profile && !profile.questionnaireComplete) {
      router.replace("/questionnaire");
      return;
    }
    if (profile && hasPaidAccess(profile)) {
      router.replace("/matches");
    }
  }, [
    profile?.registrationComplete,
    profile?.questionnaireComplete,
    profile?.hasPaid,
    profile?.paidUntil,
    profile?.trialEndsAt,
    profile?.role,
    router,
  ]);

  if (profile === undefined) {
    return (
      <DashboardLayout>
        <MemberDataLoading pending />
      </DashboardLayout>
    );
  }

  if (!profile) {
    return (
      <DashboardLayout>
        <DataLoadError
          message={profileError ?? t("payment.profileNotFound")}
          onRetry={() => void refreshProfile()}
        />
      </DashboardLayout>
    );
  }

  if (!profile.questionnaireComplete || hasPaidAccess(profile)) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto text-center py-16">
          <Skeleton className="h-8 w-48 mx-auto" />
        </div>
      </DashboardLayout>
    );
  }

  const needsRenewal =
    profile.hasPaid === true && !hasPaidAccess(profile);

  return (
    <DashboardLayout>
      <PaymentGate
        gender={profile.gender === "female" || profile.gender === "male" ? profile.gender : undefined}
        title={
          needsRenewal
            ? t("payment.membershipRenewTitle")
            : isTrialExpired(profile)
              ? t("payment.trialEndedTitle")
              : t("payment.profileReadyTitle")
        }
        description={
          needsRenewal
            ? t("payment.membershipRenewDesc", {
                basic: formatMoney(planPricesForGender(profile.gender).basic),
              })
            : isTrialExpired(profile)
              ? t("payment.trialEndedDesc", {
                  basic: formatMoney(planPricesForGender(profile.gender).basic),
                  premium: formatMoney(planPricesForGender(profile.gender).premium),
                  monthly: formatMoney(planPricesForGender(profile.gender).monthly),
                })
              : t("payment.profileReadyDesc", {
                  basic: formatMoney(planPricesForGender(profile.gender).basic),
                  premium: formatMoney(planPricesForGender(profile.gender).premium),
                  monthly: formatMoney(planPricesForGender(profile.gender).monthly),
                })
        }
      />
    </DashboardLayout>
  );
}
