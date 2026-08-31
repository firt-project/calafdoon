import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  allowEdgeRequest,
  blockedResponse,
  clientIp,
  isHostileUserAgent,
  isProbePath,
} from "@/lib/security/edge-shield";

/**
 * Maintenance / coming-soon gate.
 *
 * OFF by default (full site).
 * Force ON:  MAINTENANCE_MODE=true (or 1 / on / yes)
 * Force OFF: MAINTENANCE_MODE=false
 */
function isMaintenanceOn(): boolean {
  const value = (process.env.MAINTENANCE_MODE ?? "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes" || value === "on";
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Layer 1: Edge Shield (always on) ─────────────────────────────────
  if (isProbePath(pathname)) {
    return blockedResponse(403);
  }

  const ua = request.headers.get("user-agent");
  const method = request.method.toUpperCase();
  if (
    method !== "GET" &&
    method !== "HEAD" &&
    method !== "OPTIONS" &&
    isHostileUserAgent(ua)
  ) {
    return blockedResponse(403);
  }

  const ip = clientIp(request);
  if (!allowEdgeRequest(ip)) {
    return blockedResponse(429);
  }

  // ── Maintenance (optional) ───────────────────────────────────────────
  if (!isMaintenanceOn()) {
    return NextResponse.next();
  }

  if (
    pathname === "/maintenance.html" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/images/") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon" ||
    pathname === "/apple-icon" ||
    pathname === "/sw.js" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  ) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/maintenance.html";
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
