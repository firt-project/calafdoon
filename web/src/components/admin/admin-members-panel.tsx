"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Ban,
  CheckCircle,
  Download,
  Eye,
  ImagePlus,
  Mail,
  MessageCircle,
  Phone,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import type { Profile as AdminUser } from "@/types";
import {
  useAdminApproveUser,
  useAdminBanUser,
  useAdminDeleteUser,
  useAdminRejectUser,
  useAdminRequestPhoto,
  useAdminSetRole,
} from "@/data/admin/hooks";
import { apiAdmin } from "@/data/admin/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AdminUserAvatar } from "@/components/admin/admin-user-avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isOwnerRole, isStaffRole } from "@/lib/access";
import { WHATSAPP_URL } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import type { TranslationPath } from "@/lib/i18n/translations";
import { resolveReviewStatus, requiresAdminProfileApproval } from "@/lib/review-status";
import { cn } from "@/lib/utils";
import { ConfirmDialog, type ConfirmDialogTone } from "@/components/ui/confirm-dialog";
import { getAdminActionError, getSafeUserError } from "@/lib/safe-error";

type RoleFilter = "all" | "user" | "admin" | "owner";
type PaymentFilter = "all" | "unpaid" | "paid" | "basic" | "premium" | "trial";
export type GenderFilter = "all" | "male" | "female";
export type ReviewFilter =
  | "all"
  | "needs_action"
  | "pending_review"
  | "approved"
  | "incomplete"
  | "rejected"
  | "suspended";

const REVIEW_FILTERS: { value: ReviewFilter; labelKey: TranslationPath }[] = [
  { value: "all", labelKey: "adminPage.filterAllStatuses" },
  { value: "pending_review", labelKey: "adminPage.filterPendingReview" },
  { value: "approved", labelKey: "adminPage.filterApproved" },
  { value: "incomplete", labelKey: "adminPage.filterIncomplete" },
  { value: "rejected", labelKey: "adminPage.filterRejected" },
  { value: "suspended", labelKey: "adminPage.filterSuspended" },
  { value: "needs_action", labelKey: "adminPage.filterNeedsAction" },
];

type PendingConfirm = {
  type: "reject" | "delete" | "ban" | "unban";
  user: AdminUser;
};

type EmailLookupResult = {
  emailNormalized: string;
  found: boolean;
  blocksSignup: boolean;
  orphanUserCount: number;
  hint: string;
  users: Array<{
    userId: string;
    email: string | null;
    name: string | null;
    hasProfile: boolean;
    profileId: string | null;
    profileName: string | null;
    role: string | null;
    banned: boolean;
    reviewStatus: string | null;
    authProviders: string[];
  }>;
  passwordAccounts: Array<{
    authAccountId: string;
    userId: string;
    hasProfile: boolean;
    profileId: string | null;
  }>;
};

