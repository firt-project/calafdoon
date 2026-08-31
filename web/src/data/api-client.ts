import { getApiBaseUrl } from "./provider";
import { track } from "./telemetry";
import { redirectForSecurityGateCode } from "@/lib/security-gate-codes";

export type ApiErrorShape = {
  status: number;
  code?: string;
  message: string;
};

export class ApiClientError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(shape: ApiErrorShape) {
    super(shape.message);
    this.name = "ApiClientError";
    this.status = shape.status;
    this.code = shape.code;
  }

  toJSON(): ApiErrorShape {
    return { status: this.status, code: this.code, message: this.message };
  }
}

export type ApiRequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** AbortSignal from caller */
  signal?: AbortSignal;
  /** Default 30_000 */
  timeoutMs?: number;
  /** Optional Idempotency-Key (required to retry mutating payment/message POSTs) */
  idempotencyKey?: string;
  /** Skip JSON parse (e.g. empty 204) */
  parseJson?: boolean;
};

const CSRF_COOKIE = "hel_csrf";
const CSRF_HEADER = "X-CSRF-Token";
/** Legacy key — cleared on access; session must not live in JS storage (H5). */
const SESSION_STORAGE_KEY = "hel_session_token";
const CSRF_STORAGE_KEY = "hel_csrf_token";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  if (!match) return undefined;
  return decodeURIComponent(match.slice(name.length + 1));
}

function clearLegacySessionStorage() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore quota / private mode
  }
}

/**
 * @deprecated H5 — browser sessions use HttpOnly cookies only.
 * Calls clear any legacy sessionStorage token and do nothing else.
 */
export function setApiSessionToken(_token?: string | null) {
  clearLegacySessionStorage();
}

/**
 * @deprecated H5 — always returns undefined; clears legacy storage.
 */
export function getApiSessionToken(): string | undefined {
  clearLegacySessionStorage();
  return undefined;
}

/**
 * Persist CSRF token from login/me JSON.
 * Cross-site: CSRF cookie is on the API host and not readable via document.cookie
 * on the Vercel origin, so the response body value is stored for the header.
 * This is not a session credential.
 */
export function setApiCsrfToken(token: string | null | undefined) {
  if (typeof sessionStorage === "undefined") return;
  if (token) sessionStorage.setItem(CSRF_STORAGE_KEY, token);
  else sessionStorage.removeItem(CSRF_STORAGE_KEY);
}

export function getApiCsrfToken(): string | undefined {
  const fromCookie = readCookie(CSRF_COOKIE);
  if (fromCookie) return fromCookie;
  if (typeof sessionStorage === "undefined") return undefined;
  return sessionStorage.getItem(CSRF_STORAGE_KEY) ?? undefined;
}

export function clearApiAuthStorage() {
  clearLegacySessionStorage();
  setApiCsrfToken(null);
}

