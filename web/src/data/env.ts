import { getBackendProvider } from "./provider";

export type FrontendEnvReport = {
  provider: "api";
  ok: boolean;
  errors: string[];
};

/**
 * Validate frontend env for the Nest API backend.
 * Call from Providers on mount (client) — never throws into the tree;
 * returns a report and logs in development.
 */
export function validateFrontendEnv(): FrontendEnvReport {
  const errors: string[] = [];
  const provider = getBackendProvider();

  if (!(process.env.NEXT_PUBLIC_API_URL ?? "").trim()) {
    errors.push("NEXT_PUBLIC_API_URL is required");
  }
  const socket =
    process.env.NEXT_PUBLIC_SOCKET_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!(socket ?? "").trim()) {
    errors.push(
      "NEXT_PUBLIC_SOCKET_URL (or NEXT_PUBLIC_API_URL) is required"
    );
  }

  return { provider, ok: errors.length === 0, errors };
}
