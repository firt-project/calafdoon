export type BackendProvider = "api";

/**
 * Backend provider — Nest API + Postgres is the only backend.
 */
export function getBackendProvider(): BackendProvider {
  return "api";
}

/** Kept for callers; always returns "api". */
export function validateBackendProvider(): BackendProvider {
  return "api";
}

export function isApiProvider(): boolean {
  return true;
}

/** Same-origin proxy base (e.g. `/backend`) — Safari-safe first-party cookies. */
export function isRelativeApiBase(url: string): boolean {
  return url.startsWith("/");
}

/** Crude eTLD+1: `www.helcalafkaaga.com` and `api.helcalafkaaga.com` share a site. */
export function registrableSite(hostname: string): string {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  return parts.slice(-2).join(".");
}

function browserLocation(): { origin: string; hostname: string; protocol: string } | null {
  if (typeof window === "undefined" || !window.location) return null;
  return {
    origin: window.location.origin,
    hostname: window.location.hostname,
    protocol: window.location.protocol,
  };
}

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

/**
 * iPhone Safari blocks third-party cookies. If the page is on helcalafkaaga.com
 * but NEXT_PUBLIC_API_URL still points at *.onrender.com, force the /backend
 * rewrite so hel_session is first-party. Android Chrome often still works
 * cross-site — this path keeps both devices on the same first-party cookies.
 */
export function shouldForceSameOriginApiProxy(apiUrl: string): boolean {
  const loc = browserLocation();
  if (!loc) return false;
  if (isRelativeApiBase(apiUrl)) return false;
  if (loc.protocol !== "https:") return false;
  if (isLocalHost(loc.hostname)) return false;
  try {
    const apiHost = new URL(apiUrl).hostname;
    if (isLocalHost(apiHost)) return false;
    return registrableSite(apiHost) !== registrableSite(loc.hostname);
  } catch {
    return false;
  }
}

function resolveSameOriginBase(): string {
  const loc = browserLocation();
  if (loc?.origin) return loc.origin;
  const app = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  if (app) return app;
  throw new Error(
    "Same-origin API/socket requires a browser context or NEXT_PUBLIC_APP_URL"
  );
}

export function getApiBaseUrl(): string {
  const url = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");
  if (!url) {
    throw new Error("NEXT_PUBLIC_API_URL is required");
  }
  if (isRelativeApiBase(url)) return url;
  if (shouldForceSameOriginApiProxy(url)) return "/backend";
  return url;
}

export function getSocketUrl(): string {
  const explicit = (process.env.NEXT_PUBLIC_SOCKET_URL ?? "")
    .trim()
    .replace(/\/$/, "");

  if (
    explicit === "same-origin" ||
    explicit === "/" ||
    explicit.toLowerCase() === "self"
  ) {
    return resolveSameOriginBase();
  }

  const api = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");

  if (explicit && shouldForceSameOriginApiProxy(explicit)) {
    return resolveSameOriginBase();
  }
  if (
    !explicit &&
    api &&
    (isRelativeApiBase(api) || shouldForceSameOriginApiProxy(api))
  ) {
    return resolveSameOriginBase();
  }

  if (explicit) return explicit;
  if (api) return api;

  throw new Error(
    "NEXT_PUBLIC_SOCKET_URL (or NEXT_PUBLIC_API_URL) is required"
  );
}

/** True when browser traffic uses the Vercel → Nest rewrite (first-party cookies). */
export function usesSameOriginApiProxy(): boolean {
  const api = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();
  if (isRelativeApiBase(api)) return true;
  return shouldForceSameOriginApiProxy(api.replace(/\/$/, ""));
}
