import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

const DEV_FALLBACK_API = "http://127.0.0.1:4000";

function assertProductionClientEnv(env: Record<string, string>): void {
  const demo = env.VITE_USE_LOCAL_DEMO;
  if (demo === "true" || demo === "1") {
    throw new Error(
      "Production build rejected: VITE_USE_LOCAL_DEMO must be false."
    );
  }

  const apiUrl = (env.VITE_API_URL || "").trim();
  const socketUrl = (env.VITE_SOCKET_URL || env.VITE_API_URL || "").trim();

  if (!apiUrl) {
    throw new Error("Production build rejected: VITE_API_URL is required.");
  }
  if (!socketUrl) {
    throw new Error("Production build rejected: VITE_SOCKET_URL is required.");
  }

  for (const [name, value] of [
    ["VITE_API_URL", apiUrl],
    ["VITE_SOCKET_URL", socketUrl],
  ] as const) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`Production build rejected: ${name} is not a valid URL.`);
    }
    if (parsed.protocol !== "https:") {
      throw new Error(
        `Production build rejected: ${name} must use https:// (got ${parsed.protocol}).`
      );
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "10.0.2.2" ||
      host === "10.0.3.2" ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      throw new Error(
        `Production build rejected: ${name} must not point at a local/private host (${host}).`
      );
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isProd = mode === "production";
  const analyze = env.ANALYZE === "1" || env.ANALYZE === "true";

  if (isProd) {
    assertProductionClientEnv(env);
  }

  const apiUrl = isProd
    ? env.VITE_API_URL
    : env.VITE_API_URL || DEV_FALLBACK_API;
  const socketUrl = isProd
    ? env.VITE_SOCKET_URL || env.VITE_API_URL
    : env.VITE_SOCKET_URL || env.VITE_API_URL || DEV_FALLBACK_API;

  return {
    // Relative base so Capacitor WebView (https://localhost) loads JS/CSS.
    // Absolute "/assets/..." paths cause a blank white screen on many devices.
    base: "./",
    plugins: [
      react(),
      ...(analyze
        ? [
            visualizer({
              filename: "dist/bundle-stats.html",
              gzipSize: true,
              brotliSize: true,
              open: false,
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@hel/api-client": path.resolve(
          __dirname,
          "../../packages/api-client/src/adapters/index.ts"
        ),
      },
    },
    server: {
      port: 5173,
      host: true,
    },
    build: {
      sourcemap: false,
      minify: "esbuild",
      // Avoid crossorigin on script/link — Capacitor local assets can fail CORS and white-screen.
      modulePreload: { polyfill: false },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/react-easy-crop")) return "photo-editor";
            if (id.includes("node_modules/@tanstack/react-virtual")) {
              return "virtual-list";
            }
          },
        },
      },
    },
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(apiUrl),
      "import.meta.env.VITE_SOCKET_URL": JSON.stringify(socketUrl),
    },
  };
});
