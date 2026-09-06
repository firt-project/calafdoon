import "./admin.css";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  Activity,
  Bell,
  Check,
  ChevronRight,
  ClipboardList,
  Eye,
  Flag,
  MessageCircle,
  Shield,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { admin, support } from "@hel/api-client";
import {
  staffRoleLabel,
  useSession,
} from "@/features/auth/SessionProvider";
import { EmptyState, SkeletonCard } from "@/ui/mobile-kit";
import { userFacingError } from "@/platform/errors";
import { hapticError, hapticSuccess } from "@/platform/haptics";
import { securityGateRouteForUser } from "@/lib/security-gate-codes";

type AdminStats = {
  totalUsers?: number;
  pendingApproval?: number;
  unpaidCount?: number;
  bannedUsers?: number;
  totalMatches?: number;
  totalMessages?: number;
  revenue?: number;
  money?: { totalRevenueCents?: number };
};

type MemberRow = {
  _id?: string;
  id?: string;
  userId?: string;
  name?: string | null;
  email?: string | null;
  reviewStatus?: string | null;
  hasPaid?: boolean;
  hasPersonalSupport?: boolean;
  banned?: boolean;
  role?: string;
  gender?: string | null;
  city?: string | null;
  country?: string | null;
  imageUrl?: string | null;
  paidCents?: number;
};

type ReportRow = {
  id?: string;
  _id?: string;
  reason?: string;
  details?: string;
  status?: string;
  priority?: string;
  reportedName?: string;
  reporterName?: string;
  reportedProfileId?: string | null;
  reportedBanned?: boolean;
  createdAt?: number;
};

type ConvRow = {
  conversationId?: string;
  lastMessageAt?: number;
  lastMessage?: { body?: string } | null;
  memberA?: { name?: string };
  memberB?: { name?: string };
};

type AnnounceRow = {
  id?: string;
  title?: string;
  body?: string;
  audience?: string;
  sentAt?: string | null;
  createdAt?: string;
};

function pid(m: { _id?: string; id?: string }): string | null {
  return m._id ?? m.id ?? null;
}

