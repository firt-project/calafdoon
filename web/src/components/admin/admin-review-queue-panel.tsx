"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  CheckCircle,
  Eye,
  History,
  Pause,
  Play,
  RefreshCw,
  Ban,
  Search,
  UserCheck,
  XCircle,
} from "lucide-react";
import type { Profile as AdminUser } from "@/types";
import {
  useAdminApproveUser,
  useAdminAssignReviewer,
  useAdminBanUser,
  useAdminPauseUser,
  useAdminRejectUser,
  useAdminRequestChanges,
  useAdminRequestPhoto,
  useAdminResumeUser,
  useAdminUsers,
} from "@/data/admin/hooks";
import { AdminUserAvatar } from "@/components/admin/admin-user-avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { resolveReviewStatus } from "@/lib/review-status";
import { getSafeUserError } from "@/lib/safe-error";
import { cn } from "@/lib/utils";
import { apiAdmin } from "@/data/admin/api";

function FormModal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-[#1a1214]/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-3xl"
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        </div>
        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

const QUEUE_TABS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "older_pending", label: "Older pending" },
  { id: "changes_requested", label: "Changes requested" },
  { id: "rejected", label: "Rejected" },
  { id: "recently_approved", label: "Recently approved" },
] as const;

type QueueTab = (typeof QUEUE_TABS)[number]["id"];

const DATE_FIELDS = [
  { value: "registration", label: "Registration date" },
  { value: "submission", label: "Profile submission" },
  { value: "approval", label: "Approval date" },
  { value: "rejection", label: "Rejection date" },
  { value: "pause", label: "Pause date" },
  { value: "resume", label: "Resume date" },
  { value: "suspension", label: "Suspension date" },
  { value: "ban", label: "Ban date" },
  { value: "unban", label: "Unban date" },
  { value: "payment", label: "Payment date" },
  { value: "last_active", label: "Last active" },
] as const;

const REJECT_PRESETS = [
  "Unclear profile photo",
  "Missing profile information",
  "Invalid phone number",
  "Country and phone code mismatch",
  "Duplicate account",
  "Inappropriate content",
  "Payment issue",
  "Identity could not be verified",
  "Other",
];

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
] as const;

