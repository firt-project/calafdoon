import { Link, NavLink, Outlet, Navigate } from "react-router-dom";
import {
  Bell,
  Heart,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Settings,
  Sparkles,
  UserRound,
} from "lucide-react";
import { SITE_BRAND_NAME } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import { bumpData, useApp } from "@/hooks/use-app";
import { authService } from "@/services/auth-service";
import { matchingActions } from "@/services/matching-actions";
import { cn } from "@/utils/cn";

const TABS = [
  { to: "/dashboard", label: "app.home" as const, icon: LayoutDashboard },
  { to: "/matches", label: "app.discover" as const, icon: Sparkles },
  { to: "/likes", label: "app.likes" as const, icon: Heart },
  { to: "/chat", label: "app.messages" as const, icon: MessageCircle },
  { to: "/profile", label: "app.myProfile" as const, icon: UserRound },
];

export function AppLayout() {
  const { t } = useTranslation();
  const { session, profile, refresh } = useApp();

  if (!session) return <Navigate to="/login" replace />;

  const unread = matchingActions
    .getNotifications(session.userId)
    .filter((n) => !n.read).length;

  const logout = () => {
    authService.logout();
    bumpData();
    refresh();
  };

  return (
    <div className="dashboard-bg app-shell">
      <header className="app-header">
        <Link to="/dashboard" className="brand" style={{ fontSize: "1.25rem" }}>
          {SITE_BRAND_NAME}
        </Link>
        <div className="row">
          {profile?.plan && profile.plan !== "none" && (
            <span className="badge badge-gold">{profile.plan}</span>
          )}
          <Link
            to="/notifications"
            className="icon-btn"
            aria-label={t("app.notifications")}
            style={{ position: "relative" }}
          >
            <Bell size={18} />
            {unread > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: "0.15rem",
                  right: "0.15rem",
                  background: "var(--primary)",
                  color: "#fff",
                  borderRadius: 999,
                  fontSize: "0.65rem",
                  minWidth: "1rem",
                  textAlign: "center",
                  lineHeight: "1rem",
                }}
              >
                {unread}
              </span>
            )}
          </Link>
          <Link to="/settings" className="icon-btn" aria-label="Settings">
            <Settings size={18} />
          </Link>
          <Link to="/" className="icon-btn" onClick={logout} aria-label={t("app.logOut")}>
            <LogOut size={18} />
          </Link>
        </div>
      </header>

      <div className="container" style={{ paddingTop: "1.25rem" }}>
        <Outlet />
      </div>

      <nav className="app-tabbar" aria-label="App">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) => cn(isActive && "active")}
            >
              <Icon size={18} />
              <span>{t(tab.label)}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
