"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { getAuthenticatedHomeRoute } from "@/lib/routes";
import { useTranslation } from "@/lib/i18n/context";
import { getSafeUserError } from "@/lib/safe-error";
import { useUnifiedAuth } from "@/data/auth/hooks";
import { useCompleteRegistrationGender } from "@/data/profile/hooks-mutations";
import { useProfile } from "@/data/profile/hooks-queries";
import {
  LoadingDetails,
  RegisterDetailsShell,
  type GenderValue,
} from "./register-details-shell";

export default function ApiRegisterDetailsForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditGender = searchParams.get("editGender") === "1";
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading } = useUnifiedAuth();
  const { profile, loading: profileLoading } = useProfile();
  const completeGender = useCompleteRegistrationGender();
  const [gender, setGender] = useState<GenderValue | "">("");
  const [loading, setLoading] = useState(false);

  const profileData = profile as
    | {
        registrationComplete?: boolean;
        hasPaid?: boolean;
        genderLocked?: boolean;
        gender?: string;
      }
    | null
    | undefined;

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace("/register");
      return;
    }
    if (profileLoading || profile === undefined) return;

    if (!isEditGender && profileData?.registrationComplete === true) {
      router.replace(getAuthenticatedHomeRoute(profileData));
      return;
    }
    if (
      isEditGender &&
      (profileData?.hasPaid === true || profileData?.genderLocked === true)
    ) {
      toast.error(
        "Gender cannot be changed after payment. Contact support if this was a mistake."
      );
      router.replace("/profile");
    }
  }, [
    authLoading,
    isAuthenticated,
    isEditGender,
    profile,
    profileData,
    profileLoading,
    router,
  ]);

  useEffect(() => {
    if (!isEditGender) return;
    const profileGender = profileData?.gender;
    if (profileGender === "male" || profileGender === "female") {
      setGender(profileGender);
    }
  }, [isEditGender, profileData?.gender]);

  const onContinue = async () => {
    if (!gender) {
      toast.error(t("validation.genderRequired"));
      return;
    }

    setLoading(true);
    try {
      await completeGender(gender);
      toast.success(
        isEditGender ? t("auth.genderUpdated") : t("auth.registerGenderSuccess")
      );
      if (isEditGender) {
        router.push("/questionnaire?edit=1");
      } else {
        router.push("/questionnaire?welcome=true");
      }
    } catch (error) {
      toast.error(getSafeUserError(error, t("validation.saveDetailsFailed")));
    } finally {
      setLoading(false);
    }
  };

  if (
    authLoading ||
    profileLoading ||
    profile === undefined ||
    !isAuthenticated
  ) {
    return <LoadingDetails />;
  }

  if (!isEditGender && profileData?.registrationComplete === true) {
    return <LoadingDetails />;
  }

  return (
    <RegisterDetailsShell
      isEditGender={isEditGender}
      gender={gender}
      setGender={setGender}
      loading={loading}
      onContinue={onContinue}
      onBack={() => router.back()}
    />
  );
}
