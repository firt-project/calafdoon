/**
 * L2: production-safe Content-Security-Policy for the Next.js frontend.
 *
 * Design notes (keep in sync with next.config.ts):
 * - Next.js App Router + inline bootstrap / JSON-LD / SW cleanup require
 *   script-src 'unsafe-inline' unless a nonce middleware is introduced.
 * - Tailwind / component style attributes need style-src 'unsafe-inline'.
 * - next/font self-hosts Google fonts at build time → font-src 'self'.
 * - Stripe Checkout is a top-level redirect (not Elements) → no js.stripe.com
 *   in script-src; uploads use signed HTTPS URLs (R2 / S3).
 * - Development adds 'unsafe-eval' (Next HMR) and localhost API/MinIO/WS.
 */

export type CspEnv = {
  NODE_ENV?: string;
  NEXT_PUBLIC_API_URL?: string;
  NEXT_PUBLIC_SOCKET_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
};

function originOf(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function wsOrigin(httpOrigin: string | null): string | null {
  if (!httpOrigin) return null;
  if (httpOrigin.startsWith("https://")) {
    return `wss://${httpOrigin.slice("https://".length)}`;
  }
  if (httpOrigin.startsWith("http://")) {
    return `ws://${httpOrigin.slice("http://".length)}`;
  }
  return null;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v && v.trim())))];
}

/** Build the CSP header value (directives joined with "; "). */
export function buildContentSecurityPolicy(env: CspEnv = process.env): string {
  const isProd = (env.NODE_ENV ?? "").toLowerCase() === "production";
  const api = originOf(env.NEXT_PUBLIC_API_URL);
  const app = originOf(env.NEXT_PUBLIC_APP_URL);
  const socketHttp =
    originOf(env.NEXT_PUBLIC_SOCKET_URL) ?? api ?? app;
  const socketWs = wsOrigin(socketHttp);
  // Same-origin /backend + /socket.io (Safari) even if env still lists onrender.
  const appWs = wsOrigin(app);

  const scriptSrc = unique([
    "'self'",
    "'unsafe-inline'", // Next.js runtime + JSON-LD + ClearStaleServiceWorkers
    isProd ? null : "'unsafe-eval'", // Next.js HMR / dev tooling only
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://*.googletagmanager.com",
  ]);

  const connectSrc = unique([
    "'self'",
    api,
    app,
    appWs,
    socketHttp,
    socketWs,
    "https://www.google-analytics.com",
    "https://*.google-analytics.com",
    "https://*.analytics.google.com",
    "https://*.googletagmanager.com",
    // Signed PUT/GET to Cloudflare R2 / S3-compatible storage
    "https://*.r2.cloudflarestorage.com",
    "https://*.cloudflarestorage.com",
    "https://*.amazonaws.com",
    ...(isProd
      ? []
      : [
          "http://127.0.0.1:4000",
          "http://localhost:4000",
          "http://127.0.0.1:3001",
          "http://localhost:3001",
          "http://127.0.0.1:9000",
          "http://localhost:9000",
          "ws://127.0.0.1:4000",
          "ws://localhost:4000",
          "ws://127.0.0.1:3001",
          "ws://localhost:3001",
        ]),
  ]);

  const directives: string[] = [
    // Fallback for unspecified fetch types
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    // Tailwind + inline style attributes (component library)
    "style-src 'self' 'unsafe-inline'",
    // App assets, signed media, Unsplash, data/blob previews
    "img-src 'self' data: blob: https:",
    `connect-src ${connectSrc.join(" ")}`,
    // next/font emits self-hosted files
    "font-src 'self' data:",
    // Marketing how-to embed (youtube-nocookie preferred; youtube kept for legacy embed URL)
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://youtube.com",
    "object-src 'none'",
    "base-uri 'self'",
    // Stripe Checkout is top-level navigation; forms stay first-party
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
  ];

  if (isProd) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}
