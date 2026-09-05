"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/context";
import { WHATSAPP_URL } from "@/lib/constants";
import { getApiBaseUrl } from "@/data/provider";

/**
 * Friendly notice when the Nest API health check fails in production.
 *
 * Deliberately silent in development and preview: a missing NEXT_PUBLIC_API_URL
 * or a locally-stopped API is a setup state, not a member-facing outage. Only a
 * real failed /health response in production shows the banner, and only after a
 * second consecutive failure so a single cold-start blip stays quiet.
 */
export function BackendStatusBanner() {
  const { t } = useTranslation();
  const [down, setDown] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    let base: string;
    try {
      base = getApiBaseUrl();
    } catch {
      // No API URL configured — a deploy-config problem, not an outage.
      return;
    }
    if (!base) return;

    const controller = new AbortController();
    let cancelled = false;

    const probe = () =>
      fetch(`${base}/health`, {
        signal: controller.signal,
        cache: "no-store",
      }).then((res) => res.ok);

    void (async () => {
      try {
        if (await probe()) return;
      } catch {
        if (cancelled) return;
      }
      // One retry before alarming anyone.
      await new Promise((r) => setTimeout(r, 4000));
      if (cancelled) return;
      try {
        if (await probe()) return;
      } catch {
        /* fall through */
      }
      if (!cancelled) setDown(true);
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  if (!down) return null;

  return (
    <div
      role="alert"
      className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <p className="font-semibold">{t("setup.serviceUnavailableTitle")}</p>
      <p className="mt-1 text-amber-900/90 dark:text-amber-100/80">
        {t("setup.serviceUnavailableBody")}{" "}
        <a
          className="font-medium underline underline-offset-2"
          href={WHATSAPP_URL}
          target="_blank"
          rel="noreferrer"
        >
          WhatsApp
        </a>
        .
      </p>
    </div>
  );
}
