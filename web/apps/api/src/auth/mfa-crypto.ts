import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const VERSION = 1;

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(`hel-mfa-v1:${secret}`, "utf8").digest();
}

/** Encrypt TOTP secret at rest (AES-256-GCM). Output: v1:ivHex:tagHex:cipherHex */
export function encryptMfaSecret(plain: string, sessionSecret: string): string {
  const key = deriveKey(sessionSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptMfaSecret(
  blob: string,
  sessionSecret: string
): string {
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== String(VERSION)) {
    throw new Error("Invalid MFA secret blob");
  }
  const [, ivHex, tagHex, dataHex] = parts;
  const key = deriveKey(sessionSecret);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex!, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex!, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex!, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export function hashRecoveryCode(raw: string): string {
  return createHash("sha256")
    .update(`hel-mfa-recovery:${raw.trim().toUpperCase()}`, "utf8")
    .digest("hex");
}

/** 10 codes like ABCD-EFGH (URL-safe, no ambiguous chars). */
export function generateRecoveryCodes(count = 10): string[] {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8);
    let left = "";
    let right = "";
    for (let j = 0; j < 4; j++) {
      left += alphabet[bytes[j]! % alphabet.length];
      right += alphabet[bytes[j + 4]! % alphabet.length];
    }
    codes.push(`${left}-${right}`);
  }
  return codes;
}
