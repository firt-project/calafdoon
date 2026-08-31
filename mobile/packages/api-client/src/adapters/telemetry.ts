/**
 * Staging-safe counters / logs.
 * Never log passwords, tokens, emails, private URLs, or message bodies.
 */

export type TelemetryEvent =
  | "api_error"
  | "login_failure"
  | "register_failure"
  | "socket_reconnect"
  | "message_failure"
  | "upload_failure"
  | "checkout_failure"
  | "access_state_mismatch";

type Meta = Record<string, string | number | boolean | undefined | null>;

const counts = new Map<TelemetryEvent, number>();

const SENSITIVE_KEY =
  /pass(word)?|token|secret|email|authorization|cookie|body|message|url|href/i;

function scrub(meta?: Meta): Meta | undefined {
  if (!meta) return undefined;
  const out: Meta = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEY.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    if (typeof v === "string" && (v.includes("@") || v.startsWith("http"))) {
      out[k] = "[redacted]";
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function track(event: TelemetryEvent, meta?: Meta): void {
  counts.set(event, (counts.get(event) ?? 0) + 1);
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console
  console.info(`[telemetry] ${event}`, scrub(meta) ?? "");
}

export function getTelemetryCounts(): Record<string, number> {
  return Object.fromEntries(counts.entries());
}

export function resetTelemetryCounts(): void {
  counts.clear();
}
