/**
 * Lucia-compatible Scrypt (Phase 1).
 *
 * Matches audited @convex-dev/auth Password defaults / lucia Scrypt:
 * - normalize: NFKC
 * - N=16384, r=16, p=1, dkLen=64
 * - format: saltHex:keyHex (16-byte salt → 32 hex chars; 64-byte key → 128 hex)
 * - salt input to scrypt is the UTF-8 bytes of the hex salt string (Lucia behaviour)
 *
 * Implemented with Node crypto.scrypt so migration tooling does not require
 * the lucia package to be installed to run inspect/tests.
 */
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

/** promisify(scrypt) drops the options overload in @types/node — wrap explicitly. */
function scryptAsync(
  password: Buffer,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

export const LUCIA_SCRYPT = {
  N: 16384,
  r: 16,
  p: 1,
  dkLen: 64,
  saltBytes: 16,
} as const;

export type HashClassification =
  | "standard_salt_key"
  | "legacy_s2"
  | "missing"
  | "malformed";

function encodeHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function decodeHex(hex: string): Buffer {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Invalid hex");
  }
  return Buffer.from(hex, "hex");
}

async function generateScryptKey(
  passwordNormalized: string,
  saltHex: string
): Promise<Buffer> {
  const passwordBytes = Buffer.from(passwordNormalized, "utf8");
  // Lucia encodes the hex salt *string* as UTF-8 for scrypt, not raw salt bytes.
  const saltBytes = Buffer.from(saltHex, "utf8");
  return scryptAsync(passwordBytes, saltBytes, LUCIA_SCRYPT.dkLen, {
    N: LUCIA_SCRYPT.N,
    r: LUCIA_SCRYPT.r,
    p: LUCIA_SCRYPT.p,
    maxmem: 128 * 1024 * 1024,
  });
}

export function normalizePassword(password: string): string {
  return password.normalize("NFKC");
}

export function classifyPasswordHash(
  secret: string | null | undefined
): HashClassification {
  if (secret == null || secret === "") return "missing";
  if (secret.startsWith("s2:")) return "legacy_s2";
  const parts = secret.split(":");
  if (parts.length !== 2) return "malformed";
  const [salt, key] = parts;
  if (!salt || !key) return "malformed";
  if (!/^[0-9a-fA-F]+$/.test(salt) || !/^[0-9a-fA-F]+$/.test(key)) {
    return "malformed";
  }
  if (salt.length % 2 !== 0 || key.length % 2 !== 0) return "malformed";
  if (salt.length !== 32 || key.length !== 128) return "malformed";
  return "standard_salt_key";
}

/** Artificial fixtures only — never log the returned hash. */
export async function hashPasswordLuciaScrypt(password: string): Promise<string> {
  const salt = encodeHex(randomBytes(LUCIA_SCRYPT.saltBytes));
  const key = await generateScryptKey(normalizePassword(password), salt);
  return `${salt}:${encodeHex(key)}`;
}

export async function verifyPasswordLuciaScrypt(
  password: string,
  storedHash: string
): Promise<boolean> {
  try {
    if (classifyPasswordHash(storedHash) !== "standard_salt_key") {
      return false;
    }
    const [saltHex, keyHex] = storedHash.split(":");
    const expected = decodeHex(keyHex);
    const actual = await generateScryptKey(normalizePassword(password), saltHex);
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function redactHash(secret: string | null | undefined): string {
  if (!secret) return "[empty]";
  const kind = classifyPasswordHash(secret);
  if (kind === "missing") return "[empty]";
  if (kind === "legacy_s2") return "s2:[REDACTED]";
  if (kind === "malformed") return "[MALFORMED]";
  return `${secret.slice(0, 8)}…[REDACTED]`;
}

export function hashFingerprint(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

export function redactConvexId(id: string | null | undefined): string {
  if (!id) return "[none]";
  if (id.length <= 8) return `${id[0] ?? "?"}…`;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export function redactEmail(email: string | null | undefined): string {
  if (!email) return "[none]";
  const at = email.indexOf("@");
  if (at <= 0) return "[redacted]";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const prefix = local.slice(0, Math.min(2, local.length));
  return `${prefix}***@${domain}`;
}
