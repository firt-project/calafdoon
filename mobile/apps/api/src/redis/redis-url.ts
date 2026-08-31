/**
 * Resolve Redis connection URL for Nest / BullMQ / Socket.IO.
 *
 * - Production (Render/Upstash): set REDIS_URL with credentials embedded; leave
 *   REDIS_PASSWORD unset. Existing authenticated URLs are left unchanged.
 * - Local Compose: set REDIS_PASSWORD and either embed it in REDIS_URL or keep a
 *   password-less host URL — we inject the password when the URL has none.
 */
export function resolveRedisUrl(opts: {
  redisUrl?: string | null;
  redisPassword?: string | null;
}): string {
  const raw = (opts.redisUrl ?? "").trim() || "redis://127.0.0.1:6379";
  const password = (opts.redisPassword ?? "").trim();
  if (!password) return raw;

  try {
    const u = new URL(raw);
    if (u.password) return raw;
    u.password = password;
    return u.toString();
  } catch {
    return raw;
  }
}
