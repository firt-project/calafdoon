import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyPasswordHash,
  hashPasswordLuciaScrypt,
  redactHash,
  verifyPasswordLuciaScrypt,
} from "../src/crypto/lucia-scrypt.ts";

describe("Lucia Scrypt compatibility", () => {
  it("hashes and verifies a known artificial password", async () => {
    const password = "TestPassword-Phase1!";
    const hash = await hashPasswordLuciaScrypt(password);
    assert.equal(classifyPasswordHash(hash), "standard_salt_key");
    assert.equal(await verifyPasswordLuciaScrypt(password, hash), true);
    assert.equal(await verifyPasswordLuciaScrypt("wrong-password", hash), false);
  });

  it("rejects malformed hashes safely", async () => {
    assert.equal(await verifyPasswordLuciaScrypt("x", "not-a-hash"), false);
    assert.equal(await verifyPasswordLuciaScrypt("x", "abc:def"), false);
    assert.equal(await verifyPasswordLuciaScrypt("x", ""), false);
  });

  it("classifies legacy s2 and missing formats", () => {
    assert.equal(classifyPasswordHash(null), "missing");
    assert.equal(classifyPasswordHash(""), "missing");
    assert.equal(
      classifyPasswordHash(
        "s2:aabbccddeeff00112233445566778899:00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"
      ),
      "legacy_s2"
    );
  });

  it("applies NFKC normalization (ﬁ ligature vs fi)", async () => {
    // U+FB01 LATIN SMALL LIGATURE FI should normalize to "fi"
    const withLigature = "passﬁword";
    const normalizedForm = "passfiword";
    const hash = await hashPasswordLuciaScrypt(withLigature);
    assert.equal(await verifyPasswordLuciaScrypt(normalizedForm, hash), true);
  });

  it("never exposes full hashes via redactHash", async () => {
    const hash = await hashPasswordLuciaScrypt("another-test-secret");
    const redacted = redactHash(hash);
    assert.equal(redacted.includes(hash), false);
    assert.match(redacted, /REDACTED/);
  });
});

describe("hash classification hex rules", () => {
  it("requires 32-char salt and 128-char key", () => {
    assert.equal(classifyPasswordHash("aa:bb"), "malformed");
    const salt = "a".repeat(32);
    const key = "b".repeat(128);
    assert.equal(classifyPasswordHash(`${salt}:${key}`), "standard_salt_key");
    assert.equal(classifyPasswordHash(`${salt}:${key}c`), "malformed");
  });
});