function formatJoined(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

function isMemberApproved(user: AdminUser): boolean {
  return (
    user.approved === true ||
    user.reviewStatus === "approved" ||
    resolveReviewStatus(user) === "approved"
  );
}

function isPremiumUser(user: AdminUser) {
  return user.hasPersonalSupport === true || (user.paidCents ?? 0) >= 2000;
}

function memberStatus(user: AdminUser): {
  labelKey: TranslationPath;
  className: string;
} {
  if (user.banned) {
    return {
      labelKey: "adminPage.statusBanned",
      className: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
    };
  }
  if (isStaffRole(user.role)) {
    return {
      labelKey: user.role === "owner" ? "adminPage.statusOwner" : "adminPage.statusAdmin",
      className: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
    };
  }
  const review = resolveReviewStatus(user);
  if (review === "incomplete") {
    return {
      labelKey: "adminPage.statusIncomplete",
      className: "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200",
    };
  }
  if (review === "rejected") {
    return {
      labelKey: "adminPage.statusRejected",
      className: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
    };
  }
  if (review === "pending_review") {
    return {
      labelKey: "adminPage.statusPendingReview",
      className: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
    };
  }
  if (review === "suspended") {
    return {
      labelKey: "adminPage.statusBanned",
      className: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
    };
  }
  if (review === "approved") {
    return {
      labelKey: "adminPage.statusApproved",
      className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    };
  }
  if (!user.hasPaid) {
    return {
      labelKey: "adminPage.statusUnpaid",
      className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    };
  }
  if (isPremiumUser(user)) {
    return {
      labelKey: "adminPage.statusPremium",
      className: "bg-primary/10 text-primary",
    };
  }
  return {
    labelKey: "adminPage.statusPaid",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
  };
}

interface AdminMembersPanelProps {
  users: AdminUser[] | undefined;
  total?: number | null;
  search: string;
  onSearchChange: (value: string) => void;
  countryFilter: string;
  onCountryFilterChange: (value: string) => void;
  roleFilter: RoleFilter;
  onRoleFilterChange: (value: RoleFilter) => void;
  paymentFilter: PaymentFilter;
  onPaymentFilterChange: (value: PaymentFilter) => void;
  genderFilter: GenderFilter;
  onGenderFilterChange: (value: GenderFilter) => void;
  reviewFilter: ReviewFilter;
  onReviewFilterChange: (value: ReviewFilter) => void;
  approvedMale?: number;
  approvedFemale?: number;
  approvedTotal?: number;
  currentProfileId?: string;
  canManageRoles: boolean;
  onOpenUser: (profileId: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  isRefreshing?: boolean;
  onPatchUser?: (profileId: string, patch: Record<string, unknown>) => void;
  onRemoveUser?: (profileId: string) => void;
  onActionComplete?: () => void;
}

export function AdminMembersPanel({
  users,
  total,
  search,
  onSearchChange,
  countryFilter,
  onCountryFilterChange,
  roleFilter,
  onRoleFilterChange,
  paymentFilter,
  onPaymentFilterChange,
  genderFilter,
  onGenderFilterChange,
  reviewFilter,
  onReviewFilterChange,
  approvedMale,
  approvedFemale,
  approvedTotal,
  currentProfileId,
  canManageRoles,
  onOpenUser,
  onLoadMore,
  hasMore,
  loadingMore,
  isRefreshing,
  onPatchUser,
  onRemoveUser,
  onActionComplete,
}: AdminMembersPanelProps) {
  const { t } = useTranslation();
  const approveUser = useAdminApproveUser();
  const rejectUser = useAdminRejectUser();
  const requestProfilePhoto = useAdminRequestPhoto();
  const banUser = useAdminBanUser();
  const deleteUser = useAdminDeleteUser();
  const setUserRole = useAdminSetRole();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [emailLookup, setEmailLookup] = useState<EmailLookupResult | null>(null);
  const [emailLookupLoading, setEmailLookupLoading] = useState(false);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [exportingEmails, setExportingEmails] = useState(false);
  const [purgingTypos, setPurgingTypos] = useState(false);
  const [ownerToolsOpen, setOwnerToolsOpen] = useState(false);

  useEffect(() => {
    const q = search.trim();
    if (!q.includes("@")) {
      setEmailLookup(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setEmailLookupLoading(true);
      void apiAdmin.users
        .lookupEmail(q)
        .then((data) => {
          if (!cancelled) setEmailLookup(data as EmailLookupResult);
        })
        .catch(() => {
          if (!cancelled) setEmailLookup(null);
        })
        .finally(() => {
          if (!cancelled) setEmailLookupLoading(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  const releaseOrphan = async (userId: string) => {
    setReleasingId(userId);
    try {
      await apiAdmin.users.releaseOrphan(userId);
      toast.success("Email released — they can register again.");
      const refreshed = (await apiAdmin.users.lookupEmail(search.trim())) as EmailLookupResult;
      setEmailLookup(refreshed);
      onActionComplete?.();
    } catch (error) {
      toast.error(getSafeUserError(error, t("adminPage.actionFailed")));
    } finally {
      setReleasingId(null);
    }
  };

  const exportEmailsForTesters = async () => {
    const ok = window.confirm(
      "Export all member emails for Play Console testers?\n\nThis downloads private emails to your device. Only use for Google Play closed testing. The action is logged."
    );
    if (!ok) return;
    setExportingEmails(true);
    try {
      const res = await apiAdmin.users.exportEmails({
        confirm: "EXPORT_MEMBER_EMAILS",
      });
      const lines = res.emails;
      if (!lines.length) {
        toast.error(
          res.skipped
            ? `No valid emails to export (${res.skipped} skipped as invalid).`
            : "No member emails to export."
        );
        return;
      }
      // Play Console CSV: one email per line (no header, no commas).
      const blob = new Blob([`${lines.join("\n")}\n`], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "hel-calafkaaga-tester-emails.csv";
      a.click();
      URL.revokeObjectURL(url);
      const extras = [
        res.fixed ? `${res.fixed} typo-fixed` : null,
        res.skipped ? `${res.skipped} skipped` : null,
      ]
        .filter(Boolean)
        .join(", ");
      toast.success(
        extras
          ? `Exported ${res.count} emails (${extras}).`
          : `Exported ${res.count} emails for Play testers.`
      );
    } catch (error) {
      toast.error(getSafeUserError(error, t("adminPage.actionFailed")));
    } finally {
      setExportingEmails(false);
    }
  };

  const purgeTypoEmailAccounts = async (mode: "dry-run" | "fix" | "delete") => {
    if (mode === "fix") {
      const ok = window.confirm(
        "Fix typo domains in the database? (e.g. gmail.come → gmail.com). Staff accounts are never changed."
      );
      if (!ok) return;
    }
    if (mode === "delete") {
      const ok = window.confirm(
        "DELETE all member accounts with fake email domains (@gmail.come, @gmail.con, …)? This cannot be undone. Staff are never deleted."
      );
      if (!ok) return;
    }
    setPurgingTypos(true);
    try {
      const res = (await apiAdmin.users.purgeTypoEmails({
        mode,
        confirm:
          mode === "fix"
            ? "FIX_TYPO_EMAILS"
            : mode === "delete"
              ? "DELETE_TYPO_EMAILS"
              : undefined,
      })) as {
        mode: string;
        count?: number;
        paidCount?: number;
        fixed?: number;
        deleted?: number;
        conflicts?: number;
        items?: Array<{ original: string; fixed: string; name: string | null }>;
        errors?: string[];
      };
      if (mode === "dry-run") {
        toast.message(
          `Found ${res.count ?? 0} typo-email accounts` +
            (res.paidCount ? ` (${res.paidCount} paid)` : "")
        );
        if (res.items?.length) {
          console.info("[typo-emails]", res.items.slice(0, 50));
        }
      } else if (mode === "fix") {
        toast.success(
          `Fixed ${res.fixed ?? 0} emails` +
            (res.conflicts ? ` · ${res.conflicts} skipped (conflict)` : "")
        );
        onActionComplete?.();
      } else {
        toast.success(`Deleted ${res.deleted ?? 0} typo-email accounts`);
        if (res.errors?.length) {
          toast.error(`${res.errors.length} deletes failed — see console`);
          console.error(res.errors);
        }
        onActionComplete?.();
      }
    } catch (error) {
      toast.error(getSafeUserError(error, t("adminPage.actionFailed")));
    } finally {
      setPurgingTypos(false);
    }
  };

  const canApproveMember = (user: AdminUser) => {
    if (isStaffRole(user.role) || user.banned || isMemberApproved(user)) {
      return false;
    }
    return true;
  };

  const canRejectMember = (user: AdminUser) => {
    const review = resolveReviewStatus(user);
    return (
      !isStaffRole(user.role) &&
      requiresAdminProfileApproval(user) &&
      (review === "pending_review" || review === "approved" || review === "rejected")
    );
  };

  const runAction = async (
    profileId: string,
    action: () => Promise<unknown>,
    successMessage: string,
    afterSuccess?: () => void
  ) => {
    setBusyId(profileId);
    try {
      await action();
      toast.success(successMessage);
      setPendingConfirm(null);
      afterSuccess?.();
      onActionComplete?.();
    } catch (error) {
      console.error("[admin-members] action failed", profileId, error);
      toast.error(getAdminActionError(error, t("adminPage.actionFailed")));
    } finally {
      setBusyId(null);
    }
  };

  const confirmCopy = (pending: PendingConfirm) => {
    const { type, user } = pending;
    if (type === "reject") {
      return {
        title: t("adminPage.rejectConfirmTitle"),
        description: t("adminPage.rejectConfirm", { name: user.name }),
        confirmLabel: t("adminPage.rejectShort"),
        tone: "warning" as ConfirmDialogTone,
      };
    }
    if (type === "delete") {
      return {
        title: t("adminPage.deleteConfirmTitle"),
        description: t("adminPage.deleteConfirm", { name: user.name }),
        confirmLabel: t("adminPage.deleteShort"),
        tone: "danger" as ConfirmDialogTone,
      };
    }
    if (type === "unban") {
      return {
        title: t("adminPage.unbanConfirmTitle"),
        description: t("adminPage.unbanConfirm", { name: user.name }),
        confirmLabel: t("adminPage.unbanShort"),
        tone: "warning" as ConfirmDialogTone,
      };
    }
    return {
      title: t("adminPage.banConfirmTitle"),
      description: t("adminPage.banConfirm", { name: user.name }),
      confirmLabel: t("adminPage.banShort"),
      tone: "danger" as ConfirmDialogTone,
    };
  };

  const handleConfirmAction = () => {
    if (!pendingConfirm) return;
    const { type, user } = pendingConfirm;
    if (type === "reject") {
      void runAction(
        user._id,
        () => rejectUser(user._id),
        t("adminPage.rejectSuccess"),
        () => onPatchUser?.(user._id, { approved: false, reviewStatus: "rejected" })
      );
      return;
    }
    if (type === "delete") {
      void runAction(
        user._id,
        () => deleteUser(user._id),
        t("adminPage.deleteSuccess"),
        () => onRemoveUser?.(user._id)
      );
      return;
    }
    void runAction(
      user._id,
      () => banUser(user._id, type === "ban"),
      type === "ban" ? t("adminPage.banSuccess") : t("adminPage.unbanSuccess"),
      () =>
        onPatchUser?.(user._id, {
          banned: type === "ban",
          reviewStatus: type === "ban" ? "suspended" : "approved",
        })
    );
  };

  const searching = Boolean(search.trim());

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[var(--shadow-sm)]">
        <div className="border-b border-border/70 bg-gradient-to-br from-[rgba(166,27,43,0.06)] via-transparent to-[rgba(201,162,39,0.05)] px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Users className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">All members</h2>
                  <p className="text-xs text-muted-foreground">
                    Newest signups first
                    {typeof total === "number" ? ` · ${total} total` : ""}
                    {searching ? " · searching all members (filters paused)" : ""}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-4 text-center text-xs">
              <div className="rounded-xl bg-background/70 px-3 py-2 ring-1 ring-border/60">
                <p className="text-base font-semibold tabular-nums">{approvedMale ?? "—"}</p>
                <p className="text-muted-foreground">{t("adminPage.approvedMen")}</p>
              </div>
              <div className="rounded-xl bg-background/70 px-3 py-2 ring-1 ring-border/60">
                <p className="text-base font-semibold tabular-nums">{approvedFemale ?? "—"}</p>
                <p className="text-muted-foreground">{t("adminPage.approvedWomen")}</p>
              </div>
              <div className="rounded-xl bg-background/70 px-3 py-2 ring-1 ring-border/60">
                <p className="text-base font-semibold tabular-nums">{approvedTotal ?? "—"}</p>
                <p className="text-muted-foreground">{t("adminPage.approvedTotal")}</p>
              </div>
            </div>
          </div>

          {canManageRoles ? (
            <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() => setOwnerToolsOpen((v) => !v)}
                aria-expanded={ownerToolsOpen}
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">Owner tools</p>
                  <p className="text-xs text-muted-foreground">
                    Email export &amp; typo cleanup — logged, rate-limited, owner only
                  </p>
                </div>
                <span className="text-xs font-semibold text-muted-foreground">
                  {ownerToolsOpen ? "Hide" : "Show"}
                </span>
              </button>
              {ownerToolsOpen ? (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-amber-500/20 pt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    disabled={exportingEmails || purgingTypos}
                    onClick={() => void exportEmailsForTesters()}
                  >
                    <Download className="mr-1.5 h-4 w-4" />
                    {exportingEmails ? "Exporting…" : "Export emails (Play)"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    disabled={purgingTypos || exportingEmails}
                    onClick={() => void purgeTypoEmailAccounts("dry-run")}
                  >
                    {purgingTypos ? "Working…" : "Scan fake emails"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    disabled={purgingTypos || exportingEmails}
                    onClick={() => void purgeTypoEmailAccounts("fix")}
                  >
                    Fix fake emails
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="rounded-xl"
                    disabled={purgingTypos || exportingEmails}
                    onClick={() => void purgeTypoEmailAccounts("delete")}
                  >
                    Delete fake-email users
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-4 p-4 sm:p-5">
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-12 rounded-xl border-border bg-background pl-10 text-base"
              placeholder="Name, email, country, city, phone…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-label="Search members"
            />
            {searching ? (
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => onSearchChange("")}
              >
                Clear
              </button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: combine words — e.g. <span className="font-medium text-foreground">ahmed somalia</span> or{" "}
            <span className="font-medium text-foreground">@gmail.com</span>. Also filters occupation, education, wali.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Country</p>
              <Input
                className="h-10 rounded-xl"
                placeholder="e.g. Somalia, Kenya…"
                value={countryFilter}
                onChange={(e) => onCountryFilterChange(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-label="Filter by country"
              />
            </div>
            {countryFilter.trim() ? (
              <div className="flex items-end">
                <button
                  type="button"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground h-10"
                  onClick={() => onCountryFilterChange("")}
                >
                  Clear country
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {search.trim().includes("@") ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-sm space-y-2">
            <p className="font-medium text-foreground">
              Email identity check
              {emailLookupLoading ? "…" : ""}
            </p>
            {emailLookup ? (
              <>
                <p className="text-muted-foreground">{emailLookup.hint}</p>
                {emailLookup.blocksSignup ? (
                  <ul className="space-y-2">
                    {emailLookup.users.map((u) => (
                      <li
                        key={u.userId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {u.profileName || u.name || "No display name"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {u.email || emailLookup.emailNormalized}
                            {u.hasProfile
                              ? ` · profile · ${u.reviewStatus ?? "—"}`
                              : " · orphan (no profile — hidden from list)"}
                            {u.banned ? " · banned" : ""}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {u.profileId ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="rounded-lg"
                              onClick={() => onOpenUser(u.profileId!)}
                            >
                              Open
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="rounded-lg"
                              disabled={releasingId === u.userId}
                              onClick={() => void releaseOrphan(u.userId)}
                            >
                              {releasingId === u.userId
                                ? "Releasing…"
                                : "Release email"}
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                    {emailLookup.passwordAccounts
                      .filter(
                        (a) =>
                          !emailLookup.users.some((u) => u.userId === a.userId)
                      )
                      .map((a) => (
                        <li
                          key={a.authAccountId}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="font-medium">Password login only</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {emailLookup.emailNormalized}
                              {a.hasProfile
                                ? " · linked profile exists"
                                : " · orphan auth row"}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {a.profileId ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="rounded-lg"
                                onClick={() => onOpenUser(a.profileId!)}
                              >
                                Open
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="rounded-lg"
                                disabled={releasingId === a.userId}
                                onClick={() => void releaseOrphan(a.userId)}
                              >
                                {releasingId === a.userId
                                  ? "Releasing…"
                                  : "Release email"}
                              </Button>
                            )}
                          </div>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </>
            ) : !emailLookupLoading ? (
              <p className="text-muted-foreground">
                Could not check auth identity for this email.
              </p>
            ) : null}
          </div>
        ) : null}

        {!searching ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {REVIEW_FILTERS.map((item) => {
                const active = reviewFilter === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => onReviewFilterChange(item.value)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {t(item.labelKey)}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{t("adminPage.filterByRole")}</p>
                <Select
                  value={roleFilter}
                  onValueChange={(value) => onRoleFilterChange(value as RoleFilter)}
                >
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("adminPage.filterAllRoles")}</SelectItem>
                    <SelectItem value="user">{t("adminPage.filterMembers")}</SelectItem>
                    <SelectItem value="admin">{t("adminPage.filterAdmins")}</SelectItem>
                    <SelectItem value="owner">{t("adminPage.filterOwner")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{t("adminPage.filterByPayment")}</p>
                <Select
                  value={paymentFilter}
                  onValueChange={(value) => onPaymentFilterChange(value as PaymentFilter)}
                >
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("adminPage.filterAllPayments")}</SelectItem>
                    <SelectItem value="unpaid">{t("adminPage.unpaid")}</SelectItem>
                    <SelectItem value="basic">{t("adminPage.paidBasic")}</SelectItem>
                    <SelectItem value="premium">{t("adminPage.paidPremium")}</SelectItem>
                    <SelectItem value="trial">{t("adminPage.trialMembers")}</SelectItem>
                    <SelectItem value="paid">{t("adminPage.filterAnyPaid")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{t("adminPage.filterByGender")}</p>
                <Select
                  value={genderFilter}
                  onValueChange={(value) => onGenderFilterChange(value as GenderFilter)}
                >
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("adminPage.filterAllGenders")}</SelectItem>
                    <SelectItem value="male">{t("adminPage.genderMale")}</SelectItem>
                    <SelectItem value="female">{t("adminPage.genderFemale")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className={cn("overflow-hidden rounded-2xl border border-border bg-card", isRefreshing && "opacity-80")}>
        <div className="hidden grid-cols-[minmax(0,1.6fr)_110px_100px_140px_minmax(0,1fr)] gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
          <span>{t("adminPage.colMember")}</span>
          <span>{t("adminPage.colStatus")}</span>
          <span>{t("adminPage.colPayment")}</span>
          <span>Joined</span>
          <span className="text-right">{t("adminPage.colActions")}</span>
        </div>

        {users === undefined ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="px-4 py-14 text-center space-y-2">
            <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {searching
                ? `No member found for “${search.trim()}”. Try name, email, country, city, or phone.`
                : t("adminPage.noUsers")}
            </p>
            {searching ||
            countryFilter.trim() ||
            reviewFilter !== "all" ||
            paymentFilter !== "all" ||
            roleFilter !== "all" ||
            genderFilter !== "all" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  onSearchChange("");
                  onCountryFilterChange("");
                  onReviewFilterChange("all");
                  onPaymentFilterChange("all");
                  onRoleFilterChange("all");
                  onGenderFilterChange("all");
                }}
              >
                Clear search & filters
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {users.map((user) => {
              const status = memberStatus(user);
              const busy = busyId === user._id;
              const paymentLabel = isStaffRole(user.role)
                ? t("adminPage.badgeStaff")
                : user.hasPaid
                  ? isPremiumUser(user)
                    ? t("adminPage.paidPremium")
                    : t("adminPage.paidBasic")
                  : t("adminPage.unpaid");
              const joined = formatJoined(
                (user as { registeredAt?: string | null }).registeredAt
              );

              return (
                <li
                  key={user._id}
                  className={cn(
                    "grid gap-3 px-4 py-4 transition-colors hover:bg-muted/30 lg:grid-cols-[minmax(0,1.6fr)_110px_100px_140px_minmax(0,1fr)] lg:items-center",
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 items-start gap-3 text-left"
                    onClick={() => onOpenUser(user._id)}
                  >
                    <AdminUserAvatar
                      name={user.name}
                      imageUrl={user.imageUrl}
                      profileImageMediaId={
                        (user as { profileImageMediaId?: string | null })
                          .profileImageMediaId
                      }
                      profileImageId={user.profileImageId as string | undefined}
                    />
                    <span className="min-w-0 space-y-0.5">
                      <span className="block truncate font-semibold text-foreground">
                        {user.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground capitalize">
                        {user.gender}
                        {[user.city, user.country].filter(Boolean).length > 0
                          ? ` · ${[user.city, user.country].filter(Boolean).join(", ")}`
                          : ""}
                      </span>
                      {user.email && (
                        <span className="flex items-center gap-1 truncate text-xs text-foreground/80">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate font-medium">{user.email}</span>
                        </span>
                      )}
                      {user.phone && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3 shrink-0" />
                          {user.phone}
                        </span>
                      )}
                      {joined ? (
                        <span className="block text-[11px] text-muted-foreground lg:hidden">
                          Joined {joined}
                        </span>
                      ) : null}
                    </span>
                  </button>

                  <div className="flex items-center gap-2 lg:block">
                    <span className="text-xs font-medium text-muted-foreground lg:hidden">
                      {t("adminPage.colStatus")}
                    </span>
                    <Badge className={cn("border-0 text-xs font-medium", status.className)}>
                      {t(status.labelKey)}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 lg:block">
                    <span className="text-xs font-medium text-muted-foreground lg:hidden">
                      {t("adminPage.colPayment")}
                    </span>
                    <p className="text-sm font-medium text-foreground">{paymentLabel}</p>
                  </div>

                  <div className="hidden lg:block text-xs text-muted-foreground tabular-nums">
                    {joined ?? "—"}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 rounded-lg"
                      onClick={() => onOpenUser(user._id)}
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                      {t("adminPage.viewProfile")}
                    </Button>

                    {isPremiumUser(user) && !isStaffRole(user.role) && (
                      <Button size="sm" variant="outline" className="h-9 rounded-lg" asChild>
                        <a
                          href={`${WHATSAPP_URL}?text=${encodeURIComponent(
                            `Hi, I'm contacting you about Hel Calafkaaga — ${user.name}.`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MessageCircle className="mr-1.5 h-3.5 w-3.5 text-[#25D366]" />
                          WhatsApp
                        </a>
                      </Button>
                    )}

                    {!isStaffRole(user.role) && !isMemberApproved(user) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 rounded-lg"
                        disabled={busy || !canApproveMember(user)}
                        title={t("adminPage.approveUser")}
                        onClick={() =>
                          void runAction(
                            user._id,
                            () => approveUser(user._id),
                            t("adminPage.approveSuccess"),
                            () =>
                              onPatchUser?.(user._id, {
                                approved: true,
                                reviewStatus: "approved",
                              })
                          )
                        }
                      >
                        <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                        {t("adminPage.approveShort")}
                      </Button>
                    )}

                    {canRejectMember(user) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 rounded-lg"
                        disabled={busy}
                        title={t("adminPage.rejectUser")}
                        onClick={() => setPendingConfirm({ type: "reject", user })}
                      >
                        {t("adminPage.rejectShort")}
                      </Button>
                    )}

                    {!isStaffRole(user.role) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 rounded-lg"
                        disabled={busy}
                        title={t("adminPage.requestPhotoTitle")}
                        onClick={() =>
                          void runAction(
                            user._id,
                            () => requestProfilePhoto(user._id),
                            t("adminPage.requestPhotoSuccess")
                          )
                        }
                      >
                        <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                        {t("adminPage.requestPhotoShort")}
                      </Button>
                    )}

                    {canManageRoles && user.role === "admin" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 rounded-lg"
                        disabled={busy}
                        onClick={() =>
                          void runAction(
                            user._id,
                            () => setUserRole(user._id, "user"),
                            t("adminPage.demoted"),
                            () => onPatchUser?.(user._id, { role: "user" })
                          )
                        }
                      >
                        {t("adminPage.removeAdmin")}
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 rounded-lg"
                      disabled={busy || isOwnerRole(user.role)}
                      onClick={() =>
                        setPendingConfirm({
                          type: user.banned ? "unban" : "ban",
                          user,
                        })
                      }
                    >
                      <Ban className="mr-1.5 h-3.5 w-3.5" />
                      {user.banned ? t("adminPage.unbanShort") : t("adminPage.banShort")}
                    </Button>

                    {!isStaffRole(user.role) && user._id !== currentProfileId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={busy}
                        onClick={() => setPendingConfirm({ type: "delete", user })}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        {t("adminPage.deleteShort")}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {hasMore && (
          <div className="flex justify-center pt-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={loadingMore}
              onClick={() => onLoadMore?.()}
            >
              {loadingMore ? t("common.loading") : t("adminPage.loadMoreMembers")}
            </Button>
          </div>
        )}
        {users && users.length > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            {t("adminPage.showingMembers", { count: users.length })}
          </p>
        )}
        </div>
      </div>

      {pendingConfirm && (
        <ConfirmDialog
          open
          {...confirmCopy(pendingConfirm)}
          cancelLabel={t("common.cancel")}
          busy={busyId === pendingConfirm.user._id}
          onCancel={() => {
            if (busyId === pendingConfirm.user._id) return;
            setPendingConfirm(null);
          }}
          onConfirm={handleConfirmAction}
        />
      )}
    </div>
  );
}