function money(cents?: number): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(0)}`;
}

function statusPill(status?: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s.includes("pending") || s === "open") return "warn";
  if (s.includes("approved") || s === "reviewed" || s.includes("sent")) return "ok";
  if (s.includes("reject") || s.includes("ban") || s === "dismissed") return "danger";
  return "";
}

export function RequireStaff({ children }: { children: React.ReactNode }) {
  const { ready, user, accessState } = useSession();
  if (!ready) {
    return (
      <div className="screen" aria-busy="true">
        <p className="muted">Checking your session…</p>
      </div>
    );
  }
  if (!user) return null;
  const gate = securityGateRouteForUser(user);
  if (gate) return <Navigate to={gate} replace />;
  if (!staffRoleLabel(user, accessState)) {
    return (
      <div className="screen pad-tab">
        <EmptyState
          icon={<Shield size={22} />}
          title="Staff only"
          body="This area is for Admin and Owner accounts."
          action={
            <Link to="/discover" className="btn btn-primary">
              Go to Discover
            </Link>
          }
        />
      </div>
    );
  }
  return children;
}

export function AdminHomePage() {
  const { user, accessState } = useSession();
  const roleLabel = staffRoleLabel(user, accessState) ?? "Admin";
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    admin
      .stats()
      .then((data) => setStats((data as AdminStats) ?? null))
      .catch((e) => setError(userFacingError(e)))
      .finally(() => setLoading(false));
  }, []);

  const revenue =
    stats?.money?.totalRevenueCents ?? stats?.revenue ?? 0;

  return (
    <div className="screen pad-tab">
      <div className="admin-hero reveal">
        <h1>{roleLabel === "Owner" ? "Owner console" : "Admin console"}</h1>
        <p>
          {roleLabel === "Owner"
            ? "Full control — members, Stripe payments, reports, and announcements."
            : "Manage members, payments, and platform activity."}
        </p>
      </div>

      {loading && <SkeletonCard />}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      {stats && (
        <div className="admin-stat-grid reveal">
          <div className="admin-stat">
            <strong>{stats.totalUsers ?? 0}</strong>
            <span>Members</span>
          </div>
          <div className="admin-stat">
            <strong>{stats.pendingApproval ?? 0}</strong>
            <span>Pending review</span>
          </div>
          <div className="admin-stat">
            <strong>{money(revenue)}</strong>
            <span>Revenue</span>
          </div>
          <div className="admin-stat">
            <strong>{stats.unpaidCount ?? 0}</strong>
            <span>Unpaid</span>
          </div>
          <div className="admin-stat">
            <strong>{stats.totalMatches ?? 0}</strong>
            <span>Matches</span>
          </div>
        </div>
      )}

      <div className="admin-nav-grid">
        <Link className="admin-nav-card" to="/admin/members">
          <span className="admin-nav-icon">
            <Users size={18} />
          </span>
          <span className="meta">
            <strong>Members</strong>
            <span>Review, approve, reject, ban</span>
          </span>
          <ChevronRight size={16} aria-hidden />
        </Link>
        <Link className="admin-nav-card" to="/admin/payments">
          <span className="admin-nav-icon">
            <Wallet size={18} />
          </span>
          <span className="meta">
            <strong>Payments</strong>
            <span>Card + EVC / M-PESA proofs</span>
          </span>
          <ChevronRight size={16} aria-hidden />
        </Link>
        <Link className="admin-nav-card" to="/admin/reports">
          <span className="admin-nav-icon">
            <Flag size={18} />
          </span>
          <span className="meta">
            <strong>Reports</strong>
            <span>Safety reports from members</span>
          </span>
          <ChevronRight size={16} aria-hidden />
        </Link>
        <Link className="admin-nav-card" to="/admin/messages">
          <span className="admin-nav-icon">
            <MessageCircle size={18} />
          </span>
          <span className="meta">
            <strong>Messages</strong>
            <span>Support inbox + member chats</span>
          </span>
          <ChevronRight size={16} aria-hidden />
        </Link>
        <Link className="admin-nav-card" to="/admin/analytics">
          <span className="admin-nav-icon">
            <Activity size={18} />
          </span>
          <span className="meta">
            <strong>Analytics</strong>
            <span>Signups, countries, conversion</span>
          </span>
          <ChevronRight size={16} aria-hidden />
        </Link>
        <Link className="admin-nav-card" to="/admin/audit">
          <span className="admin-nav-icon">
            <ClipboardList size={18} />
          </span>
          <span className="meta">
            <strong>Audit log</strong>
            <span>Staff actions history</span>
          </span>
          <ChevronRight size={16} aria-hidden />
        </Link>
        {roleLabel === "Owner" && (
          <Link className="admin-nav-card" to="/admin/invites">
            <span className="admin-nav-icon">
              <UserPlus size={18} />
            </span>
            <span className="meta">
              <strong>Invite admin</strong>
              <span>Send admin invite by email</span>
            </span>
            <ChevronRight size={16} aria-hidden />
          </Link>
        )}
        <Link className="admin-nav-card" to="/admin/announcements">
          <span className="admin-nav-icon">
            <Bell size={18} />
          </span>
          <span className="meta">
            <strong>Announcements</strong>
            <span>Message every member</span>
          </span>
          <ChevronRight size={16} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

export function AdminMembersPage() {
  const [items, setItems] = useState<MemberRow[]>([]);
  const [filter, setFilter] = useState<
    "all" | "pending_review" | "approved" | "rejected"
  >("all");
  const [roleFilter, setRoleFilter] = useState<"all" | "user" | "admin" | "owner">(
    "all"
  );
  const [planFilter, setPlanFilter] = useState<
    "all" | "unpaid" | "paid" | "basic" | "premium"
  >("all");
  const [search, setSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (opts: { append: boolean; pageCursor: string | null }) => {
      if (opts.append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const res = (await admin.users.list({
          reviewStatus: filter === "all" ? undefined : filter,
          role: roleFilter === "all" ? undefined : roleFilter,
          payment: planFilter === "all" ? undefined : planFilter,
          search: search.trim() || undefined,
          limit: 100,
          cursor: opts.pageCursor || undefined,
        })) as { items?: MemberRow[]; nextCursor?: string | null };
        const page = Array.isArray(res?.items) ? res.items : [];
        setItems((prev) => (opts.append ? [...prev, ...page] : page));
        setNextCursor(res?.nextCursor ?? null);
      } catch (e) {
        setError(userFacingError(e));
        if (!opts.append) setItems([]);
        setNextCursor(null);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filter, roleFilter, planFilter, search]
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      void fetchPage({ append: false, pageCursor: null });
    }, 250);
    return () => window.clearTimeout(t);
  }, [fetchPage]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    await fetchPage({ append: true, pageCursor: nextCursor });
  }

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await fn();
      await hapticSuccess();
      await fetchPage({ append: false, pageCursor: null });
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="screen pad-tab">
      <header className="screen-header">
        <Link to="/admin" className="back-btn" aria-label="Back">
          ←
        </Link>
        <h1>Members</h1>
      </header>

      <div className="admin-search">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, email, country, city, phone…"
          aria-label="Search members"
        />
      </div>

      <div className="admin-chip-row" role="tablist" aria-label="Review filters">
        {(
          [
            ["all", "All"],
            ["pending_review", "Pending"],
            ["approved", "Approved"],
            ["rejected", "Rejected"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`admin-chip${filter === key ? " active" : ""}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="admin-chip-row" role="tablist" aria-label="Role filters">
        {(
          [
            ["all", "Any role"],
            ["user", "Members"],
            ["admin", "Admins"],
            ["owner", "Owners"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`admin-chip${roleFilter === key ? " active" : ""}`}
            onClick={() => setRoleFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="admin-chip-row" role="tablist" aria-label="Plan filters">
        {(
          [
            ["all", "Any plan"],
            ["unpaid", "Unpaid"],
            ["paid", "Paid"],
            ["basic", "Basic"],
            ["premium", "Premium"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`admin-chip${planFilter === key ? " active" : ""}`}
            onClick={() => setPlanFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {!loading && items.length > 0 && (
        <p className="muted small" style={{ margin: "0 0 0.65rem" }}>
          Showing {items.length}
          {nextCursor ? "+" : ""} members
          {filter !== "all" ? ` · ${filter.replace("_", " ")}` : ""}
          {roleFilter !== "all" ? ` · ${roleFilter}` : ""}
          {planFilter !== "all" ? ` · ${planFilter}` : ""}
        </p>
      )}

      {loading && <SkeletonCard />}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {!loading && items.length === 0 ? (
        <EmptyState
          icon={<Users size={22} />}
          title="No members here"
          body="Try All filter or clear the search."
        />
      ) : (
        <>
          {items.map((m) => {
            const id = pid(m);
            if (!id) return null;
            const name = m.name ?? m.email ?? "Member";
            return (
              <article key={id} className="admin-member-card">
                <div className="title-row">
                  <div className="admin-member-head">
                    <div className="admin-list-avatar" aria-hidden>
                      {m.imageUrl ? (
                        <img src={m.imageUrl} alt="" loading="lazy" />
                      ) : (
                        <span>{name.slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="meta">
                      <strong>{name}</strong>
                      <p className="muted small" style={{ margin: "0.2rem 0 0" }}>
                        {m.email ?? "—"}
                        {m.gender ? ` · ${m.gender}` : ""}
                        {m.city || m.country
                          ? ` · ${[m.city, m.country].filter(Boolean).join(", ")}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <span className={`admin-pill ${statusPill(m.reviewStatus)}`}>
                    {m.reviewStatus ?? "—"}
                  </span>
                </div>
                <p className="muted small" style={{ margin: "0.45rem 0 0" }}>
                  {m.hasPersonalSupport
                    ? "Premium"
                    : m.hasPaid
                      ? "Basic"
                      : "Unpaid"}
                  {m.banned ? " · Banned" : ""}
                  {m.role && m.role !== "user" ? ` · ${m.role}` : ""}
                </p>
                <div className="admin-actions">
                  <Link to={`/admin/members/${id}`} className="btn btn-primary">
                    <Eye size={15} /> View
                  </Link>
                  {m.reviewStatus === "pending_review" && (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busyId === id}
                        onClick={() =>
                          void act(id, () => admin.users.approve(id))
                        }
                      >
                        <Check size={15} /> Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busyId === id}
                        onClick={() =>
                          void act(id, () =>
                            admin.users.reject(
                              id,
                              "Rejected from mobile admin"
                            )
                          )
                        }
                      >
                        <X size={15} /> Reject
                      </button>
                    </>
                  )}
                  {!m.banned ? (
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={busyId === id}
                      onClick={() => void act(id, () => admin.users.ban(id))}
                    >
                      Ban
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busyId === id}
                      onClick={() => void act(id, () => admin.users.unban(id))}
                    >
                      Unban
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {nextCursor && (
            <button
              type="button"
              className="btn btn-secondary btn-block"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              style={{ marginTop: "0.5rem", marginBottom: "1rem" }}
            >
              {loadingMore ? "Loading…" : "Load more members"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

type PaymentRow = {
  _id?: string;
  id?: string;
  amount?: number;
  status?: string;
  paymentType?: string | null;
  registrationTier?: string | null;
  createdAt?: number | string | null;
  fulfilledAt?: number | string | null;
  userEmail?: string | null;
  userName?: string | null;
  profileName?: string | null;
  userPhone?: string | null;
  stripeSessionIdPrefix?: string | null;
};

type EvcProofRow = {
  _id?: string;
  id?: string;
  tier?: string;
  amountCents?: number;
  payerFullName?: string;
  lastFourDigits?: string;
  createdAt?: string;
  screenshotUrl?: string | null;
  userEmail?: string | null;
  userPhone?: string | null;
  profileName?: string | null;
};

type PaymentStats = {
  total?: number;
  byStatus?: Record<string, { count?: number; amountCents?: number }>;
};

type GatewayBucket = {
  completedCount: number;
  completedRevenueCents: number;
  pendingCount: number;
  failedCount: number;
};

type PaymentsDashboard = {
  byGateway?: Partial<Record<"stripe" | "waafi" | "paystack" | "manual", GatewayBucket>>;
  totals?: { completedCount?: number; completedRevenueCents?: number };
  evc?: { pending?: number; approved?: number; rejected?: number };
};

const GATEWAY_LABELS: Record<string, string> = {
  waafi: "WaafiPay",
  paystack: "M-Pesa · card (Paystack)",
  stripe: "Card (Stripe)",
  manual: "Manual · EVC",
};

function paymentChannel(p: PaymentRow): "Card" | "EVC / M-PESA" {
  const sid = String(p.stripeSessionIdPrefix ?? "");
  if (sid.startsWith("evc:") || sid.startsWith("evc")) return "EVC / M-PESA";
  return "Card";
}

function paymentLabel(p: PaymentRow): string {
  const channel = paymentChannel(p);
  let plan = "Payment";
  if (
    p.registrationTier === "premium" ||
    p.paymentType === "registration_premium"
  ) {
    plan = "Registration · Premium";
  } else if (p.paymentType === "premium_upgrade") {
    plan = "Premium upgrade";
  } else if (p.registrationTier === "basic" || p.paymentType === "registration") {
    plan = "Registration · Basic";
  } else if (p.paymentType === "chat") {
    plan = "Chat unlock";
  } else if (typeof p.amount === "number") {
    plan = `$${(p.amount / 100).toFixed(p.amount % 100 === 0 ? 0 : 2)}`;
  }
  return `${plan} · ${channel}`;
}

function formatPaymentWhen(value: number | string | null | undefined): string {
  if (value == null || value === "") return "—";
  const d = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatCents(cents: number | undefined | null): string {
  if (cents == null || Number.isNaN(cents)) return "$0";
  const dollars = cents / 100;
  return `$${dollars.toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function statusPillClass(status: string | undefined): string {
  if (status === "completed") return "admin-pill ok";
  if (status === "pending") return "admin-pill warn";
  if (status === "failed") return "admin-pill danger";
  return "admin-pill";
}

export function AdminPaymentsPage() {
  const [items, setItems] = useState<PaymentRow[]>([]);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [dashboard, setDashboard] = useState<PaymentsDashboard | null>(null);
  const [evcProofs, setEvcProofs] = useState<EvcProofRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "completed" | "pending"
  >("all");
  const [tierFilter, setTierFilter] = useState<"all" | "basic" | "premium">(
    "all"
  );
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadEvc = useCallback(async () => {
    try {
      const res = await admin.evc.pending();
      const list = Array.isArray(res)
        ? res
        : Array.isArray((res as { items?: EvcProofRow[] })?.items)
          ? (res as { items: EvcProofRow[] }).items
          : [];
      setEvcProofs(list as EvcProofRow[]);
    } catch {
      setEvcProofs([]);
    }
  }, []);

  const fetchPage = useCallback(
    async (opts: { append: boolean; pageCursor: string | null }) => {
      if (opts.append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const res = (await admin.payments.list({
          status: statusFilter === "all" ? undefined : statusFilter,
          registrationTier: tierFilter === "all" ? undefined : tierFilter,
          limit: 50,
          cursor: opts.pageCursor || undefined,
        })) as { items?: PaymentRow[]; nextCursor?: string | null };
        // Failed payments are noise for the admin — never surface them.
        const page = (Array.isArray(res?.items) ? res.items : []).filter(
          (row) => (row.status ?? "").toLowerCase() !== "failed"
        );
        setItems((prev) => (opts.append ? [...prev, ...page] : page));
        setNextCursor(res?.nextCursor ?? null);
      } catch (e) {
        setError(userFacingError(e));
        if (!opts.append) setItems([]);
        setNextCursor(null);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [statusFilter, tierFilter]
  );

  useEffect(() => {
    void fetchPage({ append: false, pageCursor: null });
  }, [fetchPage]);

  useEffect(() => {
    void loadEvc();
  }, [loadEvc]);

  useEffect(() => {
    let cancelled = false;
    void admin.payments
      .stats()
      .then((s) => {
        if (!cancelled) setStats(s as PaymentStats);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });
    void admin.payments
      .dashboard()
      .then((d) => {
        if (!cancelled) setDashboard(d as PaymentsDashboard);
      })
      .catch(() => {
        if (!cancelled) setDashboard(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    await fetchPage({ append: true, pageCursor: nextCursor });
  }

  async function reviewEvc(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      if (action === "approve") await admin.evc.approve(id);
      else {
        const reason = window.prompt("Rejection reason (optional)") ?? undefined;
        await admin.evc.reject(id, reason);
      }
      await hapticSuccess();
      await loadEvc();
      await fetchPage({ append: false, pageCursor: null });
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusyId(null);
    }
  }

  const completed = stats?.byStatus?.completed;
  const pending = stats?.byStatus?.pending;

  return (
    <div className="screen pad-tab">
      <header className="screen-header">
        <Link to="/admin" className="back-btn" aria-label="Back">
          ←
        </Link>
        <h1>Payments</h1>
      </header>

      <p className="muted small" style={{ margin: "0 0 0.85rem" }}>
        Revenue across WaafiPay, M-Pesa / card (Paystack) and manual EVC. Approve
        EVC screenshots below; review member profiles from Members when needed.
      </p>

      <div className="admin-stat-grid">
        <div className="admin-stat">
          <strong>{formatCents(completed?.amountCents)}</strong>
          <span>Completed revenue</span>
        </div>
        <div className="admin-stat">
          <strong>{completed?.count ?? 0}</strong>
          <span>Completed</span>
        </div>
        <div className="admin-stat">
          <strong>{evcProofs.length}</strong>
          <span>EVC waiting</span>
        </div>
        <div className="admin-stat">
          <strong>{pending?.count ?? 0}</strong>
          <span>Pending</span>
        </div>
      </div>

      <h2 className="admin-section-title">Revenue by method</h2>
      {dashboard?.byGateway ? (
        <div className="admin-gateway-list">
          {(["waafi", "paystack", "stripe", "manual"] as const).map((g) => {
            const b = dashboard.byGateway?.[g];
            const rev = b?.completedRevenueCents ?? 0;
            const done = b?.completedCount ?? 0;
            const waiting = b?.pendingCount ?? 0;
            return (
              <div key={g} className="admin-gateway-row">
                <div className="admin-gateway-name">{GATEWAY_LABELS[g]}</div>
                <div className="admin-gateway-figures">
                  <strong>{formatCents(rev)}</strong>
                  <span className="muted small">
                    {done} paid
                    {waiting > 0 ? ` · ${waiting} pending` : ""}
                  </span>
                </div>
              </div>
            );
          })}
          <div className="admin-gateway-row admin-gateway-total">
            <div className="admin-gateway-name">All methods</div>
            <div className="admin-gateway-figures">
              <strong>
                {formatCents(dashboard.totals?.completedRevenueCents)}
              </strong>
              <span className="muted small">
                {dashboard.totals?.completedCount ?? 0} paid
              </span>
            </div>
          </div>
        </div>
      ) : (
        <p className="muted small" style={{ margin: "0 0 1rem" }}>
          Payment breakdown unavailable.
        </p>
      )}

      <h2 className="admin-section-title">EVC / M-PESA proofs</h2>
      {evcProofs.length === 0 ? (
        <p className="muted small" style={{ margin: "0 0 1rem" }}>
          No screenshot proofs waiting for review.
        </p>
      ) : (
        evcProofs.map((proof) => {
          const id = proof.id || proof._id || "";
          return (
            <article key={id} className="admin-pay-card">
              <div className="title-row">
                <div>
                  <strong>{proof.profileName || proof.payerFullName || "Unknown"}</strong>
                  <p className="muted small" style={{ margin: "0.2rem 0 0" }}>
                    {(proof.tier === "premium" ? "Premium" : "Basic") +
                      " · EVC / M-PESA upload"}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <strong>{formatCents(proof.amountCents)}</strong>
                  <div style={{ marginTop: "0.25rem" }}>
                    <span className="admin-pill warn">pending</span>
                  </div>
                </div>
              </div>
              <p className="muted small" style={{ margin: "0.55rem 0 0" }}>
                {proof.payerFullName} · ****{proof.lastFourDigits}
                {proof.createdAt
                  ? ` · ${formatPaymentWhen(proof.createdAt)}`
                  : ""}
              </p>
              {proof.userEmail ? (
                <p className="muted small" style={{ margin: "0.25rem 0 0" }}>
                  {proof.userEmail}
                </p>
              ) : null}
              {proof.userPhone ? (
                <p className="muted small" style={{ margin: "0.15rem 0 0" }}>
                  {proof.userPhone}
                </p>
              ) : null}
              {proof.screenshotUrl ? (
                <a href={proof.screenshotUrl} target="_blank" rel="noreferrer">
                  <img
                    src={proof.screenshotUrl}
                    alt="Payment screenshot"
                    className="admin-shot"
                  />
                </a>
              ) : (
                <p className="muted small" style={{ marginTop: "0.5rem" }}>
                  Screenshot unavailable
                </p>
              )}
              <div className="admin-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busyId === id}
                  onClick={() => void reviewEvc(id, "approve")}
                >
                  {busyId === id ? "Working…" : "Approve & unlock"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busyId === id}
                  onClick={() => void reviewEvc(id, "reject")}
                >
                  Reject
                </button>
              </div>
            </article>
          );
        })
      )}

      <h2 className="admin-section-title">Card & recorded payments</h2>

      <div className="admin-chip-row" role="tablist" aria-label="Status filters">
        {(
          [
            ["all", "All"],
            ["completed", "Completed"],
            ["pending", "Pending"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`admin-chip${statusFilter === key ? " active" : ""}`}
            onClick={() => setStatusFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="admin-chip-row" role="tablist" aria-label="Plan filters">
        {(
          [
            ["all", "Any plan"],
            ["basic", "Basic"],
            ["premium", "Premium"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`admin-chip${tierFilter === key ? " active" : ""}`}
            onClick={() => setTierFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="admin-actions" style={{ marginTop: 0, marginBottom: "0.85rem" }}>
        <Link to="/admin/members?filter=pending" className="btn btn-secondary">
          Review members
        </Link>
      </div>

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Wallet size={22} />}
          title="No card payments yet"
          body="Stripe checkouts and approved EVC payments appear here."
        />
      ) : (
        <>
          <p className="muted small" style={{ margin: "0 0 0.65rem" }}>
            Showing {items.length}
            {nextCursor ? "+" : ""} payments
            {statusFilter !== "all" ? ` · ${statusFilter}` : ""}
            {tierFilter !== "all" ? ` · ${tierFilter}` : ""}
          </p>
          {items.map((p) => {
            const id = p.id || p._id || "";
            const channel = paymentChannel(p);
            return (
              <article key={id || `${p.userEmail}-${p.createdAt}`} className="admin-pay-card">
                <div className="title-row">
                  <div>
                    <strong>{p.userName || p.profileName || "Unknown"}</strong>
                    <p className="muted small" style={{ margin: "0.2rem 0 0" }}>
                      {paymentLabel(p)}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong>{formatCents(p.amount)}</strong>
                    <div style={{ marginTop: "0.25rem" }}>
                      <span className={statusPillClass(p.status)}>
                        {p.status || "unknown"}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="muted small" style={{ margin: "0.55rem 0 0" }}>
                  {formatPaymentWhen(p.createdAt)}
                  {p.fulfilledAt
                    ? ` · fulfilled ${formatPaymentWhen(p.fulfilledAt)}`
                    : ""}
                  {` · ${channel}`}
                </p>
                {p.userEmail ? (
                  <p className="muted small" style={{ margin: "0.25rem 0 0" }}>
                    {p.userEmail}
                  </p>
                ) : null}
                {p.userPhone ? (
                  <p className="muted small" style={{ margin: "0.15rem 0 0" }}>
                    {p.userPhone}
                  </p>
                ) : null}
                {p.stripeSessionIdPrefix ? (
                  <p className="muted small" style={{ margin: "0.15rem 0 0" }}>
                    {channel === "Card" ? "Stripe" : "Proof"}{" "}
                    {p.stripeSessionIdPrefix}
                  </p>
                ) : null}
              </article>
            );
          })}
          {nextCursor && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: "100%", marginTop: "0.35rem" }}
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Loading…" : "Load more payments"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function AdminReportsPage() {
  const [items, setItems] = useState<ReportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await admin.reports.list({
        status: "open",
        limit: 40,
      })) as { items?: ReportRow[] };
      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      setError(userFacingError(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await fn();
      await hapticSuccess();
      await reload();
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="screen pad-tab">
      <header className="screen-header">
        <Link to="/admin" className="back-btn" aria-label="Back">
          ←
        </Link>
        <h1>Reports</h1>
      </header>
      {loading && <SkeletonCard />}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {!loading && items.length === 0 ? (
        <EmptyState
          icon={<Flag size={22} />}
          title="No open reports"
          body="Safety reports from members will appear here."
        />
      ) : (
        items.map((r) => {
          const id = pid(r);
          if (!id) return null;
          return (
            <article key={id} className="admin-report-card">
              <div className="title-row">
                <div>
                  <strong>{r.reportedName ?? "Member"}</strong>
                  <p className="muted small" style={{ margin: "0.2rem 0 0" }}>
                    Reported by {r.reporterName ?? "—"}
                    {r.priority ? ` · ${r.priority}` : ""}
                  </p>
                </div>
                <span className={`admin-pill ${statusPill(r.status)}`}>
                  {r.status ?? "open"}
                </span>
              </div>
              <p style={{ margin: "0.55rem 0 0", fontSize: "0.95rem" }}>
                <strong>{r.reason ?? "Report"}</strong>
                {r.details ? ` — ${r.details}` : ""}
              </p>
              <div className="admin-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busyId === id}
                  onClick={() =>
                    void act(id, () =>
                      admin.reports.resolve(id, { resolution: "reviewed" })
                    )
                  }
                >
                  Mark reviewed
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busyId === id}
                  onClick={() =>
                    void act(id, () => admin.reports.dismiss(id, {}))
                  }
                >
                  Dismiss
                </button>
                {r.reportedProfileId && !r.reportedBanned && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busyId === id}
                    onClick={() =>
                      void act(id, async () => {
                        await admin.users.ban(String(r.reportedProfileId));
                        await admin.reports.resolve(id, {
                          resolution: "banned",
                        });
                      })
                    }
                  >
                    Ban user
                  </button>
                )}
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}

type SupportMsg = {
  id?: string;
  authorRole?: string;
  body?: string;
  createdAt?: string | number;
};

type SupportContact = {
  id?: string;
  _id?: string;
  name?: string | null;
  email?: string | null;
  topic?: string;
  subject?: string;
  status?: string;
  canReply?: boolean;
  createdAt?: number;
  thread?: SupportMsg[];
};

type InviteRow = {
  id?: string;
  _id?: string;
  email?: string;
  role?: string;
  status?: string;
  createdAt?: string;
  expiresAt?: number;
};

export function AdminMessagesPage() {
  const [tab, setTab] = useState<"support" | "platform">("support");
  const [supportStatus, setSupportStatus] = useState<
    "all" | "open" | "reviewed" | "closed"
  >("open");
  const [contacts, setContacts] = useState<SupportContact[]>([]);
  const [selected, setSelected] = useState<SupportContact | null>(null);
  const [reply, setReply] = useState("");
  const [items, setItems] = useState<ConvRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadSupport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await support.admin.list({
        status: supportStatus === "all" ? undefined : supportStatus,
        limit: 50,
      })) as { items?: SupportContact[] };
      setContacts(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      setError(userFacingError(e));
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [supportStatus]);

  const loadPlatform = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await admin.conversations.list({ limit: 40 });
      setItems(Array.isArray(res) ? (res as ConvRow[]) : []);
    } catch (e) {
      setError(userFacingError(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "support") void loadSupport();
    else void loadPlatform();
  }, [tab, loadSupport, loadPlatform]);

  async function openContact(c: SupportContact) {
    const id = c.id ?? c._id;
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const detail = (await support.admin.get(id)) as SupportContact & {
        messages?: SupportMsg[];
      };
      setSelected({
        ...c,
        ...detail,
        thread: detail.messages ?? detail.thread ?? c.thread ?? [],
      });
      setReply("");
    } catch (e) {
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    const id = selected?.id ?? selected?._id;
    if (!id || !reply.trim()) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await support.admin.reply(id, reply.trim());
      await hapticSuccess();
      setStatus("Reply sent");
      setReply("");
      const detail = (await support.admin.get(id)) as SupportContact & {
        messages?: SupportMsg[];
      };
      setSelected({
        ...selected,
        ...detail,
        thread: detail.messages ?? detail.thread ?? [],
      });
      await loadSupport();
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  async function setContactStatus(next: "open" | "reviewed" | "closed") {
    const id = selected?.id ?? selected?._id;
    if (!id) return;
    setBusy(true);
    try {
      await support.admin.updateStatus(id, next);
      await hapticSuccess();
      setSelected((prev) => (prev ? { ...prev, status: next } : prev));
      await loadSupport();
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  if (selected) {
    const thread = selected.thread ?? [];
    return (
      <div className="screen pad-tab">
        <header className="screen-header">
          <button
            type="button"
            className="back-btn"
            aria-label="Back"
            onClick={() => setSelected(null)}
          >
            ←
          </button>
          <h1>{selected.name ?? "Support"}</h1>
        </header>
        <p className="muted small" style={{ marginTop: 0 }}>
          {selected.subject ?? selected.topic ?? "Support"} · {selected.status ?? "—"}
          {selected.email ? ` · ${selected.email}` : ""}
        </p>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        {status && (
          <div className="form-success" role="status">
            {status}
          </div>
        )}
        <div className="admin-thread">
          {thread.map((m, i) => (
            <div
              key={m.id ?? i}
              className={`admin-bubble ${m.authorRole === "admin" || m.authorRole === "owner" ? "staff" : "member"}`}
            >
              <strong>{m.authorRole ?? "member"}</strong>
              <p>{m.body}</p>
              {m.createdAt != null && (
                <span className="muted small">
                  {new Date(m.createdAt).toLocaleString()}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="admin-chip-row" style={{ marginTop: "0.75rem" }}>
          <button type="button" className="admin-chip" disabled={busy} onClick={() => void setContactStatus("open")}>
            Open
          </button>
          <button type="button" className="admin-chip" disabled={busy} onClick={() => void setContactStatus("reviewed")}>
            Reviewed
          </button>
          <button type="button" className="admin-chip" disabled={busy} onClick={() => void setContactStatus("closed")}>
            Closed
          </button>
        </div>
        {selected.canReply !== false && (
          <form
            className="form"
            style={{ marginTop: "0.75rem" }}
            onSubmit={(e) => {
              e.preventDefault();
              void sendReply();
            }}
          >
            <label>
              Reply as admin
              <textarea
                rows={3}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write a helpful reply…"
                required
                minLength={2}
              />
            </label>
            <button className="btn btn-primary btn-block" disabled={busy || !reply.trim()} type="submit">
              {busy ? "Sending…" : "Send reply"}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="screen pad-tab">
      <header className="screen-header">
        <Link to="/admin" className="back-btn" aria-label="Back">
          ←
        </Link>
        <h1>Messages</h1>
      </header>

      <div className="admin-chip-row" role="tablist" aria-label="Message type">
        <button
          type="button"
          className={`admin-chip${tab === "support" ? " active" : ""}`}
          onClick={() => setTab("support")}
        >
          Support (members ↔ staff)
        </button>
        <button
          type="button"
          className={`admin-chip${tab === "platform" ? " active" : ""}`}
          onClick={() => setTab("platform")}
        >
          Match chats
        </button>
      </div>

      {tab === "support" && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Messages members send to owners/admins. This is where staff support lives.
          </p>
          <div className="admin-chip-row" role="tablist" aria-label="Support status">
            {(
              [
                ["open", "Open"],
                ["reviewed", "Reviewed"],
                ["closed", "Closed"],
                ["all", "All"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`admin-chip${supportStatus === key ? " active" : ""}`}
                onClick={() => setSupportStatus(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {tab === "platform" && (
        <p className="muted" style={{ marginTop: 0 }}>
          Match conversations between members (read-only). Staff never appear here because they are not in Discover.
        </p>
      )}

      {loading && <SkeletonCard />}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      {tab === "support" && !loading && contacts.length === 0 ? (
        <EmptyState
          icon={<MessageCircle size={22} />}
          title="No support messages"
          body="When members message support from Settings, they show up here for owners and admins."
        />
      ) : null}

      {tab === "support" &&
        contacts.map((c) => {
          const id = c.id ?? c._id ?? "";
          const last = c.thread?.[c.thread.length - 1]?.body;
          return (
            <button
              key={id}
              type="button"
              className="admin-msg-card admin-msg-btn"
              onClick={() => void openContact(c)}
            >
              <strong>{c.name ?? "Member"}</strong>
              <p className="muted small" style={{ margin: "0.35rem 0 0" }}>
                {c.subject ?? c.topic ?? "Support"} · {c.status ?? "—"}
              </p>
              <p className="muted small" style={{ margin: "0.25rem 0 0" }}>
                {last ?? "Open thread"}
              </p>
            </button>
          );
        })}

      {tab === "platform" && !loading && items.length === 0 ? (
        <EmptyState
          icon={<MessageCircle size={22} />}
          title="No match chats yet"
          body="When members match and chat, threads will show here."
        />
      ) : null}

      {tab === "platform" &&
        items.map((c) => (
          <article key={c.conversationId} className="admin-msg-card">
            <strong>
              {c.memberA?.name ?? "A"} · {c.memberB?.name ?? "B"}
            </strong>
            <p className="muted small" style={{ margin: "0.35rem 0 0" }}>
              {c.lastMessage?.body ?? "No messages"}
            </p>
            {c.lastMessageAt ? (
              <p className="muted small" style={{ margin: "0.25rem 0 0" }}>
                {new Date(c.lastMessageAt).toLocaleString()}
              </p>
            ) : null}
          </article>
        ))}
    </div>
  );
}

export function AdminInvitePage() {
  const { user, accessState } = useSession();
  const roleLabel = staffRoleLabel(user, accessState);
  const [email, setEmail] = useState("");
  const [items, setItems] = useState<InviteRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await admin.staffInvites.list();
      setItems(Array.isArray(res) ? (res as InviteRow[]) : []);
    } catch (e) {
      setError(userFacingError(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (roleLabel !== "Owner") {
    return (
      <div className="screen pad-tab">
        <header className="screen-header">
          <Link to="/admin" className="back-btn" aria-label="Back">
            ←
          </Link>
          <h1>Invite admin</h1>
        </header>
        <EmptyState
          icon={<Shield size={22} />}
          title="Owners only"
          body="Only the account owner can invite new admins."
        />
      </div>
    );
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await admin.staffInvites.create({ email: email.trim() });
      await hapticSuccess();
      setStatus(`Invite sent to ${email.trim()}`);
      setEmail("");
      await reload();
    } catch (err) {
      await hapticError();
      setError(userFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    setError(null);
    try {
      await admin.staffInvites.revoke(id);
      await hapticSuccess();
      setStatus("Invite revoked");
      await reload();
    } catch (err) {
      await hapticError();
      setError(userFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen pad-tab">
      <header className="screen-header">
        <Link to="/admin" className="back-btn" aria-label="Back">
          ←
        </Link>
        <h1>Invite admin</h1>
      </header>
      <p className="muted" style={{ marginTop: 0 }}>
        Send an admin invite by email. They set a password and join — members cannot be promoted from here.
      </p>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {status && (
        <div className="form-success" role="status">
          {status}
        </div>
      )}
      <form className="form" onSubmit={onInvite}>
        <label>
          Admin email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
          />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy} type="submit">
          {busy ? "Sending…" : "Send invite"}
        </button>
      </form>

      <h2 style={{ margin: "1.25rem 0 0.65rem", fontSize: "1.05rem" }}>Recent invites</h2>
      {loading && <SkeletonCard />}
      {!loading && items.length === 0 ? (
        <p className="muted">No invites yet.</p>
      ) : (
        items.map((inv) => {
          const id = inv.id ?? inv._id ?? "";
          return (
            <article key={id} className="admin-msg-card">
              <strong>{inv.email}</strong>
              <p className="muted small" style={{ margin: "0.35rem 0 0" }}>
                {inv.status ?? "—"}
                {inv.createdAt ? ` · ${new Date(inv.createdAt).toLocaleDateString()}` : ""}
              </p>
              {inv.status === "pending" && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginTop: "0.55rem" }}
                  disabled={busy}
                  onClick={() => void revoke(id)}
                >
                  Revoke
                </button>
              )}
            </article>
          );
        })
      )}
    </div>
  );
}

export function AdminAnnouncementsPage() {
  const [items, setItems] = useState<AnnounceRow[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await admin.announcements.list()) as {
        items?: AnnounceRow[];
      };
      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      setError(userFacingError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError("Title and message are required.");
      return;
    }
    setSending(true);
    setError(null);
    setStatus(null);
    try {
      const created = (await admin.announcements.create({
        title: title.trim(),
        body: body.trim(),
        audience: "all",
      })) as { id?: string; scheduled?: boolean };
      if (created?.id && created.scheduled) {
        await admin.announcements.send(created.id);
      }
      setTitle("");
      setBody("");
      setStatus("Announcement sent to members.");
      await hapticSuccess();
      await reload();
    } catch (err) {
      await hapticError();
      setError(userFacingError(err));
    } finally {
      setSending(false);
    }
  }

  const recent = useMemo(() => items.slice(0, 20), [items]);

  return (
    <div className="screen pad-tab">
      <header className="screen-header">
        <Link to="/admin" className="back-btn" aria-label="Back">
          ←
        </Link>
        <h1>Announcements</h1>
      </header>

      <form className="admin-compose admin-member-card" onSubmit={(e) => void onCreate(e)}>
        <strong>Send to everyone</strong>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          aria-label="Announcement title"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message"
          aria-label="Announcement message"
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={sending}>
          {sending ? "Sending…" : "Create & send"}
        </button>
      </form>

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {status && (
        <div className="form-success" role="status">
          {status}
        </div>
      )}
      {loading && <SkeletonCard />}
      {recent.map((a) => (
        <article key={a.id} className="admin-msg-card">
          <div className="title-row">
            <strong>{a.title}</strong>
            <span className={`admin-pill ${a.sentAt ? "ok" : "warn"}`}>
              {a.sentAt ? "Sent" : "Draft"}
            </span>
          </div>
          <p className="muted small" style={{ margin: "0.4rem 0 0" }}>
            {a.body}
          </p>
        </article>
      ))}
    </div>
  );
}

type AnalyticsData = {
  countryBreakdown?: Record<string, number>;
  monthlySignups?: Record<string, number>;
  genderBreakdown?: Record<string, number>;
  reviewBreakdown?: Record<string, number>;
  paidMembers?: number;
  memberCount?: number;
  matchRate?: number;
  conversionRate?: number;
  metricsUpdatedAt?: string | null;
};

export function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [activity, setActivity] = useState<
    Array<{ id?: string; action?: string; actorName?: string; createdAt?: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [analytics, recent] = await Promise.all([
          admin.analytics() as Promise<AnalyticsData>,
          admin.activity().catch(() => []) as Promise<
            Array<{ id?: string; action?: string; actorName?: string; createdAt?: string }>
          >,
        ]);
        if (cancelled) return;
        setData(analytics && typeof analytics === "object" ? analytics : null);
        setActivity(Array.isArray(recent) ? recent.slice(0, 12) : []);
      } catch (e) {
        if (!cancelled) setError(userFacingError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function entries(obj?: Record<string, number>) {
    return Object.entries(obj ?? {}).sort((a, b) => b[1] - a[1]);
  }

  return (
    <div className="screen pad-tab">
      <header className="screen-header">
        <Link to="/admin" className="back-btn" aria-label="Back">
          ←
        </Link>
        <h1>Analytics</h1>
      </header>

      {loading && <SkeletonCard />}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="admin-stat-grid">
            <div className="admin-stat">
              <strong>{data.memberCount ?? 0}</strong>
              <span>Members</span>
            </div>
            <div className="admin-stat">
              <strong>{data.paidMembers ?? 0}</strong>
              <span>Paid</span>
            </div>
            <div className="admin-stat">
              <strong>{data.conversionRate ?? 0}%</strong>
              <span>Paid conversion</span>
            </div>
            <div className="admin-stat">
              <strong>{data.matchRate ?? 0}%</strong>
              <span>Complete profiles</span>
            </div>
          </div>

          <section className="admin-detail-section">
            <h2>Gender</h2>
            <dl className="admin-detail-grid">
              {entries(data.genderBreakdown).map(([k, v]) => (
                <div key={k} className="admin-detail-field">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="admin-detail-section">
            <h2>Review status</h2>
            <dl className="admin-detail-grid">
              {entries(data.reviewBreakdown).map(([k, v]) => (
                <div key={k} className="admin-detail-field">
                  <dt>{k.replace(/_/g, " ")}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="admin-detail-section">
            <h2>Top countries</h2>
            <dl className="admin-detail-grid">
              {entries(data.countryBreakdown)
                .slice(0, 10)
                .map(([k, v]) => (
                  <div key={k} className="admin-detail-field">
                    <dt>{k || "Unknown"}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              {entries(data.countryBreakdown).length === 0 ? (
                <p className="muted small">No country data yet.</p>
              ) : null}
            </dl>
          </section>

          <section className="admin-detail-section">
            <h2>Monthly signups</h2>
            <dl className="admin-detail-grid">
              {entries(data.monthlySignups)
                .slice(-8)
                .map(([k, v]) => (
                  <div key={k} className="admin-detail-field">
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
          </section>

          {activity.length > 0 ? (
            <section className="admin-detail-section">
              <h2>Recent activity</h2>
              <ul className="admin-activity-list">
                {activity.map((row, i) => (
                  <li key={row.id ?? i}>
                    <span>
                      <strong>{row.actorName ?? "Staff"}</strong> · {row.action}
                    </span>
                    {row.createdAt ? (
                      <small className="muted">
                        {new Date(row.createdAt).toLocaleString()}
                      </small>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.metricsUpdatedAt ? (
            <p className="muted small center">
              Metrics updated {new Date(data.metricsUpdatedAt).toLocaleString()}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

type AuditRow = {
  id?: string;
  _id?: string;
  action?: string;
  actorUserId?: string;
  actorName?: string;
  targetUserId?: string | null;
  loggedAt?: string;
  createdAt?: string;
  metadata?: string | Record<string, unknown> | null;
};

export function AdminAuditPage() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = (await admin.auditLogs({ limit: 60 })) as {
          items?: AuditRow[];
        } | AuditRow[];
        if (cancelled) return;
        const list = Array.isArray(res)
          ? res
          : Array.isArray(res?.items)
            ? res.items
            : [];
        setItems(list);
      } catch (e) {
        if (!cancelled) setError(userFacingError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="screen pad-tab">
      <header className="screen-header">
        <Link to="/admin" className="back-btn" aria-label="Back">
          ←
        </Link>
        <h1>Audit log</h1>
      </header>

      {loading && <SkeletonCard />}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {!loading && items.length === 0 && !error ? (
        <EmptyState
          title="No audit events"
          body="Staff actions will appear here."
        />
      ) : null}

      <ul className="admin-activity-list">
        {items.map((row, i) => {
          const when = row.loggedAt ?? row.createdAt;
          const actor = row.actorName ?? row.actorUserId?.slice(0, 8) ?? "Staff";
          return (
            <li key={row.id ?? row._id ?? i}>
              <span>
                <strong>{actor}</strong> · {row.action ?? "action"}
              </span>
              {when ? (
                <small className="muted">{new Date(when).toLocaleString()}</small>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
