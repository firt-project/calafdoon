import { getSafeUserError } from "@/lib/safe-error";

const DEFAULT_LOAD_ERROR = "Could not load data. Please try again.";

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

export function toLoadErrorMessage(
  error: unknown,
  fallback = DEFAULT_LOAD_ERROR
): string {
  return getSafeUserError(error, fallback);
}
