"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  LogOut,
  User,
  Shield,
  Menu,
  X,
  Home,
} from "lucide-react";
import { useUnifiedAuth } from "@/data/auth/hooks";
import { useUnreadCount } from "@/data/notifications/hooks";
import { useProfile } from "@/data/profile/hooks";
import { useNavLinks } from "@/lib/i18n/hooks";
import { useTranslation } from "@/lib/i18n/context";
import { isStaffRole } from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { isAppShellRoute, getAuthenticatedHomeRoute } from "@/lib/routes";
import { BrandLogo } from "@/components/layout/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useSignOut } from "@/hooks/use-sign-out";
import { cn } from "@/lib/utils";

export function AppShellHeader() {
  const pathname = usePathname();
  const { signOut } = useSignOut();
  const [accountOpen, setAccountOpen] = useState(false);
  const [siteMenuOpen, setSiteMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const unreadRaw = useUnreadCount();
  const unreadCount =
    typeof unreadRaw === "number"
      ? unreadRaw
      : typeof unreadRaw === "object" &&
          unreadRaw !== null &&
          "count" in unreadRaw
        ? Number((unreadRaw as { count: unknown }).count)
        : Number(unreadRaw ?? 0) || 0;
  const { user } = useUnifiedAuth();
  const { profile: profileQuery } = useProfile();
  const profile = (profileQuery ?? null) as
    | { name?: string; imageUrl?: string | null }
    | null
    | undefined;
  const userProfile = user?.profile as
    | { role?: string; name?: string; [key: string]: unknown }
    | null
    | undefined;

  const profileName = profile?.name ?? userProfile?.name ?? "";
  const profileImage = profile?.imageUrl;
  const navLinks = useNavLinks();
  const { t } = useTranslation();
  const homeHref = getAuthenticatedHomeRoute(userProfile);

  const isMarketingActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href;

  useEffect(() => {
    setAccountOpen(false);
    setSiteMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    };
    if (accountOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [accountOpen]);

  useEffect(() => {
    if (!siteMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [siteMenuOpen]);

  // App shell header is only for signed-in app routes (not marketing pages).
  if (!isAppShellRoute(pathname)) return null;

  return (
    <>
      <header className="lg:hidden sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center justify-between gap-2 px-3 sm:px-4">
          <div className="flex items-center gap-1 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-xl h-10 w-10"
              onClick={() => setSiteMenuOpen(true)}
              aria-label={t("common.a11yOpenWebsiteMenu")}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <BrandLogo href={isStaffRole(userProfile?.role) ? "/admin" : homeHref} size="sm" className="min-w-0" />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              asChild
              className={cn(
                "relative rounded-xl h-10 w-10",
                pathname === "/notifications" && "bg-accent text-accent-foreground"
              )}
              aria-label={t("app.notifications")}
            >
              <Link href="/notifications">
                <Bell className="h-5 w-5" />
                {unreadCount ? (
                  <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </Link>
            </Button>

            <ThemeToggle className="h-10 w-10" />

            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((o) => !o)}
                aria-label={t("common.a11yAccountMenu")}
                aria-expanded={accountOpen}
                className={cn(
                  "shrink-0 rounded-full ring-2 ring-transparent transition-all",
                  (pathname === "/profile" || accountOpen) && "ring-primary"
                )}
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={profileImage ?? undefined} alt={profileName} />
                  <AvatarFallback className="text-xs font-semibold bg-muted">
                    {profileName.charAt(0) || "?"}
                  </AvatarFallback>
                </Avatar>
              </button>

              {accountOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-border bg-card shadow-lg py-1 z-50">
                  <p className="px-4 py-2 text-xs text-muted-foreground truncate border-b border-border mb-1">
                    {profileName || t("app.account")}
                  </p>
                  <Link
                    href="/profile"
                    onClick={() => setAccountOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted transition-colors",
                      pathname === "/profile" && "bg-accent text-accent-foreground"
                    )}
                  >
                    <User className="h-4 w-4" />
                    {t("app.myProfile")}
                  </Link>
                  <Link
                    href="/"
                    onClick={() => setAccountOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted transition-colors",
                      pathname === "/" && "bg-accent text-accent-foreground"
                    )}
                  >
                    <Home className="h-4 w-4" />
                    {t("nav.home")}
                  </Link>
                  {isStaffRole(userProfile?.role) && (
                    <Link
                      href="/admin"
                      onClick={() => setAccountOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted transition-colors",
                        pathname.startsWith("/admin") && "bg-accent text-accent-foreground"
                      )}
                    >
                      <Shield className="h-4 w-4" />
                      {t("app.admin")}
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    {t("app.logOut")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {siteMenuOpen && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-50 bg-black/40"
              aria-label={t("common.a11yCloseWebsiteMenu")}
              onClick={() => setSiteMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="lg:hidden fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-card shadow-xl pt-[env(safe-area-inset-top)]"
            >
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <BrandLogo href="/" size="sm" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl h-9 w-9"
                  onClick={() => setSiteMenuOpen(false)}
                  aria-label={t("common.a11yCloseWebsiteMenu")}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                <p className="px-3 pt-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("nav.websiteSection")}
                </p>
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setSiteMenuOpen(false)}
                    className={cn(
                      "block rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                      isMarketingActive(link.href)
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
