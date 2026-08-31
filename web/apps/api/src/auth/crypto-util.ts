import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hmacSha256Hex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(rawToken: string): string {
  return sha256Hex(rawToken);
}

export function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/** Generic auth failure — never distinguish email vs password vs ban. */
export const AUTH_FAILED_MESSAGE = "Invalid email or password";

/** Missing/expired session on an authenticated route (not a login attempt). */
export const SESSION_REQUIRED_MESSAGE = "Please sign in again";

/** Wrong password while already authenticated (change password / delete account). */
export const INCORRECT_PASSWORD_MESSAGE = "Incorrect password";

export const RESET_GENERIC_MESSAGE =
  "A password reset link has been sent to your email. Check your inbox and spam folder.";

/** @deprecated M2 — never return this from forgot-password (enumeration). */
export const RESET_NOT_FOUND_MESSAGE =
  "No account found with this email. Please register first, or check for typos.";


/** Anti-enumeration register failure — same message for taken email and other create failures. */
export const REGISTER_FAILED_MESSAGE = "Unable to create account";
