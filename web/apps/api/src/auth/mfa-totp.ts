import { Secret, TOTP } from "otpauth";
import { randomBytes } from "node:crypto";

export const MFA_ISSUER = "Hel Calafkaaga";
export const MFA_PERIOD_SEC = 30;
export const MFA_DIGITS = 6;
/** Accept previous/current/next step (±1) for clock skew. */
export const MFA_WINDOW = 1;

export function generateTotpSecret(): string {
  // 20 bytes → 160-bit secret (RFC 4226 recommendation).
  return new Secret({ size: 20 }).base32;
}

export function buildTotp(secretBase32: string, labelEmail: string): TOTP {
  return new TOTP({
    issuer: MFA_ISSUER,
    label: labelEmail || "staff",
    algorithm: "SHA1",
    digits: MFA_DIGITS,
    period: MFA_PERIOD_SEC,
    secret: Secret.fromBase32(secretBase32),
  });
}

export function totpOtpauthUrl(secretBase32: string, labelEmail: string): string {
  return buildTotp(secretBase32, labelEmail).toString();
}

/**
 * Verify TOTP with ±window skew and return the matching time-step, or null.
 * Callers must reject if step === lastAcceptedStep (replay).
 */
export function verifyTotpCode(
  secretBase32: string,
  code: string,
  opts?: { now?: Date; window?: number }
): { ok: true; step: bigint } | { ok: false } {
  const cleaned = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return { ok: false };

  const totp = buildTotp(secretBase32, "verify");
  const window = opts?.window ?? MFA_WINDOW;
  const now = opts?.now ?? new Date();
  const timestamp = now.getTime();
  const delta = totp.validate({ token: cleaned, timestamp, window });
  if (delta === null) return { ok: false };

  const epochStep = BigInt(
    Math.floor(timestamp / 1000 / MFA_PERIOD_SEC) + delta
  );
  return { ok: true, step: epochStep };
}

export function randomChallengeToken(): string {
  return randomBytes(32).toString("base64url");
}
