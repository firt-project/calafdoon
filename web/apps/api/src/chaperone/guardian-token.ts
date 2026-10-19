import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Guardian links carry `<chaperoneId>.<mac>`. The mac is an HMAC of the id, so the link can be
 * re-issued to the member who invited the guardian without storing the secret itself, and it
 * stops working the moment the invite is revoked, declined or expired (status is checked server-side).
 */
export function signGuardianToken(secret: string, chaperoneId: string): string {
  const mac = createHmac("sha256", secret)
    .update(`guardian:${chaperoneId}`)
    .digest("base64url")
    .slice(0, 32);
  return `${chaperoneId}.${mac}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns the chaperone id when the token is well-formed and correctly signed, else null. */
export function verifyGuardianToken(secret: string, token: string): string | null {
  if (typeof token !== "string" || token.length > 100) return null;
  const dot = token.indexOf(".");
  if (dot !== 36) return null;
  const id = token.slice(0, dot);
  if (!UUID.test(id)) return null;
  const expected = Buffer.from(signGuardianToken(secret, id));
  const actual = Buffer.from(token);
  if (expected.length !== actual.length) return null;
  return timingSafeEqual(expected, actual) ? id : null;
}
