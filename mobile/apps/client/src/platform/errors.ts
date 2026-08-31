import { ApiClientError } from "@hel/api-client";
import { messageForSecurityGateCode } from "@/lib/security-gate-codes";

export type AppErrorKind =
  | "offline"
  | "timeout"
  | "validation"
  | "auth_expired"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "upload_rejected"
  | "payment_unavailable"
  | "server_unavailable"
  | "unknown";

export type MappedAppError = {
  kind: AppErrorKind;
  message: string;
  retryable: boolean;
};

export function mapClientError(error: unknown): MappedAppError {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      kind: "offline",
      message: "You are offline. Reconnect to continue.",
      retryable: true,
    };
  }

  if (error instanceof ApiClientError) {
    const status = error.status;
    if (status === 0) {
      return {
        kind: "offline",
        message: "Could not reach the server. Check your connection.",
        retryable: true,
      };
    }
    if (status === 401) {
      return {
        kind: "auth_expired",
        message: "Your session expired. Please sign in again.",
        retryable: false,
      };
    }
    if (status === 403) {
      const gateMsg = messageForSecurityGateCode(error.code);
      return {
        kind: "forbidden",
        message: gateMsg ?? (error.message || "You do not have permission for this action."),
        retryable: false,
      };
    }
    if (status === 404) {
      return {
        kind: "not_found",
        message: "This item is no longer available.",
        retryable: false,
      };
    }
    if (status === 408 || status === 504) {
      return {
        kind: "timeout",
        message: "The request timed out. Try again.",
        retryable: true,
      };
    }
    if (status === 429) {
      return {
        kind: "rate_limited",
        message: "Too many requests. Please wait a moment.",
        retryable: true,
      };
    }
    if (status === 400 || status === 422) {
      const lower = error.message.toLowerCase();
      if (lower.includes("image") || lower.includes("upload") || lower.includes("photo")) {
        return {
          kind: "upload_rejected",
          message: "That photo was rejected. Try a smaller JPG or PNG.",
          retryable: true,
        };
      }
      return {
        kind: "validation",
        message: "Please check your input and try again.",
        retryable: false,
      };
    }
    if (status === 402 || status === 503) {
      const paymentish =
        error.message.toLowerCase().includes("payment") ||
        error.message.toLowerCase().includes("stripe") ||
        error.message.toLowerCase().includes("checkout");
      return {
        kind: paymentish ? "payment_unavailable" : "server_unavailable",
        message: paymentish
          ? "Payments are temporarily unavailable."
          : "The server is temporarily unavailable.",
        retryable: true,
      };
    }
    if (status >= 500) {
      return {
        kind: "server_unavailable",
        message: "Something went wrong on the server. Try again shortly.",
        retryable: true,
      };
    }
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("abort") || msg.includes("cancel")) {
      return { kind: "unknown", message: "Cancelled.", retryable: false };
    }
    if (msg.includes("network") || msg.includes("fetch")) {
      return {
        kind: "offline",
        message: "Network error. Check your connection.",
        retryable: true,
      };
    }
  }

  return {
    kind: "unknown",
    message: "Something went wrong. Please try again.",
    retryable: true,
  };
}

export function userFacingError(error: unknown): string {
  return mapClientError(error).message;
}
