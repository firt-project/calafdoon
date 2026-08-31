"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataLoadError } from "@/components/ui/data-load-error";
import { apiClient } from "@/data/api-client";
import { useTranslation } from "@/lib/i18n/context";

type TimelineItem = {
  id: string;
  eventType: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  publicUserMessage?: string | null;
  createdAt: string;
};

type AccountStatusPayload = {
  currentStatus: string;
  registeredAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  pausedAt: string | null;
  bannedAt: string | null;
  suspensionExpiresAt: string | null;
  statusChangedAt: string;
  waitingSince: string | null;
  reviewSlaHours: number | null;
  reviewSlaMessage: string;
  nextStep: string;
  latestPublicReason: string | null;
  appeal: {
    status: string;
    submittedAt: string;
    reviewedAt: string | null;
    adminResponse: string | null;
  } | null;
  timeline: TimelineItem[];
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function relativeFrom(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export default function AccountStatusPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<AccountStatusPayload | null | undefined>(
    undefined
  );
  const [error, setError] = useState<string | null>(null);
  const [appealText, setAppealText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const next = await apiClient.get<AccountStatusPayload>("/account-status");
      setData(next);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : t("common.loadFailed"));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (error && !data) {
    return (
      <DashboardLayout>
        <DataLoadError message={error} onRetry={() => void load()} />
      </DashboardLayout>
    );
  }

  if (data === undefined) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl space-y-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout>
        <DataLoadError onRetry={() => void load()} />
      </DashboardLayout>
    );
  }

  const waiting = relativeFrom(data.waitingSince);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{t("accountStatus.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("accountStatus.subtitle")}
          </p>
        </div>

        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("accountStatus.current")}
            </p>
            <p className="text-xl font-semibold capitalize">
              {data.currentStatus.replace(/_/g, " ")}
            </p>
            <p className="text-sm text-muted-foreground">{data.nextStep}</p>
            {data.currentStatus === "pending_review" ? (
              <p className="text-sm">
                {waiting
                  ? t("accountStatus.underReviewFor", { duration: waiting })
                  : data.reviewSlaMessage}
              </p>
            ) : null}
            {data.latestPublicReason ? (
              <p className="text-sm rounded-xl bg-muted/50 px-3 py-2">
                {data.latestPublicReason}
              </p>
            ) : null}
            {data.suspensionExpiresAt ? (
              <p className="text-sm">
                {t("accountStatus.suspensionExpires")}:{" "}
                {formatWhen(data.suspensionExpiresAt)}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">
                {t("accountStatus.registered")}:
              </span>{" "}
              {formatWhen(data.registeredAt)}
            </p>
            <p>
              <span className="text-muted-foreground">
                {t("accountStatus.submitted")}:
              </span>{" "}
              {formatWhen(data.submittedAt)}
            </p>
            <p>
              <span className="text-muted-foreground">
                {t("accountStatus.lastUpdate")}:
              </span>{" "}
              {formatWhen(data.statusChangedAt)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <h2 className="font-semibold">{t("accountStatus.timeline")}</h2>
            <ol className="space-y-4">
              {data.timeline.map((item) => (
                <li key={item.id} className="border-l-2 border-border pl-4">
                  <p className="text-sm font-medium capitalize">
                    {item.eventType.replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-muted-foreground" title={item.createdAt}>
                    {formatWhen(item.createdAt)}
                  </p>
                  {item.publicUserMessage ? (
                    <p className="text-sm mt-1">{item.publicUserMessage}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {(data.currentStatus === "banned" ||
          data.currentStatus === "rejected" ||
          data.currentStatus === "suspended") && (
          <Card>
            <CardContent className="p-5 space-y-3">
              <h2 className="font-semibold">{t("accountStatus.appealTitle")}</h2>
              {data.appeal ? (
                <p className="text-sm text-muted-foreground">
                  {t("accountStatus.appealStatus", {
                    status: data.appeal.status,
                  })}{" "}
                  · {formatWhen(data.appeal.submittedAt)}
                  {data.appeal.adminResponse
                    ? ` — ${data.appeal.adminResponse}`
                    : ""}
                </p>
              ) : (
                <>
                  <textarea
                    className="w-full min-h-24 rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={appealText}
                    onChange={(e) => setAppealText(e.target.value)}
                    placeholder={t("accountStatus.appealPlaceholder")}
                  />
                  <Button
                    disabled={submitting || appealText.trim().length < 10}
                    onClick={async () => {
                      setSubmitting(true);
                      try {
                        await apiClient.post("/account-status/appeals", {
                          message: appealText.trim(),
                        });
                        setAppealText("");
                        await load();
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                  >
                    {t("accountStatus.submitAppeal")}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
