import { getApiBaseUrl, getSocketUrl, validateFrontendEnv } from "@hel/api-client";

export type ClientEnv = {
  apiUrl: string;
  socketUrl: string;
  appUrl: string;
  stripePublishableKey: string;
  useLocalDemo: boolean;
};

function assertNoLocalApiInProd(url: string, label: string): void {
  if (!import.meta.env.PROD) return;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error(`${label} must use https in production.`);
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "10.0.2.2" ||
    host === "10.0.3.2" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host)
  ) {
    throw new Error(`${label} must not use a local/private host in production.`);
  }
}

export function readClientEnv(): ClientEnv {
  const env = import.meta.env;
  const useLocalDemo =
    env.VITE_USE_LOCAL_DEMO === "true" || env.VITE_USE_LOCAL_DEMO === "1";

  if (useLocalDemo && import.meta.env.PROD) {
    throw new Error(
      "VITE_USE_LOCAL_DEMO cannot be enabled in production builds."
    );
  }

  const report = validateFrontendEnv();
  if (!report.ok && !useLocalDemo) {
    if (import.meta.env.PROD) {
      throw new Error(`Missing API env: ${report.errors.join("; ")}`);
    }
    console.error("[HelCalaf] Missing API env:", report.errors);
  }

  let apiUrl = "";
  let socketUrl = "";
  try {
    apiUrl = getApiBaseUrl();
    socketUrl = getSocketUrl();
    assertNoLocalApiInProd(apiUrl, "VITE_API_URL");
    assertNoLocalApiInProd(socketUrl, "VITE_SOCKET_URL");
  } catch (e) {
    if (!useLocalDemo) throw e;
  }

  return {
    apiUrl,
    socketUrl,
    appUrl: (env.VITE_APP_URL as string | undefined)?.trim() || "",
    stripePublishableKey:
      (env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined)?.trim() || "",
    useLocalDemo,
  };
}
