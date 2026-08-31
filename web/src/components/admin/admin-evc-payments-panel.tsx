"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Smartphone, X } from "lucide-react";
import {
  useAdminApproveEvc,
  useAdminEvcPending,
  useAdminRejectEvc,
} from "@/data/admin/hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getSafeUserError } from "@/lib/safe-error";
import { useTranslation } from "@/lib/i18n/context";

type EvcProofRow = {
  _id?: string;
  id?: string;
  screenshotUrl?: string | null;
  payerFullName?: string;
  lastFourDigits?: string;
  tier?: string;
  amountCents?: number;
  profileName?: string;
  gender?: string;
  userEmail?: string;
  userPhone?: string;
  createdAt?: string | number;
};

interface AdminEvcPaymentsPanelProps {
  enabled?: boolean;
  onActionComplete?: () => void;
}

export function AdminEvcPaymentsPanel({
  enabled = true,
  onActionComplete,
}: AdminEvcPaymentsPanelProps) {
  const { t } = useTranslation();
  const { pending: pendingRaw, removeProof } = useAdminEvcPending(enabled);
  const pending = pendingRaw as EvcProofRow[] | undefined;
  const approve = useAdminApproveEvc();
  const reject = useAdminRejectEvc();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const onApprove = async (proofId: string) => {
    setBusyId(proofId);
    try {
      await approve(proofId);
      toast.success(t("adminPage.evcApproved"));
      removeProof(proofId);
      onActionComplete?.();
    } catch (error) {
      toast.error(getSafeUserError(error, t("adminPage.actionFailed")));
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async (proofId: string) => {
    setBusyId(proofId);
    try {
      await reject(
        proofId,
        rejectReason[proofId]?.trim() || undefined
      );
      toast.success(t("adminPage.evcRejected"));
      removeProof(proofId);
      onActionComplete?.();
    } catch (error) {
      toast.error(getSafeUserError(error, t("adminPage.actionFailed")));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Smartphone className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">{t("adminPage.evcPendingTitle")}</h3>
        <Badge variant="outline">{pending?.length ?? 0}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{t("adminPage.evcPendingDesc")}</p>

      {!pending || pending.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {t("adminPage.evcNonePending")}
        </div>
      ) : (
        <ul className="space-y-4">
          {pending.map((proof) => {
            const proofId = String(proof._id ?? proof.id ?? "");
            return (
            <li
              key={proofId}
              className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4"
            >
              <div className="flex flex-col gap-4 sm:flex-row">
                {proof.screenshotUrl ? (
                  <a
                    href={proof.screenshotUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={proof.screenshotUrl}
                      alt=""
                      className="h-40 w-auto max-w-full rounded-xl border border-border object-cover"
                    />
                  </a>
                ) : (
                  <div className="h-40 w-28 rounded-xl bg-muted" />
                )}
                <div className="min-w-0 flex-1 space-y-1.5 text-sm">
                  <p className="font-semibold text-base">{proof.payerFullName}</p>
                  <p className="text-muted-foreground">
                    {t("adminPage.evcLastFour")}:{" "}
                    <span className="font-mono font-semibold text-foreground">
                      ****{proof.lastFourDigits}
                    </span>
                  </p>
                  <p>
                    <Badge variant="outline">
                      {proof.tier === "premium"
                        ? t("payment.premiumPlan")
                        : t("payment.basicPlan")}
                    </Badge>{" "}
                    <span className="font-semibold tabular-nums">
                      ${((proof.amountCents ?? 0) / 100).toFixed((proof.amountCents ?? 0) % 100 === 0 ? 0 : 2)}
                    </span>
                  </p>
                  {proof.profileName && (
                    <p className="text-muted-foreground">
                      {t("adminPage.evcProfile")}: {proof.profileName}
                      {proof.gender ? ` (${proof.gender})` : ""}
                    </p>
                  )}
                  {proof.userEmail && (
                    <p className="truncate text-muted-foreground">{proof.userEmail}</p>
                  )}
                  {proof.userPhone && (
                    <p className="text-muted-foreground">{proof.userPhone}</p>
                  )}
                  {proof.createdAt && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(proof.createdAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  size="sm"
                  className="rounded-xl"
                  disabled={!proofId || busyId === proofId}
                  onClick={() => void onApprove(proofId)}
                >
                  <Check className="mr-1.5 h-4 w-4" />
                  {t("adminPage.evcApprove")}
                </Button>
                <Input
                  value={rejectReason[proofId] ?? ""}
                  onChange={(e) =>
                    setRejectReason((prev) => ({
                      ...prev,
                      [proofId]: e.target.value,
                    }))
                  }
                  placeholder={t("adminPage.evcRejectReason")}
                  className="sm:max-w-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl text-destructive"
                  disabled={!proofId || busyId === proofId}
                  onClick={() => void onReject(proofId)}
                >
                  <X className="mr-1.5 h-4 w-4" />
                  {t("adminPage.evcReject")}
                </Button>
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
