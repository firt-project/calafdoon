/**
 * Layer 2 — App Defense
 * Stops automated form spam and cross-site forged browser calls.
 */

/** Hidden honeypot field name — humans leave empty; bots often fill it. */
export const HONEYPOT_FIELD = "companyWebsite";

export function isHoneypotTriggered(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value !== "string") return true;
  return value.trim().length > 0;
}

/**
 * Allow only same-site browser origins for sensitive Next.js API routes.
 * Convex mutations use their own auth; this guards `/api/*` handlers.
 */
export function isTrustedOrigin(
  request: { headers: Headers; url?: string },
  allowedHosts?: string[]
): boolean {
  const origin = request.headers.get("origin");
  let host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "";

  if (!host && request.url) {
    try {
      host = new URL(request.url).host;
    } catch {
      // ignore
    }
  }

  if (!origin) {
    // State-changing API calls must include Origin.
    return false;
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  if (originHost === host) return true;

  const extras = [...(allowedHosts ?? [])];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      extras.push(new URL(appUrl).host);
    } catch {
      // ignore
    }
  }

  return extras.some((h) => h === originHost);
}

/** Timing-neutral success used when a honeypot trips (do not tip off bots). */
export function silentBotSuccess<T extends Record<string, unknown>>(
  payload: T
): T {
  return payload;
}
