/** Refuse synthetic/e2e tests against remote production Postgres. */
export function assertSafeSyntheticTestDatabase(url: string) {
  const normalized = url.toLowerCase();
  const isLocal =
    normalized.includes("localhost") ||
    normalized.includes("127.0.0.1") ||
    normalized.includes("@postgres:");
  const isRemote =
    !isLocal &&
    (normalized.includes("render.com") ||
      normalized.includes("dpg-") ||
      normalized.includes("amazonaws.com"));
  if (isRemote && process.env.ALLOW_SYNTHETIC_TESTS_ON_REMOTE_DB !== "1") {
    throw new Error(
      "Refusing synthetic tests on a remote DATABASE_URL. " +
        "Use local Postgres, or set ALLOW_SYNTHETIC_TESTS_ON_REMOTE_DB=1 (dangerous)."
    );
  }
}