function formatWaiting(ms: number | undefined) {
  if (ms == null || Number.isNaN(ms)) return "—";
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 48) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatTs(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function rowId(user: ReviewRow): string {
  return String(user._id || user.id || "");
}

type ReviewRow = AdminUser & {
  id?: string;
  waitingMs?: number;
  registeredAt?: string;
  submittedAt?: string | null;
  statusChangedAt?: string | null;
  assignedReviewerName?: string | null;
  assignedReviewerId?: string | null;
  updatedAt?: string;
  phone?: string | null;
  country?: string | null;
  gender?: string | null;
};

function queueFilters(tab: QueueTab, tz: string): Record<string, unknown> {
  const base = { role: "user", sortBy: "waiting", sortOrder: "asc", limit: 50, timezone: tz };
  switch (tab) {
    case "today":
      return {
        ...base,
        reviewStatus: "pending_review",
        dateField: "registration",
        preset: "today",
      };
    case "yesterday":
      return {
        ...base,
        reviewStatus: "pending_review",
        dateField: "registration",
        preset: "yesterday",
      };
    case "older_pending":
      return {
        ...base,
        reviewStatus: "pending_review",
        waitingMoreThanHours: 24,
      };
    case "changes_requested":
      return { ...base, reviewStatus: "changes_requested" };
    case "rejected":
      return {
        ...base,
        reviewStatus: "rejected",
        dateField: "rejection",
        preset: "last_7_days",
        sortBy: "statusChanged",
        sortOrder: "desc",
      };
    case "recently_approved":
      return {
        ...base,
        reviewStatus: "approved",
        dateField: "approval",
        preset: "last_7_days",
        sortBy: "statusChanged",
        sortOrder: "desc",
      };
  }
}

export type PeriodDrilldown = {
  preset?: string | null;
  dateField?: string | null;
  eventType?: string | null;
  country?: string | null;
  reviewStatus?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  waitingMoreThanHours?: number | null;
  /** Shown in the review queue banner after a period metric click. */
  label?: string;
};

export function AdminReviewQueuePanel({
  enabled,
  onOpenUser,
  onOpenHistory,
  drilldown,
  onClearDrilldown,
}: {
  enabled: boolean;
  onOpenUser: (profileId: string) => void;
  onOpenHistory?: (profileId: string) => void;
  drilldown?: PeriodDrilldown | null;
  onClearDrilldown?: () => void;
}) {
  const [queueTab, setQueueTab] = useState<QueueTab>("today");
  const [preset, setPreset] = useState("today");
  const [dateField, setDateField] = useState("registration");
  const [country, setCountry] = useState("");
  const [reviewStatus, setReviewStatus] = useState("pending_review");
  const [payment, setPayment] = useState("all");
  const [reviewer, setReviewer] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [useAdvanced, setUseAdvanced] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<ReviewRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ReviewRow | null>(null);
  const [changesTarget, setChangesTarget] = useState<ReviewRow | null>(null);
  const [rejectForm, setRejectForm] = useState({
    reason: REJECT_PRESETS[0],
    publicUserMessage: "",
    internalAdminNote: "",
    allowResubmission: true,
    requestPhoto: false,
  });
  const [changesForm, setChangesForm] = useState({
    whatMustChange: "",
    publicInstructions: "",
    internalAdminNote: "",
    deadlineAt: "",
    requireNewPhoto: false,
  });

  const tz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      : "UTC";

  const listOpts = useMemo(() => {
    const searchQ = debouncedSearch.trim();

    // Name/email search always searches broadly so new users are findable.
    if (searchQ) {
      return {
        limit: 100,
        timezone: tz,
        sortBy: "registered",
        sortOrder: "desc",
        search: searchQ,
      };
    }

    if (drilldown) {
      const sortBy =
        drilldown.dateField === "registration"
          ? "registered"
          : drilldown.eventType ||
              drilldown.dateField === "event" ||
              drilldown.dateField === "approval" ||
              drilldown.dateField === "rejection"
            ? "statusChanged"
            : drilldown.dateField === "submission"
              ? "submitted"
              : "waiting";
      return {
        ...(drilldown.dateField === "registration" ? {} : { role: "user" }),
        limit: 100,
        timezone: tz,
        sortBy,
        sortOrder: "desc",
        ...(drilldown.preset ? { preset: drilldown.preset } : {}),
        ...(drilldown.dateField ? { dateField: drilldown.dateField } : {}),
        ...(drilldown.eventType ? { eventType: drilldown.eventType } : {}),
        ...(drilldown.country ? { country: drilldown.country } : {}),
        ...(drilldown.reviewStatus
          ? { reviewStatus: drilldown.reviewStatus }
          : {}),
        ...(drilldown.dateFrom ? { dateFrom: drilldown.dateFrom } : {}),
        ...(drilldown.dateTo ? { dateTo: drilldown.dateTo } : {}),
        ...(drilldown.waitingMoreThanHours
          ? { waitingMoreThanHours: drilldown.waitingMoreThanHours }
          : {}),
      };
    }
    if (useAdvanced) {
      return {
        role: "user",
        limit: 50,
        timezone: tz,
        sortBy: "waiting",
        dateField,
        preset: preset === "custom" ? "custom" : preset,
        ...(preset === "custom" && customFrom && customTo
          ? { dateFrom: customFrom, dateTo: customTo }
          : {}),
        ...(country.trim() ? { country: country.trim() } : {}),
        ...(reviewStatus !== "all" ? { reviewStatus } : {}),
        ...(payment !== "all" ? { payment } : {}),
        ...(reviewer !== "all" ? { assignedReviewerId: reviewer } : {}),
      };
    }
    return queueFilters(queueTab, tz);
  }, [
    drilldown,
    useAdvanced,
    queueTab,
    preset,
    dateField,
    country,
    reviewStatus,
    payment,
    reviewer,
    debouncedSearch,
    customFrom,
    customTo,
    tz,
  ]);

  const { users, total, summaryCounts, isRefreshing, reload, removeUser, patchUser } =
    useAdminUsers(enabled, listOpts);

  const approveUser = useAdminApproveUser();
  const rejectUser = useAdminRejectUser();
  const requestChanges = useAdminRequestChanges();
  const assignReviewer = useAdminAssignReviewer();
  const requestPhoto = useAdminRequestPhoto();
  const banUser = useAdminBanUser();
  const pauseUser = useAdminPauseUser();
  const resumeUser = useAdminResumeUser();

  const rows = (users ?? []) as ReviewRow[];

  const run = async (
    id: string,
    action: () => Promise<unknown>,
    success: string,
    after?: () => void
  ) => {
    setBusyId(id);
    try {
      await action();
      toast.success(success);
      after?.();
      reload();
    } catch (e) {
      toast.error(getSafeUserError(e, "Action failed"));
    } finally {
      setBusyId(null);
    }
  };

  const actionsFor = (user: ReviewRow) => {
    const status = user.banned
      ? "banned"
      : resolveReviewStatus(user);
    const id = rowId(user);
    const expectedUpdatedAt = user.updatedAt;
    const items: Array<{
      key: string;
      label: string;
      icon: ReactNode;
      onClick: () => void;
      tone?: "destructive" | "default";
    }> = [
      {
        key: "view",
        label: "View",
        icon: <Eye className="h-3.5 w-3.5" />,
        onClick: () => onOpenUser(id),
      },
    ];

    if (status === "pending_review" || status === "changes_requested") {
      items.push(
        {
          key: "approve",
          label: "Approve",
          icon: <CheckCircle className="h-3.5 w-3.5" />,
          onClick: () => setApproveTarget(user),
        },
        {
          key: "reject",
          label: "Reject",
          icon: <XCircle className="h-3.5 w-3.5" />,
          onClick: () => {
            setRejectForm({
              reason: REJECT_PRESETS[0],
              publicUserMessage: "",
              internalAdminNote: "",
              allowResubmission: true,
              requestPhoto: false,
            });
            setRejectTarget(user);
          },
        },
        {
          key: "changes",
          label: "Request changes",
          icon: <RefreshCw className="h-3.5 w-3.5" />,
          onClick: () => {
            setChangesForm({
              whatMustChange: "",
              publicInstructions: "",
              internalAdminNote: "",
              deadlineAt: "",
              requireNewPhoto: false,
            });
            setChangesTarget(user);
          },
        },
        {
          key: "photo",
          label: "Request photo",
          icon: <UserCheck className="h-3.5 w-3.5" />,
          onClick: () =>
            void run(id, () => requestPhoto(id), "Photo requested"),
        }
      );
    } else if (status === "approved") {
      items.push(
        {
          key: "pause",
          label: "Pause",
          icon: <Pause className="h-3.5 w-3.5" />,
          onClick: () => void run(id, () => pauseUser(id), "Paused"),
        },
        {
          key: "ban",
          label: "Ban",
          icon: <Ban className="h-3.5 w-3.5" />,
          tone: "destructive",
          onClick: () => void run(id, () => banUser(id, true), "Banned"),
        }
      );
    } else if (status === "rejected") {
      items.push(
        {
          key: "approve",
          label: "Approve",
          icon: <CheckCircle className="h-3.5 w-3.5" />,
          onClick: () => setApproveTarget(user),
        },
        {
          key: "changes",
          label: "Request changes",
          icon: <RefreshCw className="h-3.5 w-3.5" />,
          onClick: () => setChangesTarget(user),
        }
      );
    } else if (status === "paused") {
      items.push(
        {
          key: "resume",
          label: "Resume",
          icon: <Play className="h-3.5 w-3.5" />,
          onClick: () => void run(id, () => resumeUser(id), "Resumed"),
        },
        {
          key: "ban",
          label: "Ban",
          icon: <Ban className="h-3.5 w-3.5" />,
          tone: "destructive",
          onClick: () => void run(id, () => banUser(id, true), "Banned"),
        }
      );
    } else if (status === "banned" || user.banned) {
      items.push({
        key: "unban",
        label: "Unban",
        icon: <CheckCircle className="h-3.5 w-3.5" />,
        onClick: () => void run(id, () => banUser(id, false), "Unbanned"),
      });
    }

    items.push({
      key: "history",
      label: "History",
      icon: <History className="h-3.5 w-3.5" />,
      onClick: () => (onOpenHistory ? onOpenHistory(id) : onOpenUser(id)),
    });

    if (status === "pending_review" || status === "changes_requested") {
      items.push({
        key: "assign",
        label: "Assign to me",
        icon: <UserCheck className="h-3.5 w-3.5" />,
        onClick: () =>
          void run(
            id,
            () =>
              assignReviewer(id, {
                action: "assign_me",
                expectedUpdatedAt,
              }),
            "Assigned to you"
          ),
      });
    }

    return items;
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkApprove = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      const expectedUpdatedAtById: Record<string, string> = {};
      for (const row of rows) {
        const id = rowId(row);
        if (id && ids.includes(id) && row.updatedAt) {
          expectedUpdatedAtById[id] = row.updatedAt;
        }
      }
      await apiAdmin.users.bulkApprove({ profileIds: ids, expectedUpdatedAtById });
      toast.success(`Approved ${ids.length} users`);
      setSelected(new Set());
      reload();
    } catch (e) {
      toast.error(getSafeUserError(e, "Bulk approve failed"));
    }
  };

  const exportSelected = () => {
    const ids = selected.size > 0 ? [...selected] : rows.map((r) => rowId(r));
    const chosen = rows.filter((r) => ids.includes(rowId(r)));
    const lines = [
      "id,name,country,status,registeredAt,submittedAt,phone",
      ...chosen.map((r) =>
        [
          rowId(r),
          JSON.stringify(r.name ?? ""),
          JSON.stringify(r.country ?? ""),
          resolveReviewStatus(r),
          r.registeredAt ?? "",
          r.submittedAt ?? "",
          JSON.stringify(r.phone ?? ""),
        ].join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "review-queue-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card id="admin-review-queue" className="border-border scroll-mt-24">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-lg">New user review</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Date-based queue with direct approve / reject actions
              {typeof total === "number" ? ` · ${total} matching` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {drilldown ? (
              <Button type="button" variant="outline" size="sm" onClick={onClearDrilldown}>
                Clear period filter
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setUseAdvanced((v) => !v)}
            >
              {useAdvanced ? "Queue tabs" : "Advanced filters"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={reload}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isRefreshing && "animate-spin")} />
              Refresh
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={exportSelected}>
              Export
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              const next = e.target.value;
              setSearch(next);
              if (next.trim() && drilldown) onClearDrilldown?.();
            }}
            placeholder="Search name, email, phone, or ID (all members)"
            className="h-10 rounded-xl pl-9"
          />
        </div>

        {drilldown ? (
          <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
            <p className="font-medium text-foreground">
              Period activity
              {drilldown.label ? `: ${drilldown.label}` : ""}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Showing users for this metric
              {drilldown.preset ? ` · ${String(drilldown.preset).replace(/_/g, " ")}` : ""}
              {drilldown.country ? ` · ${drilldown.country}` : ""}
              {typeof total === "number" ? ` · ${total} found` : ""}
              . Clear the filter to return to the normal queue.
            </p>
          </div>
        ) : null}

        {search.trim() ? (
          <p className="text-xs text-muted-foreground">
            Searching all members by name/email/phone
            {typeof total === "number" ? ` · ${total} found` : ""}.
            Clear the search box to return to queue tabs.
          </p>
        ) : null}

        {!useAdvanced && !drilldown && !search.trim() ? (
          <div className="flex flex-wrap gap-1.5">
            {QUEUE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setQueueTab(tab.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm border transition-colors",
                  queueTab === tab.id
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}

        {(useAdvanced || drilldown) && !search.trim() && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Period</span>
              <select
                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                value={drilldown?.preset || preset}
                disabled={!!drilldown}
                onChange={(e) => setPreset(e.target.value)}
              >
                {PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Date field</span>
              <select
                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                value={drilldown?.dateField || dateField}
                disabled={!!drilldown}
                onChange={(e) => setDateField(e.target.value)}
              >
                {DATE_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Country</span>
              <Input
                value={drilldown?.country || country}
                disabled={!!drilldown}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. Somalia"
                className="h-9"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Status</span>
              <select
                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                value={drilldown?.reviewStatus || reviewStatus}
                disabled={!!drilldown}
                onChange={(e) => setReviewStatus(e.target.value)}
              >
                <option value="all">All</option>
                <option value="pending_review">Pending</option>
                <option value="changes_requested">Changes requested</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="paused">Paused</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Payment</span>
              <select
                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                value={payment}
                disabled={!!drilldown}
                onChange={(e) => setPayment(e.target.value)}
              >
                <option value="all">All</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
                <option value="basic">Basic</option>
                <option value="premium">Premium</option>
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Reviewer</span>
              <select
                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                value={reviewer}
                disabled={!!drilldown}
                onChange={(e) => setReviewer(e.target.value)}
              >
                <option value="all">All</option>
                <option value="me">Assigned to me</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </label>
            {preset === "custom" && !drilldown ? (
              <>
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">From</span>
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-9"
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">To</span>
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-9"
                  />
                </label>
              </>
            ) : null}
          </div>
        )}

        {summaryCounts ? (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>In filter: {summaryCounts.total ?? 0}</span>
            <span>· Pending {summaryCounts.pending_review ?? 0}</span>
            <span>· Changes {summaryCounts.changes_requested ?? 0}</span>
            <span>· Rejected {summaryCounts.rejected ?? 0}</span>
            <span>· Approved {summaryCounts.approved ?? 0}</span>
          </div>
        ) : null}

        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <span className="text-sm">{selected.size} selected</span>
            <Button type="button" size="sm" onClick={() => void bulkApprove()}>
              Approve selected
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={exportSelected}>
              Export selected
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 w-8" />
                <th className="px-3 py-2">Member</th>
                <th className="px-3 py-2">Country</th>
                <th className="px-3 py-2">Waiting</th>
                <th className="px-3 py-2">Payment</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Reviewer</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users === undefined ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-muted-foreground">
                    Loading queue…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-muted-foreground">
                    No matching users for this filter.
                  </td>
                </tr>
              ) : (
                rows.map((user) => {
                  const id = rowId(user);
                  const status = user.banned ? "banned" : resolveReviewStatus(user);
                  return (
                    <tr key={id} className="border-t border-border align-top">
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(id)}
                          onChange={() => toggleSelect(id)}
                          aria-label={`Select ${user.name}`}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-[180px]">
                          <AdminUserAvatar
                            name={user.name || "?"}
                            imageUrl={
                              (user as { imageUrl?: string | null }).imageUrl
                            }
                            className="h-10 w-10"
                          />
                          <div>
                            <p className="font-medium leading-tight">{user.name}</p>
                            {user.email ? (
                              <p className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                                {user.email}
                              </p>
                            ) : null}
                            <p className="text-[11px] text-muted-foreground font-mono">
                              {id.slice(0, 8)}…
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {user.gender ?? "—"} · {user.phone || "no phone"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Reg {formatTs(user.registeredAt)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Sub {formatTs(user.submittedAt)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">{user.country || "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {formatWaiting(user.waitingMs)}
                      </td>
                      <td className="px-3 py-2.5">
                        {user.hasPaid
                          ? user.hasPersonalSupport
                            ? "Premium"
                            : "Basic"
                          : "Unpaid"}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="secondary" className="capitalize">
                          {status.replace(/_/g, " ")}
                        </Badge>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Updated {formatTs(user.statusChangedAt)}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {user.assignedReviewerName ||
                          (user.assignedReviewerId ? "Assigned" : "—")}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1 max-w-[280px]">
                          {actionsFor(user).map((a) => (
                            <Button
                              key={a.key}
                              type="button"
                              size="sm"
                              variant={a.tone === "destructive" ? "destructive" : "outline"}
                              disabled={busyId === id}
                              className="h-7 px-2 text-xs"
                              onClick={a.onClick}
                            >
                              {a.icon}
                              <span className="ml-1">{a.label}</span>
                            </Button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>

      <ConfirmDialog
        open={!!approveTarget}
        title="Approve member?"
        description={
          approveTarget
            ? `${approveTarget.name} · ${rowId(approveTarget)}\nCountry: ${approveTarget.country || "—"}\nRegistered: ${formatTs(approveTarget.registeredAt)}\nSubmitted: ${formatTs(approveTarget.submittedAt)}\nPayment: ${approveTarget.hasPaid ? "Paid" : "Unpaid"}\nStatus: ${resolveReviewStatus(approveTarget)}`
            : ""
        }
        confirmLabel="Approve"
        cancelLabel="Cancel"
        tone="warning"
        busy={!!approveTarget && busyId === rowId(approveTarget)}
        onCancel={() => setApproveTarget(null)}
        onConfirm={() => {
          if (!approveTarget) return;
          const id = rowId(approveTarget);
          void run(
            id,
            () =>
              approveUser(id, { expectedUpdatedAt: approveTarget.updatedAt }),
            "Approved",
            () => {
              removeUser(id);
              patchUser(id, { approved: true, reviewStatus: "approved" });
              setApproveTarget(null);
            }
          );
        }}
      />

      <FormModal
        open={!!rejectTarget}
        title={`Reject ${rejectTarget?.name ?? ""}`}
        onClose={() => setRejectTarget(null)}
      >
          <div className="space-y-1.5">
              <Label>Reason</Label>
              <select
                className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
                value={rejectForm.reason}
                onChange={(e) =>
                  setRejectForm((f) => ({ ...f, reason: e.target.value }))
                }
              >
                {REJECT_PRESETS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Public message</Label>
              <Textarea
                value={rejectForm.publicUserMessage}
                onChange={(e) =>
                  setRejectForm((f) => ({
                    ...f,
                    publicUserMessage: e.target.value,
                  }))
                }
                placeholder="Shown on /account-status"
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Internal note (admin only)</Label>
              <Textarea
                value={rejectForm.internalAdminNote}
                onChange={(e) =>
                  setRejectForm((f) => ({
                    ...f,
                    internalAdminNote: e.target.value,
                  }))
                }
                rows={2}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rejectForm.allowResubmission}
                onChange={(e) =>
                  setRejectForm((f) => ({
                    ...f,
                    allowResubmission: e.target.checked,
                  }))
                }
              />
              Allow resubmission
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rejectForm.requestPhoto}
                onChange={(e) =>
                  setRejectForm((f) => ({
                    ...f,
                    requestPhoto: e.target.checked,
                  }))
                }
              />
              Request new photo
            </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!rejectForm.publicUserMessage.trim()}
              onClick={() => {
                if (!rejectTarget) return;
                const id = rowId(rejectTarget);
                void run(
                  id,
                  () =>
                    rejectUser(id, {
                      reason: rejectForm.reason,
                      publicUserMessage: rejectForm.publicUserMessage,
                      internalAdminNote: rejectForm.internalAdminNote,
                      allowResubmission: rejectForm.allowResubmission,
                      requestPhoto: rejectForm.requestPhoto,
                      expectedUpdatedAt: rejectTarget.updatedAt,
                    }),
                  "Rejected",
                  () => {
                    removeUser(id);
                    setRejectTarget(null);
                  }
                );
              }}
            >
              Reject
            </Button>
          </div>
      </FormModal>

      <FormModal
        open={!!changesTarget}
        title={`Request changes · ${changesTarget?.name ?? ""}`}
        onClose={() => setChangesTarget(null)}
      >
            <div className="space-y-1.5">
              <Label>What must change</Label>
              <Textarea
                value={changesForm.whatMustChange}
                onChange={(e) =>
                  setChangesForm((f) => ({
                    ...f,
                    whatMustChange: e.target.value,
                  }))
                }
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Public instructions</Label>
              <Textarea
                value={changesForm.publicInstructions}
                onChange={(e) =>
                  setChangesForm((f) => ({
                    ...f,
                    publicInstructions: e.target.value,
                  }))
                }
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Internal note</Label>
              <Textarea
                value={changesForm.internalAdminNote}
                onChange={(e) =>
                  setChangesForm((f) => ({
                    ...f,
                    internalAdminNote: e.target.value,
                  }))
                }
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Deadline (optional)</Label>
              <Input
                type="datetime-local"
                value={changesForm.deadlineAt}
                onChange={(e) =>
                  setChangesForm((f) => ({ ...f, deadlineAt: e.target.value }))
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={changesForm.requireNewPhoto}
                onChange={(e) =>
                  setChangesForm((f) => ({
                    ...f,
                    requireNewPhoto: e.target.checked,
                  }))
                }
              />
              New photo required
            </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setChangesTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                !changesForm.whatMustChange.trim() ||
                !changesForm.publicInstructions.trim()
              }
              onClick={() => {
                if (!changesTarget) return;
                const id = rowId(changesTarget);
                void run(
                  id,
                  () =>
                    requestChanges(id, {
                      whatMustChange: changesForm.whatMustChange,
                      publicInstructions: changesForm.publicInstructions,
                      internalAdminNote: changesForm.internalAdminNote,
                      deadlineAt: changesForm.deadlineAt
                        ? new Date(changesForm.deadlineAt).toISOString()
                        : null,
                      requireNewPhoto: changesForm.requireNewPhoto,
                      expectedUpdatedAt: changesTarget.updatedAt,
                    }),
                  "Changes requested",
                  () => setChangesTarget(null)
                );
              }}
            >
              Request changes
            </Button>
          </div>
      </FormModal>
    </Card>
  );
}
