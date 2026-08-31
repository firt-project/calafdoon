import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

/**
 * Normalize Capacitor / custom-scheme deep links and validate allowed paths.
 */

const ALLOWED_EXACT = new Set([
  "/",
  "/welcome",
  "/login",
  "/register",
  "/forgot-password",
  "/verify-email",
  "/change-password",
  "/enroll-mfa",
  "/discover",
  "/matches",
  "/messages",
  "/profile",
  "/settings",
  "/settings/delete-account",
  "/plans",
  "/onboarding/gender",
  "/onboarding/questionnaire",
  "/legal/privacy",
  "/legal/terms",
  "/legal/guidelines",
  "/legal/safety",
  "/legal/help",
  "/legal/about",
  "/splash",
]);

const ALLOWED_PREFIXES = [
  "/messages/",
  "/legal/",
  "/onboarding/",
  "/reset-password",
  "/verify-email",
  "/verify",
  "/p/",
] as const;

type DeepLinkHandler = (path: string, params: URLSearchParams) => void;

/** Convert helcalaf://login → /login and https host paths → pathname. */
export function pathFromDeepLinkUrl(url: string): {
  path: string;
  params: URLSearchParams;
} {
  const parsed = new URL(url);
  let path = parsed.pathname || "/";

  // Custom schemes: helcalaf://login → host=login
  // helcalaf://messages/abc → host=messages, pathname=/abc
  if (parsed.hostname && !parsed.hostname.includes(".")) {
    const rest = parsed.pathname === "/" ? "" : parsed.pathname;
    path = `/${parsed.hostname}${rest}`;
  }

  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  return { path, params: parsed.searchParams };
}

export function isAllowedDeepLinkPath(path: string): boolean {
  if (ALLOWED_EXACT.has(path)) return true;
  for (const prefix of ALLOWED_PREFIXES) {
    if (prefix.endsWith("/")) {
      if (path.startsWith(prefix)) return true;
    } else if (path === prefix || path.startsWith(`${prefix}/`)) {
      return true;
    }
  }
  return false;
}

export function handleIncomingDeepLinkUrl(
  url: string,
  handler: DeepLinkHandler
): boolean {
  try {
    const { path, params } = pathFromDeepLinkUrl(url);
    if (!isAllowedDeepLinkPath(path)) {
      console.warn("[deep-link] blocked path", path);
      return false;
    }
    handler(path, params);
    return true;
  } catch {
    return false;
  }
}

/**
 * Register Capacitor appUrlOpen / cold-start URL handling.
 * Privileged admin routes are never allowed via deep link.
 */
export function registerDeepLinks(handler: DeepLinkHandler): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined;

  const onUrl = (url: string) => {
    handleIncomingDeepLinkUrl(url, handler);
  };

  const sub = CapApp.addListener("appUrlOpen", ({ url }) => onUrl(url));
  void CapApp.getLaunchUrl().then((result) => {
    if (result?.url) onUrl(result.url);
  });

  return () => {
    void sub.then((h) => h.remove());
  };
}
