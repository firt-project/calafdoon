"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Shield, KeyRound, Crown } from "lucide-react";
import {
  useAdminBootstrapStatus,
  useClaimFirstAdmin,
} from "@/data/admin/hooks";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n/context";
import { getSafeUserError } from "@/lib/safe-error";

const REASON_KEYS = {
  not_authenticated: "adminPage.bootstrapReasonNotAuthenticated",
  admins_exist: "adminPage.bootstrapReasonAdminsExist",
  not_configured: "adminPage.bootstrapReasonNotConfigured",
  no_email: "adminPage.bootstrapReasonNoEmail",
  email_mismatch: "adminPage.bootstrapReasonEmailMismatch",
  api_mode: "adminPage.bootstrapReasonAdminsExist",
} as const;

type BootstrapStatus = {
  canClaim: boolean;
  reason?: string;
  hasAdmins?: boolean;
};

export function AdminBootstrapPanel() {
  const { t } = useTranslation();
  const [secret, setSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const bootstrapStatus = useAdminBootstrapStatus(true) as
    | BootstrapStatus
    | undefined;
  const claimFirstAdmin = useClaimFirstAdmin();

  if (bootstrapStatus === undefined) {
    return null;
  }

  if (!bootstrapStatus.canClaim) {
    const reasonKey =
      REASON_KEYS[bootstrapStatus.reason as keyof typeof REASON_KEYS] ??
      null;
    const message = reasonKey
      ? t(reasonKey)
      : t("adminPage.bootstrapCannotClaim");

    return (
      <Card className="max-w-lg mx-auto">
        <CardHeader className="text-center">
          <Shield className="h-10 w-10 text-primary mx-auto mb-2" />
          <CardTitle>{t("adminPage.bootstrapAccessDenied")}</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleClaim = async () => {
    if (!secret.trim()) {
      toast.error(t("adminPage.bootstrapSecretRequired"));
      return;
    }

    setSubmitting(true);
    try {
      await claimFirstAdmin({ secret: secret.trim() });
      toast.success(t("adminPage.bootstrapSuccess"));
      setSecret("");
    } catch (error) {
      toast.error(getSafeUserError(error, t("adminPage.bootstrapFailed"))
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader className="text-center">
        <Crown className="h-10 w-10 text-amber-500 mx-auto mb-2" />
        <CardTitle>{t("adminPage.bootstrapClaimTitle")}</CardTitle>
        <CardDescription>{t("adminPage.bootstrapClaimDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="bootstrap-secret">{t("adminPage.bootstrapSecretLabel")}</Label>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="bootstrap-secret"
              type="password"
              className="pl-10"
              placeholder={t("adminPage.bootstrapSecretPlaceholder")}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
        <Button className="w-full" onClick={() => void handleClaim()} disabled={submitting}>
          {submitting ? t("adminPage.bootstrapClaiming") : t("adminPage.bootstrapBecomeOwner")}
        </Button>
      </CardContent>
    </Card>
  );
}
