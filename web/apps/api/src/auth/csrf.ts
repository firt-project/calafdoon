import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { generateToken, safeEqualHex } from "./crypto-util";

export const CSRF_COOKIE = "hel_csrf";
export const SESSION_COOKIE = "hel_session";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Paths that never require CSRF (unauthenticated bootstrap / provider webhooks). */
function isCsrfExemptPath(path: string): boolean {
  if (
    path.endsWith("/auth/login") ||
    path.endsWith("/auth/mfa/verify-login") ||
    path.endsWith("/auth/register") ||
    path.endsWith("/auth/register/check-email") ||
    path.endsWith("/auth/forgot-password") ||
    path.endsWith("/auth/reset-password") ||
    path.endsWith("/auth/verify-email")
  ) {
    return true;
  }
  // Stripe HMAC-verified webhook — not browser cookie auth.
  if (path.endsWith("/webhooks/stripe")) return true;
  // Public contact form — no session cookie expected.
  if (path.endsWith("/support/public")) return true;
  return false;
}

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method.toUpperCase())) return true;

    const path = req.path || req.url || "";
    if (isCsrfExemptPath(path)) return true;

    const cookieSession = req.cookies?.[SESSION_COOKIE] as string | undefined;
    const headerSession =
      typeof req.headers["x-session-token"] === "string"
        ? req.headers["x-session-token"]
        : undefined;

    // H5: cookie-authenticated browser requests always require CSRF.
    // Presence of X-Session-Token must NOT skip CSRF when a session cookie exists.
    if (cookieSession) {
      const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined;
      const headerToken =
        (req.headers["x-csrf-token"] as string | undefined) ??
        (req.headers["x-xsrf-token"] as string | undefined);

      if (
        !cookieToken ||
        !headerToken ||
        !safeEqualHex(cookieToken, headerToken)
      ) {
        throw new ForbiddenException("Invalid CSRF token");
      }
      return true;
    }

    // Header-only clients (no session cookie): CSRF does not apply.
    // Official browser clients must not use this path.
    if (headerSession) return true;

    // Unauthenticated mutating request — AuthGuard / route handlers decide.
    return true;
  }
}

/**
 * SameSite for auth cookies.
 *
 * Default is Lax — correct for same-site sibling hosts
 * (`web.example.com` ↔ `api.web.example.com`).
 *
 * Set `COOKIE_SAMESITE=none` only when the browser must send cookies on
 * true cross-site requests (legacy `*.onrender.com` API host). SameSite=None
 * always forces Secure in setSessionCookie / issueCsrfCookie.
 *
 * `@param _secure` retained for call-site compatibility; it no longer
 * implies SameSite=None.
 */
export function cookieSameSite(
  _secure?: boolean
): "lax" | "none" | "strict" {
  const raw = (process.env.COOKIE_SAMESITE ?? "").trim().toLowerCase();
  if (raw === "none" || raw === "lax" || raw === "strict") return raw;
  return "lax";
}

export function issueCsrfCookie(res: Response, secure: boolean, domain?: string) {
  const token = generateToken(24);
  const sameSite = cookieSameSite(secure);
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: sameSite === "none" ? true : secure,
    sameSite,
    path: "/",
    domain: domain || undefined,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return token;
}

export function setSessionCookie(
  res: Response,
  rawToken: string,
  opts: { secure: boolean; domain?: string; expiresAt: Date }
) {
  const sameSite = cookieSameSite(opts.secure);
  res.cookie(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: sameSite === "none" ? true : opts.secure,
    sameSite,
    path: "/",
    domain: opts.domain || undefined,
    expires: opts.expiresAt,
  });
}

export function clearAuthCookies(
  res: Response,
  opts: { secure: boolean; domain?: string }
) {
  const sameSite = cookieSameSite(opts.secure);
  const base = {
    path: "/",
    domain: opts.domain || undefined,
    secure: sameSite === "none" ? true : opts.secure,
    sameSite,
  };
  res.clearCookie(SESSION_COOKIE, { ...base, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false });
}
