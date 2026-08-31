"use client";

import { ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminStatusPeriodReport } from "@/data/admin/hooks";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { PeriodDrilldown } from "@/components/admin/admin-review-queue-panel";

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_year", label: "This year" },
  { value: "all_time", label: "All time" },
] as const;

type PeriodCurrent = {
  registrations?: number;
  submissions?: number;
  profileSubmissions?: number;
  approved?: number;
  rejected?: number;
  changesRequested?: number;
  pendingSnapshot?: number;
  pendingOver24h?: number;
  pendingOver48h?: number;
  paused?: number;
  resumed?: number;
  banned?: number;
  unbanned?: number;
  suspended?: number;
  unsuspended?: number;
  activeUsers?: number;
  messages?: number;
  reports?: number;
  appealsSubmitted?: number;
  averageReviewTimeMs?: number | null;
  medianReviewTimeMs?: number | null;
  approvalRate?: number | null;
  rejectionRate?: number | null;
};

function Stat({
  label,
  value,
  delta,
  onClick,
}: {
  label: string;
  value: number | undefined | null;
  delta?: { diff: number; pct: number | null };
  onClick?: () => void;
}) {
  const clickable = typeof onClick === "function";
  const Comp = clickable ? "button" : "div";
  return (
    <Comp
      type={clickable ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-left w-full",
        clickable &&
          "group hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors cursor-pointer"
      )}
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <span>{label}</span>
        {clickable ? (
          <ChevronRight className="h-3 w-3 opacity-50 group-hover:opacity-100 group-hover:text-primary" />
        ) : null}
      </p>
      <p
        className={cn(
          "text-xl font-semibold tabular-nums mt-0.5",
          clickable && "text-foreground group-hover:text-primary"
        )}
      >
        {value ?? "—"}
      </p>
      {delta ? (
        <p className="text-xs text-muted-foreground mt-0.5">
          {delta.diff >= 0 ? "+" : ""}
          {delta.diff}
          {delta.pct == null
            ? ""
            : ` (${delta.pct >= 0 ? "+" : ""}${delta.pct}%)`}
        </p>
      ) : clickable ? (
        <p className="text-[11px] text-primary/80 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          Click to view users
        </p>
      ) : null}
    </Comp>
  );
}

