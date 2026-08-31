/**
 * Central log / audit redaction (M10).
 *
 * Sanitizes copies only — never mutate live request/response objects used by
 * auth, CSRF, Stripe webhook verification, or Socket.IO.
 */

export const REDACTED = "[Redacted]";

const MAX_DEPTH = 8;
const MAX_ARRAY = 64;
const MAX_OBJECT_KEYS = 64;
const MAX_STRING = 2_000;

/** Header names compared case-insensitively. */
export const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-session-token",
  "x-csrf-token",
  "x-xsrf-token",
  "stripe-signature",
  "x-api-key",
]);

/**
 * Exact field names (case-insensitive). Prefer an explicit list over substring
 * matching so diagnostics like "tokenCount" stay visible.
 */
export const SENSITIVE_FIELD_NAMES = new Set([
  "password",
  "currentpassword",
  "newpassword",
  "passwordconfirmation",
  "passwordhash",
  "token",
  "sessiontoken",
  "rawtoken",
  "refreshtoken",
  "accesstoken",
  "csrftoken",
  "invitetoken",
  "resettoken",
  "tokenhash",
  "webhooksecret",
  "clientsecret",
  "apikey",
  "secret",
  "secretkey",
  "authorization",
  "cookie",
  "set-cookie",
  "setcookie",
  "signedurl",
  "uploadurl",
  "downloadurl",
  "accepturl",
  "reseturl",
]);

const SENSITIVE_QUERY_PARAMS = new Set([
  "token",
  "sessiontoken",
  "invitetoken",
  "resettoken",
  "code",
  "signature",
  "x-amz-signature",
  "x-amz-credential",
  "x-amz-security-token",
  "x-amz-signedheaders",
  "awsaccesskeyid",
  "x-id",
]);

/** Pino fast-redact paths (defense in depth alongside serializers). */
export const PINO_REDACT_PATHS: string[] = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers.set-cookie",
  "req.headers['authorization']",
  "req.headers['cookie']",
  "req.headers['set-cookie']",
  "req.headers['x-session-token']",
  'req.headers["x-session-token"]',
  "req.headers['x-csrf-token']",
  'req.headers["x-csrf-token"]',
  "req.headers['x-xsrf-token']",
  'req.headers["x-xsrf-token"]',
  "req.headers['stripe-signature']",
  'req.headers["stripe-signature"]',
  "req.headers['proxy-authorization']",
  'req.headers["proxy-authorization"]',
  "req.headers['x-api-key']",
  'req.headers["x-api-key"]',
  "res.headers['set-cookie']",
  'res.headers["set-cookie"]',
  "res.headers.set-cookie",
  "password",
  "passwordHash",
  "currentPassword",
  "newPassword",
  "passwordConfirmation",
  "token",
  "secret",
  "secretKey",
  "sessionToken",
  "rawToken",
  "refreshToken",
  "accessToken",
  "csrfToken",
  "inviteToken",
  "resetToken",
  "tokenHash",
  "webhookSecret",
  "clientSecret",
  "apiKey",
  "signedUrl",
  "uploadUrl",
  "downloadUrl",
  "acceptUrl",
  "resetUrl",
  "verifyUrl",
  "verificationToken",
  "verificationUrl",
  "req.body.password",
  "req.body.currentPassword",
  "req.body.newPassword",
  "req.body.passwordConfirmation",
  "req.body.token",
  "req.body.sessionToken",
  "req.body.csrfToken",
  "req.body.email",
  "*.password",
  "*.token",
  "*.sessionToken",
  "*.rawToken",
  "*.csrfToken",
  "*.authorization",
  "*.cookie",
];

function normalizeFieldKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

export function isSensitiveHeaderName(name: string): boolean {
  return SENSITIVE_HEADER_NAMES.has(name.toLowerCase());
}

export function isSensitiveFieldName(name: string): boolean {
  const lower = name.toLowerCase();
  if (SENSITIVE_HEADER_NAMES.has(lower)) return true;
  if (SENSITIVE_FIELD_NAMES.has(normalizeFieldKey(name))) return true;
  return false;
}

function isSensitiveQueryParam(name: string): boolean {
  return SENSITIVE_QUERY_PARAMS.has(name.toLowerCase());
}

/** Strip credentials from postgres/redis/etc connection strings. */
export function sanitizeConnectionString(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.password) u.password = "***";
    if (u.username && /redis/i.test(u.protocol)) {
      // redis://:password@host form keeps empty user; still mask password above
    }
    return u.toString();
  } catch {
    return raw
      .replace(/:\/\/([^:/@]+):([^@]+)@/g, "://$1:***@")
      .replace(/:\/\/:([^@]+)@/g, "://:***@");
  }
}

