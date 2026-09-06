import { useMemo } from "react";
import { useSession } from "@/features/auth/SessionProvider";
import { SITE_BRAND_NAME } from "@/lib/constants";

/**
 * A faint repeating watermark laid over someone else's photos — brand + the
 * viewer's own identity. It deters screenshot-sharing (any leaked shot points
 * back to the account that took it) without blocking the user's normal view.
 */
export function PhotoGuard() {
  const { user } = useSession();

  const bg = useMemo(() => {
    const who =
      (user?.email ? user.email.split("@")[0] : "") ||
      (user?.id ? user.id.slice(0, 6) : "member");
    const text = `${SITE_BRAND_NAME} · ${who}`;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="150">` +
      `<text x="12" y="80" transform="rotate(-24 130 75)" ` +
      `font-family="system-ui,sans-serif" font-size="13" ` +
      `fill="rgba(255,255,255,0.13)">${escapeXml(text)}</text></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }, [user?.email, user?.id]);

  return (
    <div
      className="photo-guard"
      aria-hidden="true"
      onContextMenu={(e) => e.preventDefault()}
      style={{ backgroundImage: bg }}
    />
  );
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === "<"
      ? "&lt;"
      : c === ">"
        ? "&gt;"
        : c === "&"
          ? "&amp;"
          : c === "'"
            ? "&apos;"
            : "&quot;"
  );
}