function formatDuration(ms: number | null | undefined) {
  if (ms == null) return "—";
  const hours = Math.round(ms / 3_600_000);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function AdminStatusPeriodPanel({
  enabled,
  onDrilldown,
}: {
  enabled: boolean;
  onDrilldown?: (filter: PeriodDrilldown) => void;
}) {
  const { t } = useTranslation();
  const {
    report,
    preset,
    setPreset,
    tz,
    setTz,
    country,
    setCountry,
    refresh,
  } = useAdminStatusPeriodReport(enabled);

  const payload = report as
    | {
        current?: PeriodCurrent;
        comparison?: {
          deltas?: Record<string, { diff: number; pct: number | null }>;
        };
        refreshedAt?: string;
        range?: { from: string; to: string; timeZone: string };
      }
    | null
    | undefined;

  const current = payload?.current;
  const deltas = payload?.comparison?.deltas ?? {};

  const drill = (partial: PeriodDrilldown) => {
    onDrilldown?.({
      country: country || undefined,
      // Period-scoped metrics keep the selected preset unless overridden.
      preset,
      ...partial,
    });
  };

  return (
    <Card className="border-border">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-lg">
              {t("adminPage.statusPeriodTitle")}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("adminPage.statusPeriodHint")} · TZ {tz}
              {payload?.refreshedAt
                ? ` · ${new Date(payload.refreshedAt).toLocaleString()}`
                : ""}
              {onDrilldown ? " · Click any number to open matching users below" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
            >
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <input
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm w-36"
              placeholder="Country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
            <input
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm w-40"
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              aria-label="Timezone"
            />
            <Button type="button" variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!current) return;
                const lines = [
                  "metric,value",
                  `preset,${preset}`,
                  `timezone,${tz}`,
                  `country,${country || "all"}`,
                  ...Object.entries(current).map(
                    ([k, v]) => `${k},${String(v)}`
                  ),
                ];
                const blob = new Blob([lines.join("\n")], {
                  type: "text/csv;charset=utf-8",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "status-period-report.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              CSV
            </Button>
          </div>
        </div>

        {report === undefined ? (
          <p className="text-sm text-muted-foreground">Loading period stats…</p>
        ) : report === null ? (
          <p className="text-sm text-destructive">Could not load period report.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            <Stat
              label="Registrations"
              value={current?.registrations}
              delta={deltas.registrations}
              onClick={
                onDrilldown
                  ? () =>
                      drill({
                        dateField: "registration",
                        label: "Registrations",
                      })
                  : undefined
              }
            />
            <Stat
              label="Submissions"
              value={current?.submissions ?? current?.profileSubmissions}
              onClick={
                onDrilldown
                  ? () =>
                      drill({
                        dateField: "submission",
                        label: "Submissions",
                      })
                  : undefined
              }
            />
            <Stat
              label="Approved"
              value={current?.approved}
              delta={deltas.approved}
              onClick={
                onDrilldown
                  ? () =>
                      drill({
                        eventType: "approved",
                        dateField: "event",
                        label: "Approved",
                      })
                  : undefined
              }
            />
            <Stat
              label="Rejected"
              value={current?.rejected}
              delta={deltas.rejected}
              onClick={
                onDrilldown
                  ? () =>
                      drill({
                        eventType: "rejected",
                        dateField: "event",
                        label: "Rejected",
                      })
                  : undefined
              }
            />
            <Stat
              label="Changes requested"
              value={current?.changesRequested}
              onClick={
                onDrilldown
                  ? () =>
                      drill({
                        eventType: "changes_requested",
                        dateField: "event",
                        label: "Changes requested",
                      })
                  : undefined
              }
            />
            <Stat
              label="Pending now"
              value={current?.pendingSnapshot}
              onClick={
                onDrilldown
                  ? () =>
                      drill({
                        reviewStatus: "pending_review",
                        // Snapshot is current queue — do not apply period date filter.
                        preset: null,
                        dateField: null,
                        eventType: null,
                        label: "Pending now",
                      })
                  : undefined
              }
            />
            <Stat
              label="Paused"
              value={current?.paused}
              delta={deltas.paused}
              onClick={
                onDrilldown
                  ? () =>
                      drill({
                        eventType: "paused",
                        dateField: "event",
                        label: "Paused",
                      })
                  : undefined
              }
            />
            <Stat
              label="Resumed"
              value={current?.resumed}
              delta={deltas.resumed}
              onClick={
                onDrilldown
                  ? () =>
                      drill({
                        eventType: "resumed",
                        dateField: "event",
                        label: "Resumed",
                      })
                  : undefined
              }
            />
            <Stat
              label="Banned"
              value={current?.banned}
              delta={deltas.banned}
              onClick={
                onDrilldown
                  ? () =>
                      drill({
                        eventType: "banned",
                        dateField: "event",
                        label: "Banned",
                      })
                  : undefined
              }
            />
            <Stat
              label="Unbanned"
              value={current?.unbanned}
              delta={deltas.unbanned}
              onClick={
                onDrilldown
                  ? () =>
                      drill({
                        eventType: "unbanned",
                        dateField: "event",
                        label: "Unbanned",
                      })
                  : undefined
              }
            />
            <Stat
              label="Suspended"
              value={current?.suspended}
              delta={deltas.suspended}
              onClick={
                onDrilldown
                  ? () =>
                      drill({
                        eventType: "suspended",
                        dateField: "event",
                        label: "Suspended",
                      })
                  : undefined
              }
            />
            <Stat
              label="Pending >24h"
              value={current?.pendingOver24h}
              onClick={
                onDrilldown
                  ? () =>
                      drill({
                        reviewStatus: "pending_review",
                        waitingMoreThanHours: 24,
                        preset: null,
                        dateField: null,
                        eventType: null,
                        label: "Pending >24h",
                      })
                  : undefined
              }
            />
            <Stat
              label="Pending >48h"
              value={current?.pendingOver48h}
              onClick={
                onDrilldown
                  ? () =>
                      drill({
                        reviewStatus: "pending_review",
                        waitingMoreThanHours: 48,
                        preset: null,
                        dateField: null,
                        eventType: null,
                        label: "Pending >48h",
                      })
                  : undefined
              }
            />
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Review time
              </p>
              <p className="text-sm font-semibold mt-0.5">
                avg {formatDuration(current?.averageReviewTimeMs)} · med{" "}
                {formatDuration(current?.medianReviewTimeMs)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Approve {current?.approvalRate ?? "—"}% · Reject{" "}
                {current?.rejectionRate ?? "—"}%
              </p>
            </div>
            <Stat
              label="Active users"
              value={current?.activeUsers}
              delta={deltas.activeUsers}
              onClick={
                onDrilldown
                  ? () =>
                      drill({
                        dateField: "last_active",
                        label: "Active users",
                      })
                  : undefined
              }
            />
            <Stat
              label="Messages"
              value={current?.messages}
              delta={deltas.messages}
            />
            <Stat
              label="Reports"
              value={current?.reports}
              delta={deltas.reports}
            />
            <Stat
              label="Appeals"
              value={current?.appealsSubmitted}
              delta={deltas.appealsSubmitted}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
