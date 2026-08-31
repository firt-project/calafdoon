/**
 * @deprecated LOCAL DEMO MODE
 *
 * The Vite client under apps/client still contains browser-local demo services
 * (localStorage accounts, seed-peer matching, fake chat auto-replies, local plan unlock).
 *
 * These are NOT production authentication or matching.
 * Production authority is the Nest API in apps/api (sessions, Prisma, Redis, S3, Stripe).
 *
 * Migration target (next step):
 * - Wire mobile / web clients to @hel/api-client
 * - Set VITE_USE_LOCAL_DEMO=false (default)
 * - Remove local-demo services from production builds
 *
 * Set VITE_USE_LOCAL_DEMO=true only for offline UI prototyping.
 */

export const LOCAL_DEMO_DEPRECATED = true;

export function isLocalDemoEnabled(): boolean {
  const raw =
    (typeof import.meta !== "undefined" &&
      (import.meta as ImportMeta & { env?: Record<string, string> }).env
        ?.VITE_USE_LOCAL_DEMO) ||
    "false";
  return raw === "true" || raw === "1";
}

export function assertApiModePreferred(): void {
  if (isLocalDemoEnabled()) {
    console.warn(
      "[hel] VITE_USE_LOCAL_DEMO is enabled. Local storage auth/matching is deprecated. Use Nest API for production."
    );
  }
}
