"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Flag, Ban, X } from "lucide-react";
import { useBlockUser, useReportUser } from "@/data/moderation/hooks";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n/context";
import type { TranslationPath } from "@/lib/i18n/translations";
import { getSafeUserError } from "@/lib/safe-error";

const REASONS: { value: string; key: TranslationPath }[] = [
  { value: "fake_profile", key: "safety.reasonFake" },
  { value: "inappropriate", key: "safety.reasonInappropriate" },
  { value: "harassment", key: "safety.reasonHarassment" },
  { value: "spam", key: "safety.reasonSpam" },
  { value: "other", key: "safety.reasonOther" },
];

type Mode = "menu" | "report" | "block";

interface ReportBlockMenuProps {
  userId: string;
  userName: string;
  onDone?: () => void;
  compact?: boolean;
  reportContext?: string;
}

export function ReportBlockMenu({
  userId,
  userName,
  onDone,
  compact = false,
  reportContext,
}: ReportBlockMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);

  const reportUser = useReportUser();
  const blockUser = useBlockUser();

  const close = () => {
    setOpen(false);
    setMode("menu");
    setReason("");
    setDetails("");
    setAlsoBlock(true);
  };

  const handleBlock = async () => {
    setBusy(true);
    try {
      await blockUser({ blockedUserId: userId });
      toast.success(t("safety.blockedToast", { name: userName }));
      close();
      onDone?.();
    } catch (error) {
      toast.error(getSafeUserError(error, t("safety.actionFailed")));
    } finally {
      setBusy(false);
    }
  };

  const handleReport = async () => {
    if (!reason) {
      toast.error(t("safety.pickReason"));
      return;
    }
    setBusy(true);
    try {
      await reportUser({
        reportedUserId: userId,
        reason: reason as
          | "fake_profile"
          | "inappropriate"
          | "harassment"
          | "spam"
          | "other",
        details: [reportContext, details.trim()].filter(Boolean).join("\n\n") || undefined,
        alsoBlock,
      });
      toast.success(
        alsoBlock
          ? t("safety.reportedAndBlockedToast", { name: userName })
          : t("safety.reportedToast")
      );
      close();
      onDone?.();
    } catch (error) {
      toast.error(getSafeUserError(error, t("safety.actionFailed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={compact ? "ghost" : "outline"}
        size={compact ? "icon" : "sm"}
        className={compact ? "h-9 w-9 rounded-xl shrink-0" : ""}
        onClick={() => setOpen(true)}
        aria-label={t("safety.reportOrBlock")}
      >
        <Flag className="h-4 w-4" />
        {!compact && <span className="ml-2">{t("safety.reportOrBlock")}</span>}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
          onClick={close}
        >
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-border bg-card shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold text-lg">
                {mode === "report"
                  ? t("safety.reportTitle")
                  : mode === "block"
                    ? t("safety.blockTitle")
                    : t("safety.reportOrBlock")}
              </h3>
              <Button variant="ghost" size="icon" className="rounded-full" onClick={close}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {mode === "menu" && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {t("safety.menuDesc", { name: userName })}
                </p>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => setMode("report")}
                >
                  <Flag className="h-4 w-4 mr-2" />
                  {t("safety.reportUser")}
                </Button>
                <Button
                  className="w-full justify-start text-destructive hover:text-destructive"
                  variant="outline"
                  onClick={() => setMode("block")}
                >
                  <Ban className="h-4 w-4 mr-2" />
                  {t("safety.blockUser")}
                </Button>
              </div>
            )}

            {mode === "block" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t("safety.blockConfirm", { name: userName })}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setMode("menu")}>
                    {t("safety.cancel")}
                  </Button>
                  <Button
                    className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={busy}
                    onClick={() => void handleBlock()}
                  >
                    {busy ? t("safety.working") : t("safety.blockUser")}
                  </Button>
                </div>
              </div>
            )}

            {mode === "report" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>{t("safety.reason")}</Label>
                  <Select value={reason || undefined} onValueChange={setReason}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("safety.pickReason")} />
                    </SelectTrigger>
                    <SelectContent>
                      {REASONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {t(r.key)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("safety.details")}</Label>
                  <Textarea
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder={t("safety.detailsPh")}
                    rows={3}
                    maxLength={500}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={alsoBlock}
                    onChange={(e) => setAlsoBlock(e.target.checked)}
                    className="rounded border-border"
                  />
                  {t("safety.alsoBlock")}
                </label>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setMode("menu")}>
                    {t("safety.cancel")}
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={busy}
                    onClick={() => void handleReport()}
                  >
                    {busy ? t("safety.working") : t("safety.submitReport")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
