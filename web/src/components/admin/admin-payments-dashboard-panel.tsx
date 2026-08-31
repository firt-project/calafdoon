"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CreditCard,
  Download,
  Eye,
  RefreshCw,
  Search,
  Smartphone,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { AdminEvcPaymentsPanel } from "@/components/admin/admin-evc-payments-panel";
import { PaymentGate } from "@/components/payment/payment-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiAdmin } from "@/data/admin/api";
import { formatMoney } from "@/lib/constants";
import { getSafeUserError } from "@/lib/safe-error";
import { useTranslation } from "@/lib/i18n/context";
import type { TranslationPath } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

type TranslateFn = (
  key: TranslationPath,
  params?: Record<string, string | number>
) => string;

type GatewayFilter = "all" | "stripe" | "waafi" | "manual";
type PanelView =
  | "overview"
  | "transactions"
  | "memberships"
  | "evc"
  | "activity"
  | "preview";

type RevenueDay = {
  date: string;
  stripeCents: number;
  waafiCents: number;
  manualCents: number;
  totalCents: number;
};

type MembershipRow = {
  profileId: string;
  name: string;
  phone?: string | null;
  membershipType: string;
  gateway?: string | null;
  paidUntil?: string | null;
  accessActive: boolean;
};

type DashboardData = {
  byGateway: Record<
    string,
    {
      completedCount: number;
      completedRevenueCents: number;
      pendingCount: number;
      failedCount: number;
    }
  >;
  totals: { completedCount: number; completedRevenueCents: number };
  evc: { pending: number; approved: number; rejected: number };
};

type PaymentRow = {
  _id: string;
  id?: string;
  userName?: string;
  userEmail?: string | null;
  userPhone?: string | null;
  amount: number;
  status: string;
  gateway?: string;
  paymentType?: string | null;
  registrationTier?: string | null;
  createdAt: number;
  fulfilledAt?: number | null;
  profileId?: string | null;
  membershipType?: string;
  paidUntil?: string | null;
  stripeSessionIdPrefix?: string;
};

type ActivityRow = {
  id: string;
  kind: string;
  action: string;
  gateway: string;
  status: string;
  amountCents: number;
  userName: string;
  userEmail: string | null;
  at: string;
  detail?: string | null;
};

type EvcHistoryRow = {
  _id: string;
  status: string;
  profileName?: string;
  amountCents?: number;
  payerFullName?: string;
  createdAt?: number;
  reviewedAt?: number | null;
  rejectionReason?: string | null;
};

function unwrapItems(d: unknown): unknown[] {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object" && Array.isArray((d as { items?: unknown[] }).items)) {
    return (d as { items: unknown[] }).items;
  }
  return [];
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function gatewayLabel(gateway: string, t: TranslateFn): string {
  if (gateway === "stripe") return t("adminPage.gatewayStripe");
  if (gateway === "waafi") return t("adminPage.gatewayWaafi");
  if (gateway === "manual") return t("adminPage.gatewayManual");
  return gateway;
}

function membershipLabel(type: string, t: TranslateFn): string {
  if (type === "stripe_subscription") return t("adminPage.membershipStripe");
  if (type === "waafi_period") return t("adminPage.membershipWaafi");
  if (type === "evc_period") return t("adminPage.membershipEvc");
  if (type === "legacy") return t("adminPage.membershipLegacy");
  return type;
}

