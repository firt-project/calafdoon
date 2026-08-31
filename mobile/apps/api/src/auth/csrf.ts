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

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method.toUpperCase())) return true;

    // Unauthenticated auth bootstrap endpoints skip CSRF
    const path = req.path || req.url || "";
    if (
      path.endsWith("/auth/login") ||
      path.endsWith("/auth/register") ||
      path.endsWith("/auth/register/check-email") ||
      path.endsWith("/auth/forgot-password") ||
      path.endsWith("/auth/reset-password")
    ) {
      return true;
    }

    // Cross-site SPA auth (Vercel → Render) uses X-Session-Token; custom headers
    // are CORS-protected so CSRF is not needed for that auth path.
    const headerSession =
      typeof req.headers["x-session-token"] === "string"
        ? req.headers["x-session-token"]
        : undefined;
    if (headerSession) return true;

    // Only enforce when a session cookie is present
    const session = req.cookies?.[SESSION_COOKIE];
    if (!session) return true;

    const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined;
    const headerToken =
      (req.headers["x-csrf-token"] as string | undefined) ??
      (req.headers["x-xsrf-token"] as string | undefined);

    if (!cookieToken || !headerToken || !safeEqualHex(cookieToken, headerToken)) {
      throw new ForbiddenException("Invalid CSRF token");
    }
    return true;
  }
}

/** Cross-site Vercel↔API needs SameSite=None; Secure. Local stays Lax. */
export function cookieSameSite(
  secure: boolean
): "lax" | "none" | "strict" {
  const raw = (process.env.COOKIE_SAMESITE ?? "").trim().toLowerCase();
  if (raw === "none" || raw === "lax" || raw === "strict") return raw;
  return secure ? "none" : "lax";
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
