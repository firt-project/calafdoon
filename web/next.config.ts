import type { NextConfig } from "next";
import { buildContentSecurityPolicy } from "./src/lib/security/content-security-policy";

/**
 * Upstream Nest host for same-origin browser proxy.
 * Browser calls /backend/* and /socket.io/* on the Vercel host; Next rewrites
 * to Render. That makes hel_session a first-party cookie (Safari-safe).
 * Override with API_UPSTREAM_URL (server-only). Do not point this at the
 * Vercel/frontend URL.
 */
const apiUpstream = (
  process.env.API_UPSTREAM_URL ??
  process.env.NEST_API_UPSTREAM_URL ??
  // Fallback to the deployed Render API so /backend/* and /socket.io/* still
  // proxy when the env var is missing (was https://api.example.com — an
  // unresolvable host that surfaced as opaque 502s). Override with
  // API_UPSTREAM_URL for staging / a custom API host.
  "https://tel-calafkaaga-1.onrender.com"
).replace(/\/$/, "");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self)",
  },
  // L2: production-safe CSP (see src/lib/security/content-security-policy.ts).
  {
    key: "Content-Security-Policy",
    value: buildContentSecurityPolicy({
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
      NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    }),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: `${apiUpstream}/:path*`,
      },
      // Socket.IO HTTP long-polling (and WS when the platform allows upgrade).
      {
        source: "/socket.io/:path*",
        destination: `${apiUpstream}/socket.io/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/apple-icon",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
