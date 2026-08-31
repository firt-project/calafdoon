"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, InputIconWrapper } from "@/components/ui/form-field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDeleteAccount } from "@/data/profile/hooks-mutations";
import { clearApiAuthStorage } from "@/data/api-client";
import { disconnectRealtime } from "@/data/realtime/socket-client";
import { useTranslation } from "@/lib/i18n/context";
import type { TranslationPath } from "@/lib/i18n/translations";
import { getSafeUserError } from "@/lib/safe-error";

function deleteAccountErrorMessage(
  error: unknown,
  t: (key: TranslationPath) => string
): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const line = raw.split("\n")[0]?.trim() ?? "";
  if (/incorrect password/i.test(line)) {
    return t("profilePage.deleteAccountWrongPassword");
  }
  if (/please sign in again|sign in again/i.test(line)) {
    return t("profilePage.deleteAccountSignInAgain");
  }
  return getSafeUserError(error, t("profilePage.deleteAccountFailed"));
}

export function DeleteAccountCard({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const deleteAccount = useDeleteAccount();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount(password);
      clearApiAuthStorage();
      disconnectRealtime();
      toast.success(t("profilePage.deleteAccountSuccess"));
      router.replace("/");
    } catch (error) {
      toast.error(deleteAccountErrorMessage(error, t));
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
      setPassword("");
    }
  };

  return (
    <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4 space-y-4">
      <div>
        <h3 className="font-semibold text-destructive flex items-center gap-2">
          <Trash2 className="h-4 w-4" />
          {t("profilePage.deleteAccount")}
        </h3>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          {t("profilePage.deleteAccountDesc")}
        </p>
      </div>

      <FormField
        label={t("profilePage.currentPassword")}
        htmlFor="deleteAccountPassword"
      >
        <InputIconWrapper icon={<Lock className="h-4 w-4" />}>
          <Input
            id="deleteAccountPassword"
            type="password"
            className="pl-11"
            autoComplete="current-password"
            value={password}
            disabled={deleting}
            onChange={(e) => setPassword(e.target.value)}
          />
        </InputIconWrapper>
      </FormField>

      <Button
        type="button"
        variant="destructive"
        size={embedded ? "sm" : "default"}
        disabled={!password.trim() || deleting}
        onClick={() => setConfirmOpen(true)}
      >
        {t("profilePage.deleteAccount")}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        title={t("profilePage.deleteAccountConfirmTitle")}
        description={t("profilePage.deleteAccountConfirmDesc")}
        confirmLabel={t("profilePage.deleteAccountConfirm")}
        cancelLabel={t("common.cancel")}
        tone="danger"
        busy={deleting}
        onCancel={() => {
          if (!deleting) setConfirmOpen(false);
        }}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