function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isRetryableMethod(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

function mayRetryMutating(
  method: string,
  path: string,
  idempotencyKey?: string
): boolean {
  if (isRetryableMethod(method)) return true;
  if (!idempotencyKey) return false;
  // Only allow idempotent retry for payment/message POSTs when key present
  if (method !== "POST") return false;
  return (
    path.includes("/payments/") ||
    path.includes("/messages") ||
    path.includes("/conversations/")
  );
}

async function normalizeError(res: Response): Promise<ApiClientError> {
  let message = res.statusText || "Request failed";
  let code: string | undefined;
  try {
    const data = (await res.json()) as {
      message?: string | string[];
      error?: string;
      code?: string;
      statusCode?: number;
    };
    if (Array.isArray(data.message)) {
      message = data.message.join("; ");
    } else if (typeof data.message === "string" && data.message) {
      message = data.message;
    } else if (typeof data.error === "string") {
      message = data.error;
    }
    code = data.code;
  } catch {
    // ignore non-JSON
  }
  return new ApiClientError({ status: res.status, code, message });
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const base = getApiBaseUrl();
  const url = path.startsWith("http")
    ? path
    : `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const maxAttempts =
    isRetryableMethod(method) ||
    mayRetryMutating(method, path, options.idempotencyKey)
      ? isRetryableMethod(method)
        ? 3 // initial + 2 retries
        : 2
      : 1;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? 30_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort);

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "X-Request-Id": newRequestId(),
        ...options.headers,
      };

      if (options.idempotencyKey) {
        headers["Idempotency-Key"] = options.idempotencyKey;
      }

      let body: BodyInit | undefined;
      if (options.body !== undefined && options.body !== null) {
        if (
          typeof FormData !== "undefined" &&
          options.body instanceof FormData
        ) {
          body = options.body;
        } else {
          headers["Content-Type"] = "application/json";
          body = JSON.stringify(options.body);
        }
      }

      // H5: never send X-Session-Token from the browser client.
      clearLegacySessionStorage();

      if (MUTATING.has(method)) {
        const csrf = getApiCsrfToken();
        if (csrf) headers[CSRF_HEADER] = csrf;
      }

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers,
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await normalizeError(res);
        track("api_error", { status: err.status, code: err.code ?? "" });
        if (err.status === 403 && err.code) {
          redirectForSecurityGateCode(err.code);
        }
        // Retry only on 5xx / network for allowed methods
        if (
          attempt < maxAttempts &&
          err.status >= 500 &&
          (isRetryableMethod(method) ||
            mayRetryMutating(method, path, options.idempotencyKey))
        ) {
          lastError = err;
          continue;
        }
        throw err;
      }

      if (options.parseJson === false || res.status === 204) {
        return undefined as T;
      }

      const text = await res.text();
      if (!text) return undefined as T;
      return JSON.parse(text) as T;
    } catch (e) {
      lastError = e;
      const aborted =
        (e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError");
      if (aborted) {
        if (options.signal?.aborted) throw e;
        throw new ApiClientError({
          status: 408,
          code: "timeout",
          message: "Request timed out",
        });
      }
      if (
        attempt < maxAttempts &&
        !(e instanceof ApiClientError && e.status < 500) &&
        (isRetryableMethod(method) ||
          mayRetryMutating(method, path, options.idempotencyKey))
      ) {
        continue;
      }
      if (!(e instanceof ApiClientError)) {
        track("api_error", { status: 0, code: "network" });
      }
      throw e;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
  }

  throw lastError;
}

export const apiClient = {
  get: <T>(path: string, opts?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...opts, method: "GET" }),
  async getBlob(
    path: string,
    opts?: Omit<ApiRequestOptions, "method" | "body" | "parseJson">
  ): Promise<Blob> {
    const method = "GET";
    const base = getApiBaseUrl();
    const url = path.startsWith("http")
      ? path
      : `${base}${path.startsWith("/") ? path : `/${path}`}`;
    const controller = new AbortController();
    const timeoutMs = opts?.timeoutMs ?? 15_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    opts?.signal?.addEventListener("abort", onAbort);
    try {
      clearLegacySessionStorage();
      const headers: Record<string, string> = {
        Accept: "*/*",
        "X-Request-Id": newRequestId(),
        ...opts?.headers,
      };
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers,
        signal: controller.signal,
      });
      if (!res.ok) throw await normalizeError(res);
      return res.blob();
    } finally {
      clearTimeout(timer);
      opts?.signal?.removeEventListener("abort", onAbort);
    }
  },
  post: <T>(
    path: string,
    body?: unknown,
    opts?: Omit<ApiRequestOptions, "method" | "body">
  ) => apiFetch<T>(path, { ...opts, method: "POST", body }),
  put: <T>(
    path: string,
    body?: unknown,
    opts?: Omit<ApiRequestOptions, "method" | "body">
  ) => apiFetch<T>(path, { ...opts, method: "PUT", body }),
  patch: <T>(
    path: string,
    body?: unknown,
    opts?: Omit<ApiRequestOptions, "method" | "body">
  ) => apiFetch<T>(path, { ...opts, method: "PATCH", body }),
  delete: <T>(
    path: string,
    body?: unknown,
    opts?: Omit<ApiRequestOptions, "method" | "body">
  ) => apiFetch<T>(path, { ...opts, method: "DELETE", body }),
};
