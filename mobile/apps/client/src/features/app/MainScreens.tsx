import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import {
  Flag,
  Heart,
  Home,
  Lock,
  MessageCircle,
  Shield,
  Sparkles,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import {
  isStaffUser,
  useSession,
  homeRouteFromAccess,
} from "@/features/auth/SessionProvider";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/utils/cn";
import { OfflineBanner } from "@/ui/mobile-kit";
import { hapticLight } from "@/platform/haptics";
import { securityGateRouteForUser } from "@/lib/security-gate-codes";
import { useInboxUnread } from "@/features/messages/useInboxUnread";
import {
  getPhotoGate,
  refreshPhotoGate,
} from "@/features/profile/photo-gate";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { ready, user } = useSession();
  const { pathname } = useLocation();
  if (!ready) {
    return (
      <div className="screen" aria-busy="true">
        <p className="muted">Checking your session…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/welcome" replace />;
  const gate = securityGateRouteForUser(user);
  if (gate && pathname !== gate && !pathname.startsWith(`${gate}/`)) {
    return <Navigate to={gate} replace />;
  }
  return children;
}

/** Member app shell (home/discover/matches/messages) — paid or admin-approved only. */
export function RequireMemberAccess({
  children,
}: {
  children: React.ReactNode;
}) {
  const { ready, user, accessState } = useSession();
  if (!ready) {
    return (
      <div className="screen" aria-busy="true">
        <p className="muted">Checking your access…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/welcome" replace />;
  const gate = securityGateRouteForUser(user);
  if (gate) return <Navigate to={gate} replace />;
  if (isStaffUser(user, accessState)) return <Navigate to="/admin" replace />;

  const dest = homeRouteFromAccess(accessState);
  if (dest !== "/home") {
    return <Navigate to={dest} replace />;
  }
  return <RequirePhoto>{children}</RequirePhoto>;
}

/**
 * A profile photo is mandatory. Checked once per session (cached) — the
 * onboarding photo screen clears the gate the moment the first upload lands.
 */
export function RequirePhoto({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState(getPhotoGate());

  useEffect(() => {
    if (gate !== "unknown") return;
    let alive = true;
    void refreshPhotoGate().then((next) => {
      if (alive) setGate(next);
    });
    return () => {
      alive = false;
    };
  }, [gate]);

  if (gate === "unknown") {
    return (
      <div className="screen" aria-busy="true">
        <p className="muted">Checking your profile…</p>
      </div>
    );
  }
  if (gate === "none") {
    return <Navigate to="/onboarding/photo" replace />;
  }
  return children;
}

export function MainTabs() {
  const { user, accessState } = useSession();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const staff = isStaffUser(user, accessState);
  // Same rule as RequireMemberAccess — only a fully unlocked member gets the
  // Home/Discover/Matches/Messages tabs. Everyone else sees Unlock + Settings.
  const memberUnlocked = homeRouteFromAccess(accessState) === "/home";
  const inboxUnread = useInboxUnread(memberUnlocked && !staff);
  const hideTabbar =
    pathname.startsWith("/discover/member/") ||
    pathname.startsWith("/messages/");

  return (
    <div className={cn("app-shell", hideTabbar && "app-shell-no-tab")}>
      <OfflineBanner />
      <div className="app-content">
        <Outlet />
      </div>
      {!hideTabbar ? (
      <nav className="tabbar" aria-label={t("app.home")}>
        {staff ? (
          <>
            <Tab to="/admin" icon={Shield} label={t("app.admin")} end />
            <Tab to="/admin/members" icon={Users} label="Members" />
            <Tab to="/admin/payments" icon={Wallet} label="Pay" />
            <Tab to="/admin/reports" icon={Flag} label="Reports" />
            <Tab to="/settings" icon={Settings} label={t("app.settings")} />
          </>
        ) : memberUnlocked ? (
          <>
            <Tab to="/home" icon={Home} label={t("app.home")} end />
            <Tab to="/discover" icon={Sparkles} label={t("app.discover")} />
            <Tab to="/matches" icon={Heart} label={t("app.matches")} />
            <Tab
              to="/messages"
              icon={MessageCircle}
              label={t("app.messages")}
              badge={inboxUnread}
            />
            <Tab to="/settings" icon={Settings} label={t("app.settings")} />
          </>
        ) : (
          <>
            <Tab to="/plans" icon={Lock} label="Unlock" end />
            <Tab to="/settings" icon={Settings} label={t("app.settings")} />
          </>
        )}
      </nav>
      ) : null}
    </div>
  );
}

function Tab({
  to,
  icon: Icon,
  label,
  end,
  badge = 0,
}: {
  to: string;
  icon: typeof Sparkles;
  label: string;
  end?: boolean;
  badge?: number;
}) {
  const { pathname } = useLocation();
  const active = end
    ? pathname === to
    : to === "/settings"
      ? pathname === to ||
        pathname.startsWith(`${to}/`) ||
        pathname === "/profile" ||
        pathname.startsWith("/profile/")
      : pathname === to || pathname.startsWith(`${to}/`);
  return (
    <Link
      to={to}
      className={cn("tab", active && "active")}
      aria-current={active ? "page" : undefined}
      onClick={() => void hapticLight()}
    >
      <span className="tab-icon">
        <Icon size={20} aria-hidden />
        {badge > 0 ? (
          <span className="tab-badge" aria-hidden>
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      <span>
        {label}
        {badge > 0 ? (
          <span className="sr-only"> ({badge} unread)</span>
        ) : null}
      </span>
    </Link>
  );
}
