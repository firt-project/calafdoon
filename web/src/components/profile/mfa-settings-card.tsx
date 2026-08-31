"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Shield } from "lucide-react";
import { apiAuth } from "@/data/auth/api";
import type { MfaEnrollStartResult, MfaStatus } from "@/data/auth/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useTranslation } from "@/lib/i18n/context";
import { getSafeUserError } from "@/lib/safe-error";

export function MfaSettingsCard({
  embedded = false,
  onEnabled,
}: {
  embedded?: boolean;
  /** Called after successful enrollment confirm (e.g. leave /enroll-mfa). */
  onEnabled?: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [enroll, setEnroll] = useState<MfaEnrollStartResult | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [mode, setMode] = useState<"idle" | "disable" | "regen">("idle");

  const refresh = useCallback(async () => {
    try {
      const s = await apiAuth.mfaStatus();
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) return null;
  if (!status?.eligible) return null;

  const showRecovery = (codes: string[]) => {
    setRecoveryCodes(codes);
    setEnroll(null);
    setCode("");
    setMode("idle");
  };

  const afterEnable = async (codes: string[]) => {
    showRecovery(codes);
    toast.success(t("profilePage.mfaEnabled"));
  };

  const copyCodes = async (codes: string[]) => {
    await navigator.clipboard.writeText(codes.join("\n"));
    toast.success(t("profilePage.mfaRecoveryCopied"));
  };

  const downloadCodes = (codes: string[]) => {
    const blob = new Blob([codes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hel-calafkaaga-mfa-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const body = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("profilePage.mfaDesc")}</p>

      {recoveryCodes && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <p className="font-medium">{t("profilePage.mfaRecoveryTitle")}</p>
          <p className="text-sm text-muted-foreground">
            {t("profilePage.mfaRecoveryDesc")}
          </p>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
            {recoveryCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void copyCodes(recoveryCodes)}>
              {t("profilePage.mfaCopyCodes")}
            </Button>
            <Button type="button" variant="outline" onClick={() => downloadCodes(recoveryCodes)}>
              {t("profilePage.mfaDownloadCodes")}
            </Button>
            <Button
              type="button"
              onClick={async () => {
                setRecoveryCodes(null);
                await refresh();
                if (onEnabled) await onEnabled();
              }}
            >
              {t("profilePage.mfaDone")}
            </Button>
          </div>
        </div>
      )}

      {!recoveryCodes && enroll && (
        <div className="space-y-3">
          <p className="text-sm">{t("profilePage.mfaScanQr")}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enroll.qrCodeDataUrl}
            alt="MFA QR code"
            className="mx-auto h-48 w-48 rounded-lg border border-border bg-white p-2"
          />
          <p className="text-xs text-muted-foreground">{t("profilePage.mfaManualSecret")}</p>
          <code className="block break-all rounded-lg bg-muted px-3 py-2 text-xs">
            {enroll.secret}
          </code>
          <FormField label={t("profilePage.mfaConfirmCode")} htmlFor="mfaEnrollCode">
            <Input
              id="mfaEnrollCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={32}
            />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || code.trim().length < 6}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await apiAuth.mfaEnrollConfirm(code.trim());
                  await afterEnable(res.recoveryCodes);
                } catch (error) {
                  toast.error(
                    getSafeUserError(error, t("auth.mfaInvalid"))
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("profilePage.mfaConfirm")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await apiAuth.mfaEnrollCancel();
                  setEnroll(null);
                  setCode("");
                  await refresh();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("profilePage.mfaCancelEnroll")}
            </Button>
          </div>
        </div>
      )}

      {!recoveryCodes && !enroll && (
        <>
          <p className="text-sm font-medium">
            {status.enabled
              ? t("profilePage.mfaEnabled")
              : t("profilePage.mfaDisabled")}
          </p>
          {status.enabled && (
            <p className="text-xs text-muted-foreground">
              {t("profilePage.mfaCodesRemaining", {
                count: status.recoveryCodesRemaining,
              })}
            </p>
          )}

          {!status.enabled && (
            <Button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const started = await apiAuth.mfaEnrollStart();
                  setEnroll(started);
                } catch (error) {
                  toast.error(getSafeUserError(error, t("profilePage.mfaNotEligible")));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("profilePage.mfaEnable")}
            </Button>
          )}

          {status.enabled && mode === "idle" && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setMode("regen")}>
                  {t("profilePage.mfaRegenerate")}
                </Button>
                {!status.required && (
                  <Button type="button" variant="outline" onClick={() => setMode("disable")}>
                    {t("profilePage.mfaDisable")}
                  </Button>
                )}
              </div>
              {status.required && (
                <p className="text-xs text-muted-foreground">
                  {t("profilePage.mfaRequiredLocked")}
                </p>
              )}
            </div>
          )}

          {status.enabled && mode === "regen" && (
            <div className="space-y-3">
              <FormField label={t("profilePage.mfaConfirmCode")} htmlFor="mfaRegenCode">
                <Input
                  id="mfaRegenCode"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="one-time-code"
                />
              </FormField>
              <div className="flex gap-2">
                <Button
                  type="button"
                  disabled={busy || code.trim().length < 6}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const res = await apiAuth.mfaRegenerateRecovery(code.trim());
                      showRecovery(res.recoveryCodes);
                    } catch (error) {
                      toast.error(getSafeUserError(error, t("auth.mfaInvalid")));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t("profilePage.mfaRegenerate")}
                </Button>
                <Button type="button" variant="outline" onClick={() => setMode("idle")}>
                  {t("profilePage.mfaCancelEnroll")}
                </Button>
              </div>
            </div>
          )}

          {status.enabled && mode === "disable" && (
            <div className="space-y-3">
              <FormField label={t("profilePage.currentPassword")} htmlFor="mfaDisablePassword">
                <Input
                  id="mfaDisablePassword"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </FormField>
              <FormField label={t("profilePage.mfaConfirmCode")} htmlFor="mfaDisableCode">
                <Input
                  id="mfaDisableCode"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="one-time-code"
                />
              </FormField>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy || !password || code.trim().length < 6}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await apiAuth.mfaDisable(password, code.trim());
                      setPassword("");
                      setCode("");
                      setMode("idle");
                      toast.success(t("profilePage.mfaDisabled"));
                      await refresh();
                    } catch (error) {
                      toast.error(getSafeUserError(error, t("auth.mfaInvalid")));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t("profilePage.mfaDisableConfirm")}
                </Button>
                <Button type="button" variant="outline" onClick={() => setMode("idle")}>
                  {t("profilePage.mfaCancelEnroll")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <Shield className="h-4 w-4" />
          {t("profilePage.mfaTitle")}
        </h3>
        {body}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4" />
          {t("profilePage.mfaTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
