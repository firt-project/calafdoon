/**
 * Browser origins allowed to call this API with credentials.
 *
 * L5: Production / Render trust only explicitly configured origins
 * (CORS_ORIGINS, APP_URL, CORS_ORIGIN). No hardcoded Vercel preview hosts.
 *
 * Development falls back to localhost / Capacitor defaults when unset.
 */
export function resolveCorsOrigins(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const fromList = (value: string | undefined) =>
    (value ?? "")
      .split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean);

  const localDefaults = [
    "http://127.0.0.1:3001",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    // Capacitor / Ionic WebView origins (mobile client)
    "capacitor://localhost",
    "ionic://localhost",
    "http://localhost",
    "https://localhost",
  ];

  const configured = [
    ...fromList(env.CORS_ORIGINS),
    ...fromList(env.APP_URL),
    ...fromList(env.CORS_ORIGIN), // single-origin back-compat
  ];

  const isProd =
    (env.NODE_ENV ?? "").toLowerCase() === "production" ||
    Boolean(env.RENDER) ||
    Boolean(env.RENDER_SERVICE_ID);

  if (isProd) {
    // Explicit env only — preview/staging hosts must be listed in CORS_ORIGINS.
    return [...new Set(configured)];
  }

  return [...new Set(configured.length > 0 ? configured : localDefaults)];
}