function RevenueChart({ series, t }: { series: RevenueDay[]; t: TranslateFn }) {
  const recent = series.slice(-14);
  const max = Math.max(...recent.map((d) => d.totalCents), 1);
  if (recent.every((d) => d.totalCents === 0)) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        {t("adminPage.paymentsNoChartData")}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" /> Stripe
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> WaafiPay
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> EVC
        </span>
      </div>
      <div className="flex items-end gap-1 h-44 overflow-x-auto pb-1">
        {recent.map((day) => (
          <div
            key={day.date}
            className="flex min-w-[28px] flex-1 flex-col items-center justify-end gap-1 h-full"
            title={`${day.date}: ${formatCents(day.totalCents)}`}
          >
            <div
              className="flex w-full max-w-8 flex-col justify-end rounded-t-md overflow-hidden"
              style={{ height: `${Math.max(6, (day.totalCents / max) * 100)}%` }}
            >
              {day.stripeCents > 0 && (
                <div
                  className="w-full bg-primary"
                  style={{
                    flex: day.stripeCents,
                    minHeight: day.stripeCents > 0 ? 2 : 0,
                  }}
                />
              )}
              {day.waafiCents > 0 && (
                <div
                  className="w-full bg-emerald-500"
                  style={{
                    flex: day.waafiCents,
                    minHeight: day.waafiCents > 0 ? 2 : 0,
                  }}
                />
              )}
              {day.manualCents > 0 && (
                <div
                  className="w-full bg-amber-500"
                  style={{
                    flex: day.manualCents,
                    minHeight: day.manualCents > 0 ? 2 : 0,
                  }}
                />
              )}
            </div>
            <span className="text-[9px] text-muted-foreground tabular-nums">
              {day.date.slice(8)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function gatewayIcon(gateway: string) {
  if (gateway === "stripe") return CreditCard;
  if (gateway === "waafi") return Smartphone;
  return Wallet;
}

interface AdminPaymentsDashboardPanelProps {
  enabled?: boolean;
  onOpenUser?: (profileId: string) => void;
  onActionComplete?: () => void;
}

export function AdminPaymentsDashboardPanel({
  enabled = true,
  onOpenUser,
  onActionComplete,
}: AdminPaymentsDashboardPanelProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<PanelView>("overview");
  const [gateway, setGateway] = useState<GatewayFilter>("all");
  const [statusFilter, setStatusFilter] = useState<string>("completed");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [evcHistory, setEvcHistory] = useState<EvcHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [revenueSeries, setRevenueSeries] = useState<RevenueDay[]>([]);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [waafiQuery, setWaafiQuery] = useState("");
  const [waafiResults, setWaafiResults] = useState<PaymentRow[]>([]);
  const [exporting, setExporting] = useState(false);

  const loadDashboard = useCallback(async () => {
    const params: Record<string, string> = {};
    if (dateFrom) params.from = new Date(dateFrom).toISOString();
    if (dateTo) params.to = new Date(dateTo + "T23:59:59").toISOString();
    const d = (await apiAdmin.payments.dashboard(params)) as DashboardData;
    setDashboard(d);
  }, [dateFrom, dateTo]);

  const loadPayments = useCallback(async () => {
    const params: Record<string, string | number> = { limit: 50 };
    if (statusFilter) params.status = statusFilter;
    if (gateway !== "all") params.gateway = gateway;
    if (dateFrom) params.from = new Date(dateFrom).toISOString();
    if (dateTo) params.to = new Date(dateTo + "T23:59:59").toISOString();
    const d = await apiAdmin.payments.list(params);
    setPayments(unwrapItems(d) as PaymentRow[]);
  }, [gateway, statusFilter, dateFrom, dateTo]);

  const loadActivity = useCallback(async () => {
    const params: Record<string, string | number> = { limit: 50 };
    if (gateway !== "all") params.gateway = gateway;
    const d = await apiAdmin.payments.activity(params);
    setActivity(unwrapItems(d) as ActivityRow[]);
  }, [gateway]);

  const loadEvcHistory = useCallback(async () => {
    const d = await apiAdmin.payments.evcProofs({ status: "approved", limit: 30 });
    const rejected = await apiAdmin.payments.evcProofs({ status: "rejected", limit: 30 });
    setEvcHistory([
      ...(unwrapItems(d) as EvcHistoryRow[]),
      ...(unwrapItems(rejected) as EvcHistoryRow[]),
    ].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)));
  }, []);

  const loadRevenueChart = useCallback(async () => {
    const params: Record<string, string | number> = { days: 30 };
    if (dateFrom) params.from = new Date(dateFrom).toISOString();
    if (dateTo) params.to = new Date(dateTo + "T23:59:59").toISOString();
    const d = (await apiAdmin.payments.revenueChart(params)) as {
      series?: RevenueDay[];
    };
    setRevenueSeries(d.series ?? []);
  }, [dateFrom, dateTo]);

  const loadMemberships = useCallback(async () => {
    const d = await apiAdmin.payments.memberships({ limit: 80 });
    setMemberships(unwrapItems(d) as MembershipRow[]);
  }, []);

  const refreshAll = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      await Promise.all([
        loadDashboard(),
        loadPayments(),
        loadActivity(),
        loadEvcHistory(),
        loadRevenueChart(),
        loadMemberships(),
      ]);
    } catch (error) {
      toast.error(getSafeUserError(error, t("adminPage.paymentsLoadFailed")));
    } finally {
      setLoading(false);
    }
  }, [
    enabled,
    loadDashboard,
    loadPayments,
    loadActivity,
    loadEvcHistory,
    loadRevenueChart,
    loadMemberships,
    t,
  ]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (gateway !== "all") params.gateway = gateway;
      if (dateFrom) params.from = new Date(dateFrom).toISOString();
      if (dateTo) params.to = new Date(dateTo + "T23:59:59").toISOString();
      const csv = await apiAdmin.payments.exportCsv(params);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hel-payments-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("adminPage.paymentsExportDone"));
    } catch (error) {
      toast.error(getSafeUserError(error, t("adminPage.paymentsExportFailed")));
    } finally {
      setExporting(false);
    }
  };

  const handleWaafiSearch = async () => {
    const q = waafiQuery.trim();
    if (q.length < 4) {
      toast.error(t("adminPage.waafiSearchMin"));
      return;
    }
    try {
      const d = (await apiAdmin.payments.waafiLookup(q)) as { items?: PaymentRow[] };
      setWaafiResults(d.items ?? []);
      if ((d.items ?? []).length === 0) {
        toast.message(t("adminPage.waafiSearchEmpty"));
      }
    } catch (error) {
      toast.error(getSafeUserError(error, t("adminPage.actionFailed")));
    }
  };

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const openDetail = async (id: string) => {
    try {
      const d = await apiAdmin.payments.detail(id);
      setDetail(d as Record<string, unknown>);
    } catch (error) {
      toast.error(getSafeUserError(error, t("adminPage.actionFailed")));
    }
  };

  useEffect(() => {
    if (enabled && view === "transactions") {
      void loadPayments();
    }
  }, [enabled, view, statusFilter, gateway, loadPayments]);

  const gatewayCards: Array<{
    key: GatewayFilter;
    label: string;
    icon: typeof CreditCard;
  }> = [
    { key: "all", label: t("adminPage.gatewayAll"), icon: Wallet },
    { key: "stripe", label: t("adminPage.gatewayStripe"), icon: CreditCard },
    { key: "waafi", label: t("adminPage.gatewayWaafi"), icon: Smartphone },
    { key: "manual", label: t("adminPage.gatewayManual"), icon: Wallet },
  ];

  const views: Array<{ key: PanelView; label: string; icon: typeof Activity }> = [
    { key: "overview", label: t("adminPage.paymentsOverview"), icon: Wallet },
    { key: "transactions", label: t("adminPage.paymentsTransactions"), icon: CreditCard },
    { key: "memberships", label: t("adminPage.paymentsMemberships"), icon: Users },
    { key: "evc", label: t("adminPage.paymentsEvcQueue"), icon: Smartphone },
    { key: "activity", label: t("adminPage.paymentsActivity"), icon: Activity },
    { key: "preview", label: t("adminPage.paymentsMemberPreview"), icon: Eye },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{t("adminPage.paymentsHubTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("adminPage.paymentsHubDesc")}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            disabled={exporting}
            onClick={() => void handleExportCsv()}
          >
            <Download className="h-4 w-4 mr-2" />
            {exporting ? t("adminPage.paymentsExporting") : t("adminPage.paymentsExportCsv")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            disabled={loading}
            onClick={() => void refreshAll()}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            {t("adminPage.paymentsRefresh")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {views.map((v) => {
          const Icon = v.icon;
          return (
            <Button
              key={v.key}
              type="button"
              size="sm"
              variant={view === v.key ? "default" : "secondary"}
              className="rounded-xl"
              onClick={() => setView(v.key)}
            >
              <Icon className="h-3.5 w-3.5 mr-1.5" />
              {v.label}
            </Button>
          );
        })}
      </div>

      {(view === "overview" || view === "transactions" || view === "activity") && (
        <div className="flex flex-wrap gap-2">
          {gatewayCards.map((g) => {
            const Icon = g.icon;
            return (
              <Button
                key={g.key}
                type="button"
                size="sm"
                variant={gateway === g.key ? "default" : "outline"}
                className="rounded-xl"
                onClick={() => setGateway(g.key)}
              >
                <Icon className="h-3.5 w-3.5 mr-1.5" />
                {g.label}
              </Button>
            );
          })}
        </div>
      )}

      {(view === "overview" || view === "transactions") && (
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("adminPage.paymentsDateFrom")}</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-xl w-[160px]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("adminPage.paymentsDateTo")}</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-xl w-[160px]"
            />
          </div>
          <Button type="button" size="sm" variant="secondary" className="rounded-xl" onClick={() => void refreshAll()}>
            {t("adminPage.paymentsApplyDates")}
          </Button>
        </div>
      )}

      {view === "overview" && dashboard && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-border shadow-none">
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{t("adminPage.paymentsTotalRevenue")}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums">
                  {formatCents(dashboard.totals.completedRevenueCents)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {dashboard.totals.completedCount} {t("adminPage.paymentsCompletedCount")}
                </p>
              </CardContent>
            </Card>
            {(["stripe", "waafi", "manual"] as const).map((g) => {
              const stats = dashboard.byGateway[g];
              const Icon = gatewayIcon(g);
              return (
                <Card key={g} className="border-border shadow-none">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Icon className="h-4 w-4" />
                      {gatewayLabel(g, t)}
                    </div>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">
                      {formatCents(stats?.completedRevenueCents ?? 0)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {stats?.completedCount ?? 0} {t("adminPage.paymentsCompletedCount")}
                      {(stats?.pendingCount ?? 0) > 0 &&
                        ` · ${stats?.pendingCount} ${t("adminPage.paymentsPendingShort")}`}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="border-border shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("adminPage.paymentsRevenueChart")}</CardTitle>
            </CardHeader>
            <CardContent>
              <RevenueChart series={revenueSeries} t={t} />
            </CardContent>
          </Card>

          <Card className="border-border shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("adminPage.waafiLookupTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("adminPage.waafiLookupDesc")}</p>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={waafiQuery}
                  onChange={(e) => setWaafiQuery(e.target.value)}
                  placeholder={t("adminPage.waafiLookupPlaceholder")}
                  className="rounded-xl max-w-md"
                />
                <Button type="button" size="sm" className="rounded-xl" onClick={() => void handleWaafiSearch()}>
                  <Search className="h-4 w-4 mr-2" />
                  {t("adminPage.waafiLookupSearch")}
                </Button>
              </div>
              {waafiResults.length > 0 && (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {waafiResults.map((row) => (
                    <li key={row._id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium">{row.userName}</p>
                        <p className="text-xs text-muted-foreground">{row.stripeSessionIdPrefix}</p>
                      </div>
                      <span className="font-semibold tabular-nums">{formatCents(row.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-border shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("adminPage.paymentsEvcSummary")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4 text-sm">
              <Badge variant="secondary">{dashboard.evc.pending} {t("adminPage.evcPendingShort")}</Badge>
              <Badge variant="outline">{dashboard.evc.approved} {t("adminPage.evcApprovedShort")}</Badge>
              <Badge variant="outline">{dashboard.evc.rejected} {t("adminPage.evcRejectedShort")}</Badge>
            </CardContent>
          </Card>
        </>
      )}

      {view === "transactions" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {["completed", "pending", "failed", ""].map((s) => (
              <Button
                key={s || "all-status"}
                type="button"
                size="sm"
                variant={statusFilter === s ? "default" : "outline"}
                className="rounded-xl"
                onClick={() => setStatusFilter(s)}
              >
                {s ? s : t("adminPage.paymentsAllStatuses")}
              </Button>
            ))}
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {payments.length === 0 ? (
              <div className="px-4 py-14 text-center text-sm text-muted-foreground">
                {t("adminPage.noPayments")}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {payments.map((payment) => (
                  <li
                    key={payment._id}
                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{payment.userName}</p>
                        {payment.gateway && (
                          <Badge variant="secondary" className="text-xs">
                            {gatewayLabel(payment.gateway, t)}
                          </Badge>
                        )}
                        {payment.membershipType && (
                          <Badge variant="outline" className="text-xs">
                            {membershipLabel(payment.membershipType, t)}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs capitalize">
                          {payment.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(payment.createdAt).toLocaleString()}
                      </p>
                      {payment.userEmail && (
                        <p className="truncate text-xs text-muted-foreground">{payment.userEmail}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xl font-semibold tabular-nums">
                        {formatCents(payment.amount)}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => void openDetail(payment._id)}
                      >
                        {t("adminPage.paymentsViewDetail")}
                      </Button>
                      {payment.profileId && onOpenUser && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="rounded-xl"
                          onClick={() => onOpenUser(payment.profileId!)}
                        >
                          {t("adminPage.viewMember")}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {view === "memberships" && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {memberships.length === 0 ? (
            <p className="px-4 py-14 text-center text-sm text-muted-foreground">
              {t("adminPage.paymentsNoMemberships")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {memberships.map((m) => (
                <li
                  key={m.profileId}
                  className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{m.name}</p>
                      <Badge variant={m.accessActive ? "default" : "outline"} className="text-xs">
                        {m.accessActive
                          ? t("adminPage.membershipActive")
                          : t("adminPage.membershipExpired")}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {membershipLabel(m.membershipType, t)}
                      </Badge>
                    </div>
                    {m.paidUntil && (
                      <p className="text-xs text-muted-foreground">
                        {t("adminPage.membershipUntil")}{" "}
                        {new Date(m.paidUntil).toLocaleString()}
                      </p>
                    )}
                    {m.phone && (
                      <p className="text-xs text-muted-foreground">{m.phone}</p>
                    )}
                  </div>
                  {onOpenUser && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-xl shrink-0"
                      onClick={() => onOpenUser(m.profileId)}
                    >
                      {t("adminPage.viewMember")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {view === "evc" && (
        <div className="space-y-8">
          <AdminEvcPaymentsPanel
            enabled={enabled}
            onActionComplete={() => {
              onActionComplete?.();
              void refreshAll();
            }}
          />
          <div className="space-y-3">
            <h3 className="font-semibold">{t("adminPage.paymentsEvcHistory")}</h3>
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {evcHistory.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("adminPage.paymentsNoEvcHistory")}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {evcHistory.slice(0, 20).map((row) => (
                    <li key={row._id} className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{row.profileName}</span>
                        <Badge variant="outline" className="capitalize">{row.status}</Badge>
                        <span className="tabular-nums">{formatCents(row.amountCents ?? 0)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                        {row.rejectionReason ? ` · ${row.rejectionReason}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {view === "activity" && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {activity.length === 0 ? (
            <p className="px-4 py-14 text-center text-sm text-muted-foreground">
              {t("adminPage.paymentsNoActivity")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {activity.map((row) => (
                <li key={`${row.kind}-${row.id}`} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="secondary">{gatewayLabel(row.gateway, t)}</Badge>
                    <span className="font-medium">{row.userName}</span>
                    <span className="text-muted-foreground capitalize">
                      {row.action.replace(/_/g, " ")}
                    </span>
                    <span className="tabular-nums font-semibold ml-auto">
                      {formatCents(row.amountCents)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(row.at).toLocaleString()}
                    {row.userEmail ? ` · ${row.userEmail}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {view === "preview" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
            {t("adminPage.paymentsPreviewBanner")}
          </div>
          <div className="rounded-3xl border border-border bg-muted/30 p-4 sm:p-6 pointer-events-none select-none opacity-95">
            <PaymentGate
              previewMode
              title={t("payment.profileReadyTitle")}
              description={t("payment.profileReadyDesc", {
                basic: formatMoney(4.99),
                premium: formatMoney(20),
                monthly: formatMoney(1),
              })}
              gender="male"
            />
          </div>
        </div>
      )}

      {detail && (
        <Card className="border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">{t("adminPage.paymentsDetailTitle")}</CardTitle>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDetail(null)}>
              {t("common.a11yClose")}
            </Button>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {[
                ["gateway", detail.gateway],
                ["status", detail.status],
                ["amount", formatCents(Number(detail.amount ?? 0))],
                ["profileName", detail.profileName],
                ["userEmail", detail.userEmail],
                ["createdAt", detail.createdAt],
                ["fulfilledAt", detail.fulfilledAt ?? "—"],
                ["paymentType", detail.paymentType ?? "—"],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground capitalize">{String(label)}</dt>
                  <dd className="font-medium text-right">{String(value ?? "—")}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
