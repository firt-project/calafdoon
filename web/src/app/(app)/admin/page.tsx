"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useUnifiedAuth } from "@/data/auth/hooks";
import {
  useAdminAnalytics,
  useAdminAuditLogs,
  useAdminBanUser,
  useAdminBootstrapStatus,
  useAdminCreateAnnouncement,
  useAdminReports,
  useAdminStats,
  useAdminSupportContacts,
  useAdminUpdateReportStatus,
  useAdminUsers,
} from "@/data/admin/hooks";
import {
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Flag,
  Headphones,
  Heart,
  Mail,
  Megaphone,
  MessageCircle,
  Phone,
  ScrollText,
  Settings,
  TrendingUp,
  Users,
  Wallet,
  LayoutDashboard,
  Clock,
} from "lucide-react";
import type {
  AdminAnalytics,
  AdminStats,
  CurrentUser,
  Profile as AdminUser,
} from "@/types";
import { AdminBootstrapPanel } from "@/components/admin/admin-bootstrap-panel";
import { AdminMembersPanel } from "@/components/admin/admin-members-panel";
import { AdminReviewQueuePanel, type PeriodDrilldown } from "@/components/admin/admin-review-queue-panel";
import { AdminStatusPeriodPanel } from "@/components/admin/admin-status-period-panel";
import { AdminStaffInvitesPanel } from "@/components/admin/admin-staff-invites-panel";
import { AdminUserDetailPanel } from "@/components/admin/admin-user-detail-panel";
import { AdminMessagesInbox } from "@/components/admin/admin-messages-inbox";
import { AdminContactsInbox } from "@/components/admin/admin-contacts-inbox";
import { AdminPaymentsDashboardPanel } from "@/components/admin/admin-payments-dashboard-panel";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { LoadingRecovery } from "@/components/auth/loading-recovery";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useLoadingTimeout } from "@/hooks/use-loading-timeout";
import { isStaffRole } from "@/lib/access";
import { getAuthenticatedHomeRoute } from "@/lib/routes";
import { useTranslation } from "@/lib/i18n/context";
import type { TranslationPath } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";
import {
  ADMIN_NAV_TABS,
  isAdminNavTab,
  type AdminNavTab,
} from "@/lib/admin-nav";
import {
  formatMoney,
  PERSONAL_SUPPORT_PRICE,
  PREMIUM_UPGRADE_PRICE,
  REGISTRATION_PRICE,
  SUPPORT_EMAIL,
  TRIAL_DAYS,
  WOMEN_BASIC_PRICE,
  WHATSAPP_DISPLAY,
  WHATSAPP_URL,
} from "@/lib/constants";

type RoleFilter = "all" | "user" | "admin" | "owner";
type PaymentFilter = "all" | "unpaid" | "paid" | "basic" | "premium" | "trial";
type GenderFilter = "all" | "male" | "female";
type ReviewFilter =
  | "all"
  | "needs_action"
  | "pending_review"
  | "approved"
  | "incomplete"
  | "rejected"
  | "suspended";

type AdminTab = AdminNavTab;

