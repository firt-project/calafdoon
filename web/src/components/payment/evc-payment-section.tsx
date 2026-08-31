"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Camera, CheckCircle2, Clock, Copy, Phone, Smartphone, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  EVC_PAYEE_NAME,
  EVC_PAYEE_PHONE,
  EVC_PAYEE_PHONE_DISPLAY,
  MPESA_PAYEE_NAME,
  MPESA_PAYEE_PHONE,
  MPESA_PAYEE_PHONE_DISPLAY,
  REGISTRATION_PRICE,
  formatMoney,
} from "@/lib/constants";
import { resetFileInput } from "@/lib/upload-image";
import { getSafeUserError } from "@/lib/safe-error";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { useEvcLatestProof, useSubmitEvcProof } from "@/data/payments/hooks";
import { getPaymentsAdapter } from "@/data/payments";

export function EvcPaymentSection({
  gender: _gender,
}: {
  gender?: "male" | "female";
  /** @deprecated Premium is hidden — ignored. */
  freeBasic?: boolean;
}) {
  const { t } = useTranslation();
  const basicPrice = REGISTRATION_PRICE;
  const tier = "basic" as const;
  const latestRaw = useEvcLatestProof();
  const latest = latestRaw.proof as
    | {
        status?: string;
        payerFullName?: string;
        lastFourDigits?: string;
        tier?: string;
        rejectionReason?: string | null;
      }
    | null
    | undefined;
  const submitProof = useSubmitEvcProof();

  const [fullName, setFullName] = useState("");
  const [lastFour, setLastFour] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const priceLabel = useMemo(() => formatMoney(basicPrice), [basicPrice]);

  const copyPhone = async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone.replace(/\s/g, ""));
      toast.success(t("payment.evcCopied"));
    } catch {
      toast.error(t("payment.evcCopyFailed"));
    }
  };

  const onFile = (input: HTMLInputElement) => {
    const next = input.files?.[0] ?? null;
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
    resetFileInput(input);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error(t("payment.evcScreenshotRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const { prepareImageForUpload } = await import("@/lib/strip-image-exif");
      const prepared = await prepareImageForUpload(file);
      const contentType = prepared.type || "image/jpeg";
      const signed = (await getPaymentsAdapter().evc.signUpload({
        contentType,
        sizeBytes: prepared.size,
      })) as { mediaId?: string; uploadUrl?: string };
      const uploadUrl = String(signed.uploadUrl ?? "");
      const mediaId = String(signed.mediaId ?? "");
      if (!uploadUrl || !mediaId) throw new Error("Upload failed");

      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: prepared,
      });
      if (!put.ok) {
        throw new Error("Upload failed. Please try a smaller JPG or PNG.");
      }
      await submitProof({
        tier,
        payerFullName: fullName,
        lastFourDigits: lastFour,
        mediaId,
      });
      toast.success(t("payment.evcSubmitted"));
      setFullName("");
      setLastFour("");
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
    } catch (error) {
      toast.error(getSafeUserError(error, t("payment.evcSubmitFailed")));
    } finally {
      setSubmitting(false);
    }
  };

  if (latest?.status === "pending") {
    return (
      <div className="mt-10 rounded-3xl border border-amber-300/60 bg-amber-50/80 p-6 sm:p-8 text-center space-y-3 dark:border-amber-800/60 dark:bg-amber-950/40">
        <Clock className="mx-auto h-8 w-8 text-amber-700 dark:text-amber-400" />
        <h2 className="text-xl font-semibold text-amber-950 dark:text-amber-100">{t("payment.evcPendingTitle")}</h2>
        <p className="text-sm text-amber-900/80 max-w-lg mx-auto leading-relaxed dark:text-amber-200/80">
          {t("payment.evcPendingDesc")}
        </p>
        <p className="text-xs text-amber-900/70 dark:text-amber-200/70">
          {latest.payerFullName} · ****{latest.lastFourDigits} ·{" "}
          {latest.tier === "premium" ? t("payment.premiumPlan") : t("payment.basicPlan")}
        </p>
      </div>
    );
  }

  if (latest?.status === "rejected") {
    // Fall through to form so they can resubmit; show banner above.
  }

  return (
    <div className="mt-10 space-y-6">
      <div className="text-center space-y-2">
        <Badge variant="outline" className="border-primary/30 text-primary">
          <Smartphone className="mr-1.5 h-3.5 w-3.5" />
          {t("payment.evcBadge")}
        </Badge>
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
          {t("payment.evcTitle")}
        </h2>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
          {t("payment.evcSubtitle")}
        </p>
      </div>

      {latest?.status === "rejected" && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive flex gap-2 items-start">
          <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{t("payment.evcRejectedTitle")}</p>
            <p className="mt-1 text-destructive/90">
              {latest.rejectionReason || t("payment.evcRejectedDesc")}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-md space-y-6">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("payment.evcSendTo")}
          </p>
          <div className="rounded-2xl bg-muted/50 border border-border px-4 py-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{t("payment.evcLabel")}</p>
            <p className="text-lg font-semibold">{EVC_PAYEE_NAME}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <span className="font-mono text-base font-semibold tracking-wide">
                {EVC_PAYEE_PHONE_DISPLAY}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => void copyPhone(EVC_PAYEE_PHONE)}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                {t("payment.evcCopy")}
              </Button>
            </div>
          </div>
          <div className="rounded-2xl bg-muted/50 border border-border px-4 py-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{t("payment.mpesaLabel")}</p>
            <p className="text-lg font-semibold">{MPESA_PAYEE_NAME}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <span className="font-mono text-base font-semibold tracking-wide">
                {MPESA_PAYEE_PHONE_DISPLAY}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => void copyPhone(MPESA_PAYEE_PHONE)}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                {t("payment.evcCopy")}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("payment.evcHowTo")}</p>
        </div>

        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm font-medium">
          {t("payment.basicPlan")} · ${formatMoney(basicPrice)}
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="evc-name">{t("payment.evcFullName")}</Label>
            <Input
              id="evc-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t("payment.evcFullNamePlaceholder")}
              required
              minLength={3}
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="evc-last4">{t("payment.evcLastFour")}</Label>
            <Input
              id="evc-last4"
              value={lastFour}
              onChange={(e) => setLastFour(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="7403"
              inputMode="numeric"
              required
              maxLength={4}
              className="font-mono tracking-widest max-w-[8rem]"
            />
            <p className="text-xs text-muted-foreground">{t("payment.evcLastFourHint")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="evc-shot">{t("payment.evcScreenshot")}</Label>
            <div
              className={cn(
                "rounded-2xl border border-dashed border-border bg-muted/30 p-4 flex flex-col sm:flex-row gap-4 items-center",
                preview && "border-primary/40 bg-primary/5"
              )}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt=""
                  className="h-28 w-auto rounded-xl object-cover border border-border"
                />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-xl bg-card border border-border text-muted-foreground">
                  <Camera className="h-7 w-7" />
                </div>
              )}
              <div className="flex-1 text-center sm:text-left space-y-2">
                <p className="text-sm text-muted-foreground">{t("payment.evcScreenshotHint")}</p>
                <Input
                  id="evc-shot"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/*"
                  className="cursor-pointer"
                  onChange={(e) => onFile(e.target)}
                />
              </div>
            </div>
          </div>

          <Button type="submit" size="lg" className="w-full sm:w-auto font-semibold" disabled={submitting}>
            {submitting ? (
              t("payment.evcSubmitting")
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {t("payment.evcSubmit", { price: priceLabel })}
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
