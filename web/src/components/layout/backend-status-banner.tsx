"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/context";
import { WHATSAPP_URL } from "@/lib/constants";

/**
 * Friendly notice when the Nest API health check fails.
 * Never expose plan names, vendor dashboards, or internal errors to members.
 */
export function BackendStatusBanner() {
  const { t } = useTranslation();
  const [down, setDown] = useState(false);

  useEffect(() => {
    const base = (process.env.NEXT_PUBLIC_API_URL ?? "")
      .trim()
      .replace(/\/$/, "");
    if (!base) {
      setDown(true);
      return;
    }
    const controller = new AbortController();
    void fetch(`${base}/health`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) setDown(true);
      })
      .catch(() => {
        setDown(true);
      });
    return () => controller.abort();
  }, []);

  if (!down) return null;

  return (
    <div
      role="alert"
      className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950"
    >
      <p className="font-semibold">{t("setup.serviceUnavailableTitle")}</p>
      <p className="mt-1 text-amber-900/90">
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
