/**
 * Layer 1 — Edge Shield
 * Blocks scanners, probe paths, and burst traffic before the app runs.
 * Responses stay generic (no stack, vendor, or path hints).
 */

const PROBE_PATTERNS: RegExp[] = [
  /^\/\.env/i,
  /^\/\.git/i,
  /^\/\.aws/i,
  /^\/\.svn/i,
  /^\/\.hg/i,
  /^\/wp-/i,
  /^\/wordpress/i,
  /^\/phpmyadmin/i,
  /^\/admin\.php$/i,
  /^\/xmlrpc\.php$/i,
  /\.php$/i,
  /\.asp$/i,
  /\.aspx$/i,
  /\.jsp$/i,
  /^\/cgi-bin/i,
  /^\/vendor\//i,
  /^\/composer\.(json|lock)$/i,
  /^\/package-lock\.json$/i,
  /^\/actuator/i,
  /^\/server-status/i,
  /^\/debug\b/i,
  /^\/\.vscode/i,
  /^\/\.DS_Store$/i,
  /^\/thumbs\.db$/i,
  /\/(backup|dump|sql|config)\.(sql|bak|old|zip|tar|gz)$/i,
];

/** Paths attackers commonly probe — never reveal what exists. */
export function isProbePath(pathname: string): boolean {
  const path = pathname.split("?")[0] || "/";
  if (path === "/robots.txt" || path === "/sitemap.xml") return false;
  if (path.startsWith("/.well-known/")) return false;
  return PROBE_PATTERNS.some((re) => re.test(path));
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120; // requests per IP per minute (edge instance)

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function pruneBuckets(now: number) {
  if (buckets.size < 2_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Soft per-IP burst limit (per edge isolate). Returns false when blocked. */
export function allowEdgeRequest(ip: string): boolean {
  const now = Date.now();
  pruneBuckets(now);
  const key = ip || "unknown";
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (existing.count >= RATE_MAX) {
    return false;
  }
  existing.count += 1;
  return true;
}

const BAD_UA =
  /sqlmap|nikto|nmap|masscan|dirbuster|gobuster|wfuzz|acunetix|nessus|havij|zgrab|python-requests\/|curl\/7\.(0|1|2)|libwww-perl/i;

/** Obvious attack tooling user-agents (not normal browsers / Convex). */
export function isHostileUserAgent(ua: string | null): boolean {
  if (!ua || ua.trim().length < 8) return true;
  return BAD_UA.test(ua);
}

export function clientIp(request: {
  headers: Headers;
}): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/** Generic blocked response — no useful intel for attackers. */
export function blockedResponse(status: 403 | 429 = 403): Response {
  return new Response("Forbidden", {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
