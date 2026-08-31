export type BackendProvider = "api";

/**
 * Backend provider — Nest API + Postgres is the only production backend.
 */
export function getBackendProvider(): BackendProvider {
  return "api";
}

/** Kept for callers; always returns "api". */
export function validateBackendProvider(): BackendProvider {
  return "api";
}

export function isApiProvider(): boolean {
  return true;
}

function readPublicEnv(keys: string[]): string {
  for (const key of keys) {
    const value =
      (typeof process !== "undefined" && process.env?.[key]
        ? process.env[key]
        : undefined) ??
      (typeof import.meta !== "undefined" &&
      (import.meta as ImportMeta & { env?: Record<string, string> }).env?.[key]
        ? (import.meta as ImportMeta & { env?: Record<string, string> }).env![
            key
          ]
        : undefined);
    if (value?.trim()) return value.trim().replace(/\/$/, "");
  }
  return "";
}

export function getApiBaseUrl(): string {
  const url = readPublicEnv(["VITE_API_URL", "NEXT_PUBLIC_API_URL"]);
  if (!url) {
    throw new Error("VITE_API_URL or NEXT_PUBLIC_API_URL is required");
  }
  return url;
}

export function getSocketUrl(): string {
  const url = readPublicEnv([
    "VITE_SOCKET_URL",
    "NEXT_PUBLIC_SOCKET_URL",
    "VITE_API_URL",
    "NEXT_PUBLIC_API_URL",
  ]);
  if (!url) {
    throw new Error(
      "VITE_SOCKET_URL / NEXT_PUBLIC_SOCKET_URL (or API URL) is required"
    );
  }
  return url;
}