export default function AdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const tabParam = searchParams.get("tab");
  const activeTab: AdminTab = isAdminNavTab(tabParam) ? tabParam : "dashboard";
  const chatOpen = Boolean(searchParams.get("chat"));
  const profileParam = searchParams.get("profile");
  const selectedProfileId =
    profileParam && profileParam.length > 0
      ? (profileParam as string)
      : null;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [debouncedCountry, setDebouncedCountry] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [usersMode, setUsersMode] = useState<"members" | "review">("members");
  const [announcement, setAnnouncement] = useState({
    title: "",
    body: "",
    audience: "all" as "all" | "paid" | "trial" | "unpaid",
    scheduledForLocal: "",
  });
  const [reportNotes, setReportNotes] = useState<Record<string, string>>({});
  const [reportBusyId, setReportBusyId] = useState<string | null>(null);
  const [announcementSending, setAnnouncementSending] = useState(false);
  const [periodDrilldown, setPeriodDrilldown] = useState<PeriodDrilldown | null>(
    null
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCountry(countryFilter), 300);
    return () => clearTimeout(timer);
  }, [countryFilter]);

  const isMemberSearch = Boolean(debouncedSearch.trim());
  const { user: authUser } = useUnifiedAuth();
  const currentUser = authUser as CurrentUser | null | undefined;
  const userTimedOut = useLoadingTimeout(currentUser === undefined, 8_000);
  const staffRole =
    currentUser?.profile?.role ??
    (currentUser as { role?: string } | null | undefined)?.role;
  const isStaff = isStaffRole(staffRole);
  const bootstrapStatus = useAdminBootstrapStatus(
    currentUser !== undefined && !isStaff
  ) as
    | { hasAdmins?: boolean; canClaim?: boolean; reason?: string }
    | null
    | undefined;
  const adminStatsQuery = useAdminStats(currentUser !== undefined && !!isStaff);
  const stats = adminStatsQuery.stats as AdminStats | null | undefined;
  const reloadStats = adminStatsQuery.reload;
  const {
    users,
    total: membersTotal,
    isRefreshing: usersRefreshing,
    loadMore: loadMoreUsers,
    hasMore: hasMoreUsers,
    loadingMore: loadingMoreUsers,
    reload: reloadUsers,
    patchUser,
    removeUser,
  } = useAdminUsers(
    !!isStaff && activeTab === "users" && usersMode === "members",
    {
      // While searching, ignore role/payment/review/gender so name/email/country always finds the user.
      search: debouncedSearch || undefined,
      country: debouncedCountry.trim() || undefined,
      role: isMemberSearch ? "all" : roleFilter,
      payment: isMemberSearch ? "all" : paymentFilter,
      review: isMemberSearch ? "all" : reviewFilter,
      gender: isMemberSearch ? "all" : genderFilter,
      limit: 150,
      sortBy: "registered",
      sortOrder: "desc",
    }
  );
  const adminUsers = users as AdminUser[] | undefined;
  const analytics = useAdminAnalytics(
    !!isStaff && activeTab === "analytics"
  ) as AdminAnalytics | undefined;
  const reportsQuery = useAdminReports(
    !!isStaff && (activeTab === "reports" || activeTab === "dashboard")
  );
  const reports = reportsQuery.reports as Array<Record<string, any>> | undefined;
  const patchReport = reportsQuery.patchReport;
  const supportContactsQuery = useAdminSupportContacts(
    !!isStaff && (activeTab === "contacts" || activeTab === "dashboard"),
    { status: "open" }
  );
  const supportContacts = supportContactsQuery.contacts as
    | Array<Record<string, any>>
    | undefined;
  const auditLogs = useAdminAuditLogs(
    !!isStaff && activeTab === "audit",
    80
  ) as Array<Record<string, any>> | undefined;
  const banUser = useAdminBanUser();
  const createAnnouncement = useAdminCreateAnnouncement();
  const updateReportStatus = useAdminUpdateReportStatus();

  useEffect(() => {
    if (currentUser === undefined) return;
    if (isStaffRole(staffRole)) return;
    // First-time setup: stay on /admin to claim owner.
    if (bootstrapStatus == null) return;
    if (!bootstrapStatus.hasAdmins) return;
    router.replace(getAuthenticatedHomeRoute(currentUser?.profile));
  }, [bootstrapStatus, currentUser, router, staffRole]);

  const setTab = (tab: AdminTab) => {
    router.replace(`/admin?tab=${tab}`, { scroll: false });
  };

  const goMembers = (opts?: {
    role?: RoleFilter;
    payment?: PaymentFilter;
    review?: ReviewFilter;
    gender?: GenderFilter;
  }) => {
    setSearch("");
    setCountryFilter("");
    setRoleFilter(opts?.role ?? "all");
    setPaymentFilter(opts?.payment ?? "all");
    setReviewFilter(opts?.review ?? "all");
    setGenderFilter(opts?.gender ?? "all");
    setUsersMode("members");
    setTab("users");
  };

  const openUserProfile = (profileId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.get("tab")) params.set("tab", activeTab);
    params.set("profile", profileId);
    router.push(`/admin?${params.toString()}`, { scroll: false });
  };

  const closeUserProfile = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("profile");
    const qs = params.toString();
    router.push(qs ? `/admin?${qs}` : "/admin", { scroll: false });
  };

  const handleAnnouncement = async () => {
    if (!announcement.title || !announcement.body || announcementSending) return;
    setAnnouncementSending(true);
    try {
      const scheduledFor = announcement.scheduledForLocal
        ? new Date(announcement.scheduledForLocal).getTime()
        : undefined;
      if (
        announcement.scheduledForLocal &&
        (scheduledFor === undefined || Number.isNaN(scheduledFor))
      ) {
        toast.error(t("adminPage.scheduleInvalid"));
        return;
      }
      const result = (await createAnnouncement({
        title: announcement.title,
        body: announcement.body,
        audience: announcement.audience,
        scheduledFor,
      })) as { scheduled?: boolean } | undefined;
      toast.success(
        result?.scheduled
          ? t("adminPage.announcementScheduled")
          : t("adminPage.announcementSent")
      );
      setAnnouncement({
        title: "",
        body: "",
        audience: "all",
        scheduledForLocal: "",
      });
    } catch {
      toast.error(t("adminPage.announcementFailed"));
    } finally {
      setAnnouncementSending(false);
    }
  };

  if (currentUser === undefined) {
    return (
      <DashboardLayout>
        <LoadingRecovery stuck={userTimedOut} />
      </DashboardLayout>
    );
  }

  if (!isStaff) {
    if (bootstrapStatus === undefined) {
      return (
        <DashboardLayout>
          <Skeleton className="h-72 w-full rounded-2xl" />
        </DashboardLayout>
      );
    }
    return (
      <DashboardLayout>
        <div className="py-16">
          <AdminBootstrapPanel />
        </div>
      </DashboardLayout>
    );
  }

  const canManageRoles =
    staffRole === "owner" || stats?.isOwner === true;
  const pendingReviewCount = stats?.pendingApproval ?? 0;
  const openReports = reports?.filter((r) => r.status === "open").length ?? 0;
  const openContacts = supportContacts?.length ?? 0;

  const TAB_META: Record<
    AdminTab,
    { title: TranslationPath; desc: TranslationPath; icon: typeof Users }
  > = Object.fromEntries(
    ADMIN_NAV_TABS.map((item) => [
      item.tab,
      { title: item.titleKey, desc: item.descKey, icon: item.icon },
    ])
  ) as Record<AdminTab, { title: TranslationPath; desc: TranslationPath; icon: typeof Users }>;

  const isOwner = canManageRoles;
  const overviewStats: Array<{
    label: string;
    value: string | number;
    hint: string;
    icon: typeof Users;
    onClick?: () => void;
  }> = [
    {
      label: t("adminPage.totalUsers"),
      value: stats?.totalUsers ?? "—",
      hint: t("adminPage.statMembersHint"),
      icon: Users,
      onClick: () => goMembers(),
    },
    {
      label: t("adminPage.approvedMen"),
      value: stats?.approvedMale ?? "—",
      hint: t("adminPage.statApprovedMenHint"),
      icon: Users,
      onClick: () =>
        goMembers({ role: "user", review: "approved", gender: "male" }),
    },
    {
      label: t("adminPage.approvedWomen"),
      value: stats?.approvedFemale ?? "—",
      hint: t("adminPage.statApprovedWomenHint"),
      icon: Users,
      onClick: () =>
        goMembers({ role: "user", review: "approved", gender: "female" }),
    },
    {
      label: t("adminPage.approvedTotal"),
      value: stats?.approvedTotal ?? "—",
      hint: t("adminPage.statApprovedTotalHint"),
      icon: CheckCircle2,
      onClick: () => goMembers({ role: "user", review: "approved" }),
    },
    {
      label: t("adminPage.paidBasic"),
      value: stats?.money?.basicPaidCount ?? stats?.paidBasicCount ?? "—",
      hint: t("adminPage.statBasicPaidHint"),
      icon: CreditCard,
      onClick: () => goMembers({ role: "user", payment: "basic" }),
    },
    {
      label: t("adminPage.paidPremiumMembers"),
      value: stats?.paidPremiumCount ?? "—",
      hint: t("adminPage.statPremiumMembersHint"),
      icon: CreditCard,
      onClick: () => goMembers({ role: "user", payment: "premium" }),
    },
    {
      label: t("adminPage.trialMembers"),
      value: stats?.trialCount ?? "—",
      hint: t("adminPage.statTrialHint"),
      icon: Clock,
      onClick: () => goMembers({ role: "user", payment: "trial" }),
    },
    {
      label: t("adminPage.revenue"),
      value: stats?.money
        ? `$${(stats.money.totalRevenueCents / 100).toFixed(0)}`
        : stats
          ? `$${(stats.revenue / 100).toFixed(0)}`
          : "—",
      hint: t("adminPage.statRevenueHint"),
      icon: Wallet,
      onClick: () => setTab("payments"),
    },
    {
      label: t("adminPage.pendingReview"),
      value: stats?.pendingApproval ?? "—",
      hint: t("adminPage.statPendingHint"),
      icon: Flag,
      onClick: () => goMembers({ role: "user", review: "pending_review" }),
    },
    {
      label: t("adminPage.activeMatches"),
      value: stats?.totalMatches ?? "—",
      hint: t("adminPage.statMatchesHint"),
      icon: Heart,
      onClick: () => setTab("analytics"),
    },
    {
      label: t("adminPage.messages"),
      value: stats?.totalMessages ?? "—",
      hint: t("adminPage.statMessagesHint"),
      icon: MessageCircle,
      onClick: () => setTab("messages"),
    },
    {
      label: t("adminPage.openReports"),
      value: openReports,
      hint: t("adminPage.statReportsHint"),
      icon: Flag,
      onClick: () => setTab("reports"),
    },
    {
      label: t("adminPage.openContacts"),
      value: openContacts,
      hint: t("adminPage.statContactsHint"),
      icon: Headphones,
      onClick: () => setTab("contacts"),
    },
  ];

  return (
    <DashboardLayout>
      <div
        className={cn(
          "mx-auto max-w-6xl space-y-5 sm:space-y-6",
          !chatOpen && "pb-[calc(var(--app-tabbar)+0.75rem)] lg:pb-0"
        )}
      >
        <header
          className={cn(
            "relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-[rgba(166,27,43,0.07)] via-card to-[rgba(201,162,39,0.06)] px-4 py-5 shadow-[var(--shadow-sm)] sm:px-6 sm:py-6",
            chatOpen && "hidden lg:block"
          )}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {isOwner ? t("adminPage.ownerConsole") : t("adminPage.adminConsole")}
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {activeTab === "dashboard"
              ? t("adminPage.title")
              : t(TAB_META[activeTab].title)}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground lg:block">
            {activeTab === "dashboard"
              ? isOwner
                ? t("adminPage.ownerDesc")
                : t("adminPage.adminDesc")
              : t(TAB_META[activeTab].desc)}
          </p>
        </header>

        {activeTab === "dashboard" && (
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {overviewStats.map((stat) => {
              const clickable = typeof stat.onClick === "function";
              const Comp = clickable ? "button" : "div";
              return (
                <Comp
                  key={stat.label}
                  type={clickable ? "button" : undefined}
                  onClick={stat.onClick}
                  className={cn(
                    "rounded-2xl border border-border bg-card p-3.5 text-left shadow-[var(--shadow-sm)] sm:p-4",
                    clickable &&
                      "group cursor-pointer transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                >
                  <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-foreground">
                    <stat.icon className="h-[18px] w-[18px]" />
                  </div>
                  <p
                    className={cn(
                      "text-xl font-semibold tracking-tight sm:text-2xl",
                      clickable && "group-hover:text-primary"
                    )}
                  >
                    {stat.value}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-sm font-medium text-foreground">
                    <span>{stat.label}</span>
                    {clickable ? (
                      <ChevronRight className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 group-hover:text-primary" />
                    ) : null}
                  </p>
                  <p className="mt-1 hidden text-xs text-muted-foreground sm:block">
                    {stat.hint}
                  </p>
                  {clickable ? (
                    <p className="mt-1 hidden text-[11px] text-primary/80 opacity-0 transition-opacity group-hover:opacity-100 sm:block">
                      {t("adminPage.clickToView")}
                    </p>
                  ) : null}
                </Comp>
              );
            })}
          </section>
        )}

        {activeTab === "dashboard" && stats?.money && (
          <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-[var(--shadow-sm)] space-y-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                {t("adminPage.moneyTitle")}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("adminPage.moneyDesc")}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">{t("adminPage.moneyPlan")}</th>
                    <th className="pb-2 pr-3 font-medium text-right">{t("adminPage.moneyUsers")}</th>
                    <th className="pb-2 pr-3 font-medium text-right">{t("adminPage.moneyPrice")}</th>
                    <th className="pb-2 font-medium text-right">{t("adminPage.moneySubtotal")}</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  <tr className="border-b border-border/70">
                    <td className="py-2.5 pr-3 font-medium">
                      {t("adminPage.moneyBasicPaid")}
                    </td>
                    <td className="py-2.5 pr-3 text-right">{stats.money.basicPaidCount}</td>
                    <td className="py-2.5 pr-3 text-right">${REGISTRATION_PRICE}</td>
                    <td className="py-2.5 text-right font-semibold">
                      ${(stats.money.basicRevenueCents / 100).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="border-b border-border/70">
                    <td className="py-2.5 pr-3 font-medium">
                      {t("adminPage.moneyPremiumSignup")}
                    </td>
                    <td className="py-2.5 pr-3 text-right">{stats.money.premiumSignupCount}</td>
                    <td className="py-2.5 pr-3 text-right">${PERSONAL_SUPPORT_PRICE}</td>
                    <td className="py-2.5 text-right font-semibold">
                      ${(stats.money.premiumSignupRevenueCents / 100).toFixed(2)}
                    </td>
                  </tr>
                  <tr className="border-b border-border/70">
                    <td className="py-2.5 pr-3 font-medium">
                      {t("adminPage.moneyPremiumUpgrade")}
                    </td>
                    <td className="py-2.5 pr-3 text-right">{stats.money.premiumUpgradeCount}</td>
                    <td className="py-2.5 pr-3 text-right">${PREMIUM_UPGRADE_PRICE}</td>
                    <td className="py-2.5 text-right font-semibold">
                      ${(stats.money.premiumUpgradeRevenueCents / 100).toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td className="pt-3 pr-3 font-semibold">
                      {t("adminPage.moneyTotal")}
                    </td>
                    <td className="pt-3 pr-3 text-right font-semibold">
                      {stats.money.totalPaidCount}
                    </td>
                    <td className="pt-3 pr-3 text-right text-muted-foreground">—</td>
                    <td className="pt-3 text-right text-base font-bold text-primary">
                      ${(stats.money.totalRevenueCents / 100).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 text-xs text-muted-foreground">
              <p>
                {t("adminPage.moneyFreeBasicWomen", {
                  count: stats.freeBasicWomen ?? 0,
                })}
              </p>
              <p>
                {t("adminPage.moneyUnpaidMen", {
                  count: stats.unpaidCount ?? 0,
                })}
              </p>
              <p>
                {t("adminPage.moneyPremiumMembers", {
                  count: stats.paidPremiumCount ?? 0,
                })}
              </p>
            </div>
          </section>
        )}

        {(pendingReviewCount > 0 || openReports > 0 || openContacts > 0 || (stats?.unpaidCount ?? 0) > 0) &&
          (activeTab === "dashboard" || activeTab === "users") && (
          <section className="rounded-2xl border border-border bg-muted/30 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("adminPage.needsAttention")}
            </p>
            <div className="flex flex-wrap gap-2">
              {pendingReviewCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 rounded-xl"
                  onClick={() => {
                    goMembers({ role: "user", review: "pending_review" });
                  }}
                >
                  {t("adminPage.attentionPending", { count: pendingReviewCount })}
                </Button>
              )}
              {(stats?.unpaidCount ?? 0) > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 rounded-xl"
                  onClick={() => {
                    goMembers({ role: "user", payment: "unpaid" });
                  }}
                >
                  {t("adminPage.attentionUnpaid", { count: stats!.unpaidCount })}
                </Button>
              )}
              {openReports > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 rounded-xl"
                  onClick={() => setTab("reports")}
                >
                  {t("adminPage.attentionReports", { count: openReports })}
                </Button>
              )}
              {openContacts > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 rounded-xl"
                  onClick={() => setTab("contacts")}
                >
                  {t("adminPage.attentionContacts", { count: openContacts })}
                </Button>
              )}
            </div>
          </section>
        )}

        {activeTab === "dashboard" && (
          <section className="space-y-3 lg:hidden">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("adminPage.mobileQuickTitle")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  "users",
                  "messages",
                  "contacts",
                  "reports",
                ] as const
              ).map((tab) => {
                const meta = TAB_META[tab];
                const Icon = meta.icon;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setTab(tab)}
                    className="flex min-h-[5.5rem] flex-col items-start justify-between rounded-2xl border border-border bg-card p-4 text-left shadow-[var(--shadow-sm)] transition-colors active:bg-muted"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-semibold">{t(meta.title)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === "dashboard" && (
          <div className="hidden gap-4 sm:grid sm:grid-cols-2">
            <Card className="border-border shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("adminPage.quickActions")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setTab("users")}>
                  {t("adminPage.users")}
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setTab("messages")}>
                  {t("adminPage.messagesTab")}
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setTab("reports")}>
                  {t("adminPage.reports")}
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setTab("payments")}>
                  {t("adminPage.payments")}
                </Button>
              </CardContent>
            </Card>
            <Card className="border-border shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("adminPage.reviewQueue")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">{pendingReviewCount}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("adminPage.pendingReview")}
                </p>
                <Button
                  size="sm"
                  className="mt-4 rounded-xl"
                  onClick={() => {
                    setUsersMode("review");
                    setPeriodDrilldown(null);
                    setTab("users");
                  }}
                >
                  {t("adminPage.reviewProfiles")}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "users" && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-border/80 bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setUsersMode("members");
                    setPeriodDrilldown(null);
                  }}
                  className={cn(
                    "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                    usersMode === "members"
                      ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  All members
                </button>
                <button
                  type="button"
                  onClick={() => setUsersMode("review")}
                  className={cn(
                    "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                    usersMode === "review"
                      ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Review queue
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {usersMode === "members"
                  ? "Search name, email, country, city, phone · newest signups first"
                  : "Approve pending profiles · click Period activity numbers to open users"}
              </p>
            </div>

            {usersMode === "members" ? (
              <>
                <AdminMembersPanel
                  users={adminUsers}
                  total={membersTotal}
                  search={search}
                  onSearchChange={(value) => {
                    setSearch(value);
                    if (value.trim()) {
                      setReviewFilter("all");
                      setPaymentFilter("all");
                      setRoleFilter("all");
                      setGenderFilter("all");
                    }
                  }}
                  countryFilter={countryFilter}
                  onCountryFilterChange={setCountryFilter}
                  roleFilter={roleFilter}
                  onRoleFilterChange={setRoleFilter}
                  paymentFilter={paymentFilter}
                  onPaymentFilterChange={setPaymentFilter}
                  genderFilter={genderFilter}
                  onGenderFilterChange={setGenderFilter}
                  reviewFilter={reviewFilter}
                  onReviewFilterChange={setReviewFilter}
                  approvedMale={stats?.approvedMale}
                  approvedFemale={stats?.approvedFemale}
                  approvedTotal={stats?.approvedTotal}
                  currentProfileId={currentUser?.profile?._id}
                  canManageRoles={canManageRoles}
                  onOpenUser={openUserProfile}
                  onLoadMore={() => void loadMoreUsers()}
                  hasMore={hasMoreUsers}
                  loadingMore={loadingMoreUsers}
                  isRefreshing={usersRefreshing}
                  onPatchUser={patchUser}
                  onRemoveUser={removeUser}
                  onActionComplete={() => {
                    void reloadStats();
                  }}
                />
                {canManageRoles && <AdminStaffInvitesPanel />}
              </>
            ) : (
              <>
                <AdminStatusPeriodPanel
                  enabled
                  onDrilldown={(filter) => {
                    setPeriodDrilldown(filter);
                    requestAnimationFrame(() => {
                      document
                        .getElementById("admin-review-queue")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    });
                  }}
                />
                <AdminReviewQueuePanel
                  enabled
                  drilldown={periodDrilldown}
                  onClearDrilldown={() => setPeriodDrilldown(null)}
                  onOpenUser={openUserProfile}
                  onOpenHistory={openUserProfile}
                />
              </>
            )}
          </div>
        )}

        {activeTab === "payments" && (
          <AdminPaymentsDashboardPanel
            enabled={activeTab === "payments"}
            onOpenUser={openUserProfile}
            onActionComplete={() => {
              void reloadStats();
            }}
          />
        )}

        {activeTab === "analytics" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="border-border shadow-none">
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{t("adminPage.matchRate")}</p>
                <p className="mt-2 text-4xl font-semibold tracking-tight">
                  {analytics?.matchRate ?? 0}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("adminPage.matchRateHint")}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-none">
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{t("adminPage.conversionRate")}</p>
                <p className="mt-2 text-4xl font-semibold tracking-tight">
                  {analytics?.conversionRate ?? 0}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("adminPage.conversionRateHint")}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("adminPage.genderSplit")}</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const gender = analytics?.genderBreakdown ?? {
                    male: 0,
                    female: 0,
                    unknown: 0,
                  };
                  const entries = [
                    { key: "male", label: t("adminPage.genderMale"), count: gender.male },
                    { key: "female", label: t("adminPage.genderFemale"), count: gender.female },
                    {
                      key: "unknown",
                      label: t("adminPage.genderUnknown"),
                      count: gender.unknown,
                    },
                  ].filter((e) => e.count > 0);
                  const max = Math.max(...entries.map((e) => e.count), 1);
                  if (entries.length === 0) {
                    return (
                      <p className="text-sm text-muted-foreground">{t("adminPage.noAnalytics")}</p>
                    );
                  }
                  return (
                    <div className="space-y-3">
                      {entries.map((entry) => (
                        <div key={entry.key} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{entry.label}</span>
                            <span className="text-muted-foreground">{entry.count}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary/80"
                              style={{ width: `${(entry.count / max) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            <Card className="border-border shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("adminPage.reviewSplit")}</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const review = analytics?.reviewBreakdown ?? {};
                  const labels: Record<string, TranslationPath> = {
                    incomplete: "adminPage.statusIncomplete",
                    pending_review: "adminPage.statusPendingReview",
                    approved: "adminPage.reviewApproved",
                    rejected: "adminPage.statusRejected",
                    suspended: "adminPage.statusBanned",
                  };
                  const displayLabel = (key: string) =>
                    t(labels[key] ?? "adminPage.noAnalytics");
                  const entries = Object.entries(review)
                    .filter(([, count]) => count > 0)
                    .sort(([, a], [, b]) => b - a);
                  const max = Math.max(...entries.map(([, c]) => c), 1);
                  if (entries.length === 0) {
                    return (
                      <p className="text-sm text-muted-foreground">{t("adminPage.noAnalytics")}</p>
                    );
                  }
                  return (
                    <div className="space-y-3">
                      {entries.map(([key, count]) => (
                        <div key={key} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{displayLabel(key)}</span>
                            <span className="text-muted-foreground">{count}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-foreground/70"
                              style={{ width: `${(count / max) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            <Card className="border-border shadow-none sm:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("adminPage.monthlySignups")}</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const entries = Object.entries(analytics?.monthlySignups ?? {})
                    .sort(([a], [b]) => a.localeCompare(b))
                    .slice(-12);
                  const max = Math.max(...entries.map(([, c]) => c), 1);
                  if (entries.length === 0) {
                    return (
                      <p className="text-sm text-muted-foreground">{t("adminPage.noAnalytics")}</p>
                    );
                  }
                  return (
                    <div className="flex items-end gap-2 h-40">
                      {entries.map(([month, count]) => (
                        <div
                          key={month}
                          className="flex flex-1 flex-col items-center justify-end gap-1 min-w-0 h-full"
                        >
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {count}
                          </span>
                          <div
                            className="w-full max-w-10 rounded-t-md bg-primary/75"
                            style={{ height: `${Math.max(8, (count / max) * 100)}%` }}
                            title={`${month}: ${count}`}
                          />
                          <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                            {month.slice(5)}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            <Card className="border-border shadow-none sm:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("adminPage.usersByCountry")}</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(analytics?.countryBreakdown ?? {}).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("adminPage.noAnalytics")}</p>
                ) : (
                  (() => {
                    const entries = Object.entries(analytics?.countryBreakdown ?? {})
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 10);
                    const max = Math.max(...entries.map(([, c]) => c), 1);
                    return (
                      <div className="space-y-3">
                        {entries.map(([country, count]) => (
                          <div key={country} className="space-y-1.5">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">{country}</span>
                              <span className="text-muted-foreground">{count}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-foreground/80"
                                style={{ width: `${(count / max) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "announcements" && (
          <Card className="border-border shadow-none">
            <CardHeader>
              <CardTitle className="text-base">{t("adminPage.sendAnnouncement")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("adminPage.announcementTitle")}</Label>
                <Input
                  className="rounded-xl"
                  value={announcement.title}
                  onChange={(e) => setAnnouncement({ ...announcement, title: e.target.value })}
                  placeholder={t("adminPage.announcementTitlePh")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("adminPage.announcementBody")}</Label>
                <Textarea
                  className="rounded-xl"
                  value={announcement.body}
                  onChange={(e) => setAnnouncement({ ...announcement, body: e.target.value })}
                  placeholder={t("adminPage.announcementBodyPh")}
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("adminPage.announcementAudience")}</Label>
                <div className="flex flex-wrap gap-2">
                  {(["all", "paid", "trial", "unpaid"] as const).map((audience) => (
                    <Button
                      key={audience}
                      type="button"
                      size="sm"
                      variant={announcement.audience === audience ? "default" : "outline"}
                      className="rounded-full"
                      onClick={() => setAnnouncement({ ...announcement, audience })}
                    >
                      {t(`adminPage.audience_${audience}` as TranslationPath)}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("adminPage.announcementSchedule")}</Label>
                <Input
                  type="datetime-local"
                  className="rounded-xl"
                  value={announcement.scheduledForLocal}
                  onChange={(e) =>
                    setAnnouncement({
                      ...announcement,
                      scheduledForLocal: e.target.value,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t("adminPage.announcementScheduleHint")}
                </p>
              </div>
              <Button
                className="rounded-xl"
                disabled={announcementSending}
                onClick={() => void handleAnnouncement()}
              >
                {announcementSending
                  ? t("common.loading")
                  : announcement.scheduledForLocal
                    ? t("adminPage.scheduleSend")
                    : t("adminPage.sendToAll")}
              </Button>
            </CardContent>
          </Card>
        )}

        {activeTab === "messages" && (
          <AdminMessagesInbox onOpenUser={openUserProfile} />
        )}

        {activeTab === "contacts" && (
          <AdminContactsInbox onOpenUser={openUserProfile} />
        )}

        {activeTab === "reports" && (
          <div className="space-y-3">
            {reports === undefined ? (
              <Skeleton className="h-40 w-full rounded-2xl" />
            ) : reports.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border py-14 text-center">
                <Flag className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">{t("adminPage.noReports")}</p>
              </div>
            ) : (
              reports.map((report) => (
                <div
                  key={report._id}
                  className="space-y-3 rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={report.status === "open" ? "default" : "outline"}>
                      {report.status === "open"
                        ? t("adminPage.reportOpen")
                        : report.status === "reviewed"
                          ? t("adminPage.reportReviewed")
                          : t("adminPage.reportDismissed")}
                    </Badge>
                    <Badge variant="outline">{report.reason.replaceAll("_", " ")}</Badge>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <p>
                      <span className="text-muted-foreground">{t("adminPage.reportedUser")}: </span>
                      <button
                        type="button"
                        className="font-semibold underline-offset-2 hover:underline"
                        onClick={() => {
                          if (report.reportedProfileId) {
                            openUserProfile(report.reportedProfileId);
                          }
                        }}
                      >
                        {report.reportedName}
                      </button>
                    </p>
                    <p>
                      <span className="text-muted-foreground">{t("adminPage.reporter")}: </span>
                      <span className="font-medium">{report.reporterName}</span>
                    </p>
                  </div>
                  {report.details && (
                    <p className="text-sm text-muted-foreground">{report.details}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {new Date(report.createdAt).toLocaleString()}
                    {" · "}
                    {t("adminPage.priority")}: {report.priority ?? "medium"}
                  </p>
                  {report.status === "open" && (
                    <div className="space-y-3">
                      <Textarea
                        className="rounded-xl text-sm"
                        rows={2}
                        placeholder={t("adminPage.adminNotesPh")}
                        value={reportNotes[report._id] ?? ""}
                        onChange={(e) =>
                          setReportNotes((prev) => ({
                            ...prev,
                            [report._id]: e.target.value,
                          }))
                        }
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg"
                          disabled={reportBusyId === report._id}
                          onClick={() => {
                            setReportBusyId(report._id);
                            void updateReportStatus({
                              reportId: report._id,
                              status: "reviewed",
                              priority: "high",
                              adminNotes: reportNotes[report._id],
                              resolution: "reviewed",
                            })
                              .then(() => {
                                patchReport(report._id, {
                                  status: "reviewed",
                                  adminNotes: reportNotes[report._id],
                                });
                                toast.success(t("adminPage.reportUpdated"));
                              })
                              .finally(() => setReportBusyId(null));
                          }}
                        >
                          {t("adminPage.markReviewed")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-lg"
                          disabled={reportBusyId === report._id}
                          onClick={() => {
                            setReportBusyId(report._id);
                            void updateReportStatus({
                              reportId: report._id,
                              status: "dismissed",
                              priority: "low",
                              adminNotes: reportNotes[report._id],
                              resolution: "dismissed",
                            })
                              .then(() => {
                                patchReport(report._id, {
                                  status: "dismissed",
                                  adminNotes: reportNotes[report._id],
                                });
                                toast.success(t("adminPage.reportUpdated"));
                              })
                              .finally(() => setReportBusyId(null));
                          }}
                        >
                          {t("adminPage.dismiss")}
                        </Button>
                        {report.reportedProfileId && !report.reportedBanned && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="rounded-lg"
                            disabled={reportBusyId === report._id}
                            onClick={() => {
                              setReportBusyId(report._id);
                              void banUser(report.reportedProfileId!, true)
                                .then(() => {
                                  patchReport(report._id, { reportedBanned: true });
                                  patchUser(report.reportedProfileId!, {
                                    banned: true,
                                    reviewStatus: "suspended",
                                  });
                                  toast.success(t("adminPage.userBanned"));
                                })
                                .finally(() => setReportBusyId(null));
                            }}
                          >
                            {t("adminPage.banUser")}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  {report.adminNotes && report.status !== "open" && (
                    <p className="text-xs text-muted-foreground border-t border-border pt-2">
                      {t("adminPage.adminNotes")}: {report.adminNotes}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "audit" && (
          <div className="space-y-3">
            {auditLogs === undefined ? (
              <Skeleton className="h-40 w-full rounded-2xl" />
            ) : auditLogs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border py-14 text-center">
                <ScrollText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">{t("adminPage.noAuditLogs")}</p>
              </div>
            ) : (
              auditLogs.map((log) => (
                <div
                  key={log._id}
                  className="rounded-2xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">
                      {log.actorName}{" "}
                      <span className="font-normal text-muted-foreground">· {log.action}</span>
                    </p>
                    {log.targetName && (
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {t("adminPage.auditTarget")}: {log.targetName}
                      </p>
                    )}
                    {log.metadata && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{log.metadata}</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">
                    {new Date(log.createdAt).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="border-border shadow-none">
              <CardHeader>
                <CardTitle className="text-base">{t("adminPage.settingsPricing")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">{t("adminPage.basicPlan")}: </span>
                  <span className="font-semibold">
                    Men ${REGISTRATION_PRICE} · Women ${formatMoney(WOMEN_BASIC_PRICE)}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">{t("adminPage.premiumPlan")}: </span>
                  <span className="font-semibold">
                    Men ${PERSONAL_SUPPORT_PRICE} · Women ${PREMIUM_UPGRADE_PRICE}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">{t("adminPage.trialLength")}: </span>
                  <span className="font-semibold">
                    {TRIAL_DAYS} {t("adminPage.days")}
                  </span>
                </p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-none">
              <CardHeader>
                <CardTitle className="text-base">{t("adminPage.settingsSupport")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  {SUPPORT_EMAIL}
                </p>
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={WHATSAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary hover:underline"
                  >
                    {WHATSAPP_DISPLAY}
                  </a>
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {selectedProfileId && (
          <AdminUserDetailPanel
            profileId={selectedProfileId}
            onClose={closeUserProfile}
            onOpenUser={openUserProfile}
            onPatchUser={patchUser}
            onActionComplete={() => {
              void reloadStats();
            }}
          />
        )}
      </div>
      <AdminMobileNav
        activeTab={activeTab}
        onSelectTab={setTab}
        hidden={chatOpen}
      />
    </DashboardLayout>
  );
}
