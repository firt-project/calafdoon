"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { getAuthErrorMessage } from "@/lib/auth-errors";
import { normalizeAuthEmail } from "@/lib/auth-email";
import { useTranslation } from "@/lib/i18n/context";
import { parsePlanPreference, savePlanPreference } from "@/lib/plan-preference";
import { useUnifiedAuth } from "@/data/auth/hooks";
import {
  RegisterFormShell,
  type AccountForm,
} from "./register-form-shell";

function usePlanFromSearch() {
  const searchParams = useSearchParams();
  useEffect(() => {
    const plan = parsePlanPreference(searchParams.get("plan"));
    if (plan) savePlanPreference(plan);
  }, [searchParams]);
}

export default function ApiRegisterForm() {
  const { register, checkEmail, refresh } = useUnifiedAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  usePlanFromSearch();

  const onSubmit = async (data: AccountForm) => {
    setLoading(true);
    try {
      const email = normalizeAuthEmail(data.email);
      const { available } = await checkEmail!(email);
      if (!available) {
        toast.error(t("auth.emailAlreadyVerified"));
        router.push("/login");
        return;
      }

      await Promise.race([
        register!(email, data.password),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(t("common.loadingStuck"))), 20_000)
        ),
      ]);
      await refresh?.();
      toast.success(t("auth.registerSuccess"));
      router.push("/register/details");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (
        message.includes("already exists") ||
        message.includes("Unable to create account")
      ) {
        toast.error(t("auth.emailAlreadyVerified"));
        router.push("/login");
        return;
      }
      toast.error(
        getAuthErrorMessage(error, t("validation.registrationFailed"), t)
      );
    } finally {
      setLoading(false);
    }
  };

  return <RegisterFormShell onSubmit={onSubmit} loading={loading} />;
}
