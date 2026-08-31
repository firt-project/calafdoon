"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Home, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const FALLBACK = {
  title: "Something went wrong",
  subtitle: "An unexpected error occurred. Try again or return to the homepage.",
  tryAgain: "Try again",
  backHome: "Back to home",
};

/**
 * Standalone error UI — does not depend on LanguageProvider so a provider crash
 * cannot blank the recovery screen on mobile browsers.
 */
export function ErrorPageContent({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.error(error);
    }
  }, [error]);

  const recover = () => {
    try {
      reset();
    } catch {
      // ignore
    }
    // Hard navigation recovers better than soft reset after Google Translate DOM damage.
    window.location.assign("/");
  };

  return (
    <div
      translate="no"
      className="notranslate gradient-hero flex min-h-[calc(100dvh-var(--app-header)-12rem)] items-center justify-center px-4 py-16"
    >
      <div className="mx-auto max-w-lg text-center">
        <p className="text-5xl font-bold tracking-tight text-destructive/40 sm:text-6xl">!</p>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {FALLBACK.title}
        </h1>
        <p className="mt-4 text-muted-foreground leading-relaxed">{FALLBACK.subtitle}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" onClick={recover}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {FALLBACK.tryAgain}
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              {FALLBACK.backHome}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
