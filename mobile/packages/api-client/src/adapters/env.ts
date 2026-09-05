import { getBackendProvider } from "./provider";

export type FrontendEnvReport = {
  provider: "api";
  ok: boolean;
  errors: string[];
};

function hasEnv(keys: string[]): boolean {
  for (const key of keys) {
    const fromProcess =
      typeof process !== "undefined" ? process.env?.[key] : undefined;
    const fromVite =
      typeof import.meta !== "undefined"
        ? (import.meta as ImportMeta & { env?: Record<string, string> }).env?.[
            key
          ]
        : undefined;
    if ((fromProcess ?? fromVite ?? "").trim()) return true;
  }
  return false;
}

/**
 * Validate frontend env for the Nest API backend.
 */
export function validateFrontendEnv(): FrontendEnvReport {
  const errors: string[] = [];
  const provider = getBackendProvider();

  if (!hasEnv(["VITE_API_URL", "NEXT_PUBLIC_API_URL", "EXPO_PUBLIC_API_URL"])) {
    errors.push(
      "VITE_API_URL, NEXT_PUBLIC_API_URL, or EXPO_PUBLIC_API_URL is required"
    );
  }
  if (
    !hasEnv([
      "VITE_SOCKET_URL",
      "NEXT_PUBLIC_SOCKET_URL",
      "EXPO_PUBLIC_SOCKET_URL",
      "VITE_API_URL",
      "NEXT_PUBLIC_API_URL",
      "EXPO_PUBLIC_API_URL",
    ])
  ) {
    errors.push("Socket/API base URL is required");
  }

  return { provider, ok: errors.length === 0, errors };
}
