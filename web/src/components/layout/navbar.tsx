"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X, LayoutDashboard, User, Home } from "lucide-react";
import { useUnifiedAuth } from "@/data/auth/hooks";
import { Button } from "@/components/ui/button";
import { isAppShellRoute, getAuthenticatedHomeRoute } from "@/lib/routes";
import { isStaffRole } from "@/lib/access";
import { useNavLinks } from "@/lib/i18n/hooks";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/layout/brand-logo";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { isAuthenticated, isLoading, user } = useUnifiedAuth();
  const role = (user?.profile as { role?: string } | null | undefined)?.role;
  const isStaff = isStaffRole(role);
  const consoleHref = user
    ? getAuthenticatedHomeRoute(user.profile as Parameters<typeof getAuthenticatedHomeRoute>[0])
    : "/dashboard";

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const inAppShell = isAppShellRoute(pathname);
  const navLinks = useNavLinks();
  const { t } = useTranslation();

  const isActive = (href: string) => {
    if (href.startsWith("/#")) return false;
    return href === "/" ? pathname === "/" : pathname === href;
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur-xl pt-[env(safe-area-inset-top)]",
        inAppShell && "hidden lg:block"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        <BrandLogo href="/" className="min-w-0 shrink" />

        <nav className="hidden lg:flex items-center gap-0.5">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "relative px-3 py-2 text-sm font-medium transition-colors",
                isActive(link.href)
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {link.label}
              {isActive(link.href) && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary" />
              )}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageToggle className="rounded-xl h-10 px-3" />

          <ThemeToggle />

          <div className="hidden sm:flex items-center gap-2">
            {isAuthenticated && !isLoading ? (
              <>
                {isStaff && (
                  <Button variant="outline" asChild className="border-border">
                    <Link href="/">
                      <Home className="h-4 w-4" />
                      {t("nav.home")}
                    </Link>
                  </Button>
                )}
                <Button asChild>
                  <Link href={consoleHref}>
                    <LayoutDashboard className="h-4 w-4" />
                    {isStaff ? t("app.admin") : t("nav.dashboard")}
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild className="hidden sm:inline-flex">
                  <Link href="/register">
                    {t("common.joinNow")}
                  </Link>
                </Button>
                <Button variant="outline" asChild className="border-primary text-primary hover:bg-accent">
                  <Link href="/login">
                    <User className="h-4 w-4" />
                    {t("nav.memberLogin")}
                  </Link>
                </Button>
              </>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden rounded-xl h-10 w-10"
            onClick={() => setOpen(!open)}
            aria-label={open ? t("common.a11yCloseMenu") : t("common.a11yOpenMenu")}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {open ? (
        <div className="lg:hidden border-t border-border motion-safe:animate-reveal">
          <div className="px-4 py-4 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "block rounded-lg px-4 py-3 text-sm font-medium transition-colors",
                  isActive(link.href)
                    ? "bg-accent text-primary"
                    : "hover:bg-muted"
                )}
              >
                {link.label}
              </Link>
            ))}
            <div className="flex flex-col gap-2 pt-3">
              <LanguageToggle className="w-full justify-center" />
              {isAuthenticated && !isLoading ? (
                <>
                  {isStaff && (
                    <Button variant="outline" asChild className="w-full border-border">
                      <Link href="/" onClick={() => setOpen(false)}>
                        <Home className="h-4 w-4" />
                        {t("nav.home")}
                      </Link>
                    </Button>
                  )}
                  <Button asChild className="w-full">
                    <Link href={consoleHref} onClick={() => setOpen(false)}>
                      <LayoutDashboard className="h-4 w-4" />
                      {isStaff ? t("app.admin") : t("nav.dashboard")}
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild className="w-full">
                    <Link href="/register" onClick={() => setOpen(false)}>
                      {t("common.joinNow")}
                    </Link>
                  </Button>
                  <Button variant="outline" asChild className="w-full border-primary text-primary">
                    <Link href="/login" onClick={() => setOpen(false)}>
                      <User className="h-4 w-4" />
                      {t("nav.memberLogin")}
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
