"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ErrorBoundary } from "@/components/error-boundary";
import { BackendStatusBanner } from "@/components/layout/backend-status-banner";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { isAuthRoute } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { SITE_BRAND_NAME } from "@/lib/constants";

/**
 * Isolates chrome crashes (nav/footer) so a mobile auth/query failure
 * cannot replace the whole page with the global error screen.
 */
export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const authPage = isAuthRoute(pathname ?? "");

  return (
    <>
      <BackendStatusBanner />
      {!authPage ? (
        <ErrorBoundary
          fallback={
            <header className="sticky top-0 z-50 border-b border-border bg-card px-4 py-4">
              <a href="/" className="font-display text-lg font-semibold text-foreground">
                {SITE_BRAND_NAME}
              </a>
            </header>
          }
        >
          <Navbar />
        </ErrorBoundary>
      ) : null}
      <main className={cn("flex-1", authPage && "min-h-dvh")}>{children}</main>
      {!authPage ? (
        <ErrorBoundary fallback={null}>
          <Footer />
        </ErrorBoundary>
      ) : null}
    </>
  );
}
