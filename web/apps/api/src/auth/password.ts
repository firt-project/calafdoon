/**
 * Password hashing strategy (Phase 4)
 *
 * Legacy (migrated): Lucia Scrypt — saltHex:keyHex, N=16384,r=16,p=1,dkLen=64, NFKC.
 * Preferred (new / reset / change / rehash-on-login): Argon2id
 *   - memoryCost: 19456 KiB (~19 MiB) — OWASP baseline
 *   - timeCost: 2
 *   - parallelism: 1
 *   - hashLength: 32
 * Versioning: AuthAccount.passwordAlgo = lucia_scrypt | argon2id | unknown
 *
 * Rehash-on-login: only after successful Lucia verification; write Argon2id then
 * set passwordAlgo=argon2id in the same update. Never replace hash before verify.
 */
import * as argon2 from "argon2";
import {
  classifyPasswordHash,
  verifyPasswordLuciaScrypt,
  type HashClassification,
} from "./lucia-scrypt";

export const PREFERRED_PASSWORD_ALGO = "argon2id" as const;

export const ARGON2ID_PARAMS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export type PasswordAlgoName = "lucia_scrypt" | "argon2id" | "unknown";

export async function hashPasswordPreferred(password: string): Promise<{
  hash: string;
  algo: "argon2id";
}> {
  const normalized = password.normalize("NFKC");
  const hash = await argon2.hash(normalized, { ...ARGON2ID_PARAMS });
  return { hash, algo: "argon2id" };
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  algo: PasswordAlgoName | string
): Promise<{ ok: boolean; classification?: HashClassification }> {
  const normalized = password.normalize("NFKC");

  if (algo === "argon2id" || storedHash.startsWith("$argon2")) {
    try {
      const ok = await argon2.verify(storedHash, normalized);
      return { ok };
    } catch {
      return { ok: false };
    }
  }

  if (algo === "lucia_scrypt" || algo === "unknown") {
    const classification = classifyPasswordHash(storedHash);
    if (classification !== "standard_salt_key") {
      return { ok: false, classification };
    }
    const ok = await verifyPasswordLuciaScrypt(password, storedHash);
    return { ok, classification };
  }

  return { ok: false };
}

export function shouldRehashOnLogin(algo: PasswordAlgoName | string): boolean {
  return algo === "lucia_scrypt" || algo === "unknown";
}
