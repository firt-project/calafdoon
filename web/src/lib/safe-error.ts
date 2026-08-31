/**
 * Public-facing error sanitizer.
 * Never surface vendor names, stack traces, request IDs, env vars, or plan limits.
 */

const TECHNICAL =
  /convex|vercel|stripe(?!\s*checkout)|cloudflare|request id|\[CONVEX|uncaught|server error|free plan|dashboard\.|npx\s|AUTH_|SECRET|JWT|JWKS|DEPLOY|process\.env|NEXT_PUBLIC_|localhost|127\.0\.0\.1|\.convex\.|eu-west|mutation|query\(|action\(|at\s+\S+\s+\(|stack|ECONN|ETIMEDOUT|fetch failed|Overloaded|deployments have been disabled|Missing environment|InvalidAccountId|InvalidSecret|TooManyFailedAttempts/i;

const MAX_SAFE_LENGTH = 140;

function firstLine(message: string): string {
  return message
    .replace(/^\[CONVEX[^\]]*\]\s*/i, "")
    .replace(/^Uncaught Error:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .split("\n")[0]
    ?.trim() ?? "";
}

/** True when a message looks like an internal / vendor leak. */
export function isTechnicalErrorMessage(message: string): boolean {
  const line = firstLine(message);
  if (!line) return true;
  if (line.length > MAX_SAFE_LENGTH) return true;
  if (TECHNICAL.test(line)) return true;
  if (/https?:\/\//i.test(line)) return true;
  if (/[{}\[\]]/.test(line) && /id|path|table|index/i.test(line)) return true;
  return false;
}

/**
 * Map any thrown value to a safe string for toasts / UI.
 * Prefer `fallback` whenever the error looks internal.
 */
export function getSafeUserError(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) {
    return fallback;
  }
  const line = firstLine(error.message);
  if (!line || isTechnicalErrorMessage(line)) {
    return fallback;
  }
  return line;
}

/** Prefer Nest safe messages for admin actions; keep Prisma dumps out of toasts. */
export function getAdminActionError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    const line = firstLine(error.message);
    if (
      /could not delete|cannot delete|unauthorized|forbidden|invalid csrf|not found|related records|incorrect password|please sign in again/i.test(
        line
      )
    ) {
      return line.slice(0, MAX_SAFE_LENGTH);
    }
  }
  return getSafeUserError(error, fallback);
}

/** Dev-only logging — never dump full errors in production browsers. */
export function logClientError(scope: string, error: unknown): void {
  if (process.env.NODE_ENV !== "development") return;
  // eslint-disable-next-line no-console
  console.error(`[${scope}]`, error);
}
