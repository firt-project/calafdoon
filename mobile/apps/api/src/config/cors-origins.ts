/**
 * Browser / WebView origins allowed to call this API with credentials.
 * Merges CORS_ORIGINS, APP_URL, known Hel production frontends, and Capacitor schemes.
 *
 * Capacitor Android (`server.androidScheme: "https"`) typically sends Origin:
 *   https://localhost
 * Other shells may use capacitor://localhost or http://localhost — allowlist only those,
 * never `*` with credentials.
 */
export function resolveCorsOrigins(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const fromList = (value: string | undefined) =>
    (value ?? "")
      .split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean);

  const defaults = [
    "http://127.0.0.1:3001",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
  ];

  const productionFrontends = [
    "https://www.helcalafkaaga.com",
    "https://helcalafkaaga.com",
    "https://tel-calafkaaga-1-api-one.vercel.app",
  ];

  /** Required for Capacitor WebView → Nest API credentialed fetch / Socket.IO */
  const capacitorOrigins = [
    "https://localhost",
    "capacitor://localhost",
    "http://localhost",
    "ionic://localhost",
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

  return [
    ...new Set([
      ...(configured.length > 0 ? configured : defaults),
      ...(isProd ? productionFrontends : []),
      // Always allow Capacitor origins so phone builds work even if CORS_ORIGINS
      // was configured for web-only frontends.
      ...capacitorOrigins,
    ]),
  ];
}