function looksLikeConnectionString(value: string): boolean {
  return /^(postgres(ql)?|mysql|mongodb(\+srv)?|redis(s)?|amqp|http|https):\/\//i.test(
    value
  );
}

function looksLikeAwsSignedUrl(value: string): boolean {
  return (
    /[?&]X-Amz-Signature=/i.test(value) ||
    /[?&]X-Amz-Credential=/i.test(value) ||
    /[?&]AWSAccessKeyId=/i.test(value)
  );
}

/** Sanitize URL query/path secrets; never return full invite/reset/signed URLs. */
export function sanitizeUrl(raw: string): string {
  if (!raw) return raw;
  if (/^(postgres(ql)?|mysql|mongodb(\+srv)?|redis(s)?):\/\//i.test(raw)) {
    return sanitizeConnectionString(raw);
  }
  if (looksLikeAwsSignedUrl(raw)) {
    try {
      const u = new URL(raw);
      return `${u.origin}${u.pathname}?[signed-url-redacted]`;
    } catch {
      return "[signed-url-redacted]";
    }
  }

  try {
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw);
    const u = hasScheme ? new URL(raw) : new URL(raw, "http://local.invalid");
    let pathname = u.pathname
      .replace(/\/staff-invites\/[^/]+/gi, "/staff-invites/:token")
      .replace(/\/reset-password\/[^/]+/gi, "/reset-password/:token");

    for (const key of [...u.searchParams.keys()]) {
      if (isSensitiveQueryParam(key)) {
        u.searchParams.set(key, REDACTED);
      }
    }
    const search = u.searchParams.toString();
    const pathAndQuery = search ? `${pathname}?${search}` : pathname;
    if (!hasScheme) return pathAndQuery;
    return `${u.origin}${pathAndQuery}`;
  } catch {
    return raw
      .replace(/([?&](?:token|sessionToken|inviteToken|resetToken|code|signature)=)[^&\s"']+/gi, `$1${REDACTED}`)
      .replace(/\/staff-invites\/[^/?#]+/gi, "/staff-invites/:token");
  }
}

/** Sanitize free-form log messages that may embed URLs or connection strings. */
export function sanitizeLogMessage(message: string): string {
  if (!message) return message;
  let out = message;
  out = out.replace(
    /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis(?:s)?):\/\/[^\s"']+/gi,
    (m) => sanitizeConnectionString(m)
  );
  out = out.replace(
    /https?:\/\/[^\s"'<>]+/gi,
    (m) => sanitizeUrl(m)
  );
  out = out.replace(
    /([?&](?:token|sessionToken|inviteToken|resetToken)=)[^&\s"']+/gi,
    `$1${REDACTED}`
  );
  return out.length > MAX_STRING ? `${out.slice(0, MAX_STRING)}…` : out;
}

/** Copy headers with sensitive values redacted (does not mutate input). */
export function sanitizeHeaders(
  headers: Record<string, unknown> | undefined | null
): Record<string, unknown> {
  if (!headers || typeof headers !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (isSensitiveHeaderName(key)) {
      out[key] = REDACTED;
    } else if (typeof value === "string" && looksLikeConnectionString(value)) {
      out[key] = sanitizeUrl(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function truncateString(value: string): string {
  if (looksLikeConnectionString(value) || looksLikeAwsSignedUrl(value)) {
    return sanitizeUrl(value);
  }
  if (
    /[?&](?:token|sessionToken|inviteToken|resetToken)=/i.test(value) ||
    /\/staff-invites\/[^/?#\s]+/i.test(value) ||
    /\/admin\/invite\?token=/i.test(value) ||
    /\/reset-password\?token=/i.test(value)
  ) {
    return sanitizeUrl(value);
  }
  return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
}

/**
 * Deep-sanitize arbitrary metadata for logs/audit.
 * Depth-limited, cycle-safe, never throws.
 */
export function sanitizeForLog(value: unknown, depth = 0, seen?: WeakSet<object>): unknown {
  try {
    if (value == null) return value;
    if (typeof value === "string") return truncateString(value);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "symbol") return value.toString();
    if (typeof value === "function") return "[Function]";
    if (depth >= MAX_DEPTH) return "[MaxDepth]";

    const tracker = seen ?? new WeakSet<object>();

    if (Array.isArray(value)) {
      if (tracker.has(value)) return "[Circular]";
      tracker.add(value);
      const slice = value.slice(0, MAX_ARRAY).map((item) =>
        sanitizeForLog(item, depth + 1, tracker)
      );
      if (value.length > MAX_ARRAY) slice.push(`[+${value.length - MAX_ARRAY} more]`);
      return slice;
    }

    if (value instanceof Error) {
      return serializeErrorForLog(value);
    }

    if (typeof value === "object") {
      if (tracker.has(value)) return "[Circular]";
      tracker.add(value);

      const out: Record<string, unknown> = {};
      const entries = Object.entries(value as Record<string, unknown>);
      let i = 0;
      for (const [key, nested] of entries) {
        if (i++ >= MAX_OBJECT_KEYS) {
          out["…"] = `[+${entries.length - MAX_OBJECT_KEYS} keys]`;
          break;
        }
        if (isSensitiveFieldName(key) || isSensitiveHeaderName(key)) {
          out[key] = REDACTED;
          continue;
        }
        if (key === "headers" && nested && typeof nested === "object") {
          out[key] = sanitizeHeaders(nested as Record<string, unknown>);
          continue;
        }
        if (
          (key === "url" || key === "path" || key === "href" || key === "originalUrl") &&
          typeof nested === "string"
        ) {
          out[key] = sanitizeUrl(nested);
          continue;
        }
        out[key] = sanitizeForLog(nested, depth + 1, tracker);
      }
      return out;
    }

    return String(value);
  } catch {
    return "[Unserializable]";
  }
}

/** pino-http / pino-std-serializers request shape → safe copy. */
export function serializeRequestForLog(req: {
  id?: unknown;
  method?: string;
  url?: string;
  query?: unknown;
  params?: unknown;
  headers?: Record<string, unknown>;
  remoteAddress?: string;
  remotePort?: number;
}): Record<string, unknown> {
  return {
    id: req.id,
    method: req.method,
    url: typeof req.url === "string" ? sanitizeUrl(req.url) : req.url,
    query: sanitizeForLog(req.query),
    params: sanitizeForLog(req.params),
    headers: sanitizeHeaders(req.headers),
    remoteAddress: req.remoteAddress,
    remotePort: req.remotePort,
  };
}

/** Response serializer — keep status; redact Set-Cookie. */
export function serializeResponseForLog(res: {
  statusCode?: number | null;
  headers?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    statusCode: res.statusCode ?? null,
    headers: sanitizeHeaders(res.headers),
  };
}

/**
 * Error serializer — keep type/message/code/status; strip Axios config secrets.
 * Never attaches `raw` (would re-expose unsanitized objects).
 */
export function serializeErrorForLog(err: unknown): Record<string, unknown> {
  try {
    if (err == null) return { message: String(err) };
    if (typeof err !== "object") return { message: String(err) };

    const e = err as Record<string, unknown> & {
      name?: string;
      message?: string;
      stack?: string;
      code?: unknown;
      statusCode?: unknown;
      status?: unknown;
      type?: string;
    };

    const out: Record<string, unknown> = {
      type: e.type ?? e.name ?? "Error",
      message:
        typeof e.message === "string"
          ? sanitizeLogMessage(e.message)
          : e.message,
    };
    if (e.code != null) out.code = e.code;
    if (e.statusCode != null) out.statusCode = e.statusCode;
    else if (e.status != null) out.statusCode = e.status;
    if (typeof e.stack === "string") {
      out.stack = sanitizeLogMessage(e.stack);
    }

    const config = e.config as Record<string, unknown> | undefined;
    if (config && typeof config === "object") {
      out.config = {
        method: config.method,
        url:
          typeof config.url === "string" ? sanitizeUrl(config.url) : undefined,
        baseURL:
          typeof config.baseURL === "string"
            ? sanitizeUrl(String(config.baseURL))
            : undefined,
      };
    }

    const response = e.response as Record<string, unknown> | undefined;
    if (response && typeof response === "object") {
      out.response = {
        statusCode: response.statusCode ?? response.status,
        headers: sanitizeHeaders(
          (response.headers as Record<string, unknown> | undefined) ?? {}
        ),
      };
    }

    // Preserve safe provider ids when present without dumping bodies.
    if (typeof e.requestId === "string") out.requestId = e.requestId;
    if (typeof e.eventId === "string") out.eventId = e.eventId;

    return out;
  } catch {
    return { type: "Error", message: "[UnserializableError]" };
  }
}
