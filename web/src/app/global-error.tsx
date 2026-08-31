"use client";

import { useEffect, useState } from "react";
import { LOCALE_STORAGE_KEY } from "@/lib/i18n/translations";
import { en } from "@/lib/i18n/translations/en";
import { so } from "@/lib/i18n/translations/so";

const copy = { en, so } as const;

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = useState<"en" | "so">("so");

  useEffect(() => {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "en" || stored === "so") setLocale(stored);
  }, []);

  const t = copy[locale].errorPage;

  return (
    <html lang={locale} translate="no" className="notranslate">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "linear-gradient(180deg, #faf8f9 0%, #f3eef0 100%)",
          color: "#1a1a1a",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <p
            style={{
              fontSize: 48,
              fontWeight: 700,
              color: "#E91E63",
              opacity: 0.35,
              margin: 0,
            }}
          >
            !
          </p>
          <h1 style={{ fontSize: 28, margin: "16px 0 8px" }}>{t.title}</h1>
          <p style={{ color: "#666", lineHeight: 1.6, margin: "0 0 24px" }}>
            {t.subtitle}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                background: "#E91E63",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                padding: "12px 20px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t.tryAgain}
            </button>
            <a
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: "12px 20px",
                fontWeight: 600,
                color: "#1a1a1a",
                textDecoration: "none",
              }}
            >
              {t.backHome}
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
