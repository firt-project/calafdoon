"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  User,
  ClipboardList,
  Heart,
  MessageCircle,
  Sparkles,
  Bell,
  Shield,
  LogOut,
  Home,
} from "lucide-react";
import { useUnifiedAuth } from "@/data/auth/hooks";
import { useUnreadCount } from "@/data/notifications/hooks";
import { usePreferencesQuery } from "@/data/profile/hooks";
import type { AppNavIcon } from "@/lib/constants";
import { useAppNavLinks } from "@/lib/i18n/hooks";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/layout/brand-logo";
import { getAuthenticatedHomeRoute } from "@/lib/routes";
import { isStaffRole } from "@/lib/access";
import { calculateProfileProgress } from "@/lib/profile-progress";
import { useSignOut } from "@/hooks/use-sign-out";
import { ADMIN_NAV_TABS, isAdminNavTab } from "@/lib/admin-nav";

const iconMap = {
  LayoutDashboard,
  ClipboardList,
  Heart,
  MessageCircle,
  Sparkles,
  Bell,
};

export function DashboardSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { signOut } = useSignOut();
  const { user } = useUnifiedAuth();
  const profile = user?.profile as
    | {
        role?: string;
        questionnaireComplete?: boolean;
        [key: string]: unknown;
      }
    | null
    | undefined;
  const isStaff = isStaffRole(profile?.role);
  const preferences = usePreferencesQuery();
  const unreadRaw = useUnreadCount();
  const unreadCount =
    typeof unreadRaw === "number"
      ? unreadRaw
      : typeof unreadRaw === "object" &&
          unreadRaw !== null &&
          "count" in unreadRaw
        ? Number((unreadRaw as { count: unknown }).count)
        : Number(unreadRaw ?? 0) || 0;

  const profileComplete = profile?.questionnaireComplete ?? false;
  const progress = profile
    ? calculateProfileProgress(
        profile as unknown as Parameters<typeof calculateProfileProgress>[0],
        !isStaff && preferences
          ? (preferences as unknown as Parameters<
              typeof calculateProfileProgress
            >[1])
          : undefined
      )
    : 0;
  const appNavLinks = useAppNavLinks(profileComplete);
  const { t } = useTranslation();
  const homeHref = getAuthenticatedHomeRoute(profile);
  const isLoading = user === undefined;
  const currentTab = isAdminNavTab(searchParams.get("tab"))
    ? searchParams.get("tab")!
    : "dashboard";

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:top-16 lg:bottom-0 lg:left-0 lg:z-40 lg:border-r lg:border-border lg:bg-card/95 lg:backdrop-blur-xl">
      <div className="flex flex-col flex-1 px-4 py-6 overflow-y-auto">
        <BrandLogo href={isStaff ? "/admin" : homeHref} className="px-2 mb-6" />

        {!isLoading && !isStaff && profile && !profileComplete && (
          <div className="mb-4 space-y-1.5 rounded-xl bg-accent p-3">
            <p className="text-xs font-medium text-accent-foreground">
              {t("profileProgress.sidebarProgress", { percent: progress })}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <nav className="flex-1 space-y-1">
          {!isLoading &&
            !isStaff &&
            appNavLinks.map((link) => {
              const Icon = iconMap[link.icon as AppNavIcon];
              const isActive =
                pathname === link.href ||
                (link.href === "/likes" && pathname.startsWith("/likes")) ||
                (!profileComplete &&
                  link.href === "/questionnaire" &&
                  pathname.startsWith("/questionnaire"));
              const isLocked = "locked" in link && link.locked && !profileComplete;

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    isLocked && "opacity-80"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {link.label}
                  {link.href === "/notifications" && unreadCount ? (
                    <Badge className="ml-auto">{unreadCount}</Badge>
                  ) : null}
                </Link>
              );
            })}

          {!isLoading && !isStaff && (
            // Desktop has no avatar/account menu (the app header is mobile-only),
            // so the sidebar is the only way for members to reach their profile.
            <Link
              href="/profile"
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all",
                pathname === "/profile"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <User className="h-5 w-5 shrink-0" />
              {t("app.myProfile")}
            </Link>
          )}

          {isStaff && (
            <>
              <div className="flex items-center gap-2 px-4 pb-2 pt-1">
                <Shield className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("app.admin")}
                </span>
              </div>
              {ADMIN_NAV_TABS.map((item) => {
                const Icon = item.icon;
                const onAdmin = pathname.startsWith("/admin");
                const isActive = onAdmin && currentTab === item.tab;
                return (
                  <Link
                    key={item.tab}
                    href={`/admin?tab=${item.tab}`}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {t(item.titleKey)}
                  </Link>
                );
              })}
              <Link
                href="/profile"
                className={cn(
                  "mt-1 flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all",
                  pathname === "/profile"
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <User className="h-5 w-5 shrink-0" />
                {t("app.myProfile")}
              </Link>
              <Link
                href="/"
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all",
                  pathname === "/"
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Home className="h-5 w-5 shrink-0" />
                {t("nav.home")}
              </Link>
            </>
          )}
        </nav>

        <div className="mt-4 border-t border-border pt-4">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 rounded-xl text-muted-foreground"
            onClick={() => void signOut()}
          >
            <LogOut className="h-5 w-5" />
            {t("app.logOut")}
          </Button>
        </div>
      </div>
    </aside>
  );
}
