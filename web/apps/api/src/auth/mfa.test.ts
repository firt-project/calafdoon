import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decryptMfaSecret,
  encryptMfaSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
} from "./mfa-crypto";
import {
  generateTotpSecret,
  totpOtpauthUrl,
  verifyTotpCode,
  buildTotp,
  MFA_PERIOD_SEC,
} from "./mfa-totp";

const SECRET = "test-session-secret-32chars-min!!";

describe("mfa-crypto", () => {
  it("round-trips encrypted TOTP secrets", () => {
    const plain = generateTotpSecret();
    const blob = encryptMfaSecret(plain, SECRET);
    assert.notEqual(blob, plain);
    assert.equal(decryptMfaSecret(blob, SECRET), plain);
  });

  it("hashes recovery codes case-insensitively", () => {
    const codes = generateRecoveryCodes(10);
    assert.equal(codes.length, 10);
    const a = hashRecoveryCode(codes[0]!);
    const b = hashRecoveryCode(codes[0]!.toLowerCase());
    assert.equal(a, b);
    assert.notEqual(a, codes[0]);
  });
});

describe("mfa-totp", () => {
  it("builds otpauth URL and QR-compatible secret", () => {
    const secret = generateTotpSecret();
    const url = totpOtpauthUrl(secret, "admin@example.com");
    assert.match(url, /^otpauth:\/\/totp\//);
    assert.match(url, /Hel%20Calafkaaga|Hel Calafkaaga/);
  });

  it("verifies a current TOTP code", () => {
    const secret = generateTotpSecret();
    const totp = buildTotp(secret, "admin@example.com");
    const now = new Date();
    const code = totp.generate({ timestamp: now });
    const verified = verifyTotpCode(secret, code, { now });
    assert.equal(verified.ok, true);
  });

  it("rejects invalid codes", () => {
    const secret = generateTotpSecret();
    assert.equal(verifyTotpCode(secret, "000000").ok, false);
    assert.equal(verifyTotpCode(secret, "abcdef").ok, false);
  });

  it("accepts ±1 window skew", () => {
    const secret = generateTotpSecret();
    const totp = buildTotp(secret, "a@b.c");
    const now = new Date();
    const prev = new Date(now.getTime() - MFA_PERIOD_SEC * 1000);
    const code = totp.generate({ timestamp: prev });
    assert.equal(verifyTotpCode(secret, code, { now }).ok, true);
  });
});

describe("mfa login branching (L4)", () => {
  it("does not create a session when staff MFA is enabled", async () => {
    const { AuthService } = await import("./auth.service");
    const { hashPasswordLuciaScrypt } = await import("./lucia-scrypt");
    const password = "Staff-Mfa-Pass-99";
    const luciaHash = await hashPasswordLuciaScrypt(password);
    let sessionCreated = false;
    let challengeCreated = false;

    const auth = new AuthService(
      {
        user: {
          findMany: async () => [
            {
              id: "11111111-1111-1111-1111-111111111111",
              email: "admin@example.com",
              emailNormalized: "admin@example.com",
              mustResetPassword: false,
              mfaEnabled: true,
              createdAt: new Date(),
              profile: {
                id: "p",
                role: "admin",
                banned: false,
                hasPaid: true,
              },
              authAccounts: [
                {
                  id: "22222222-2222-2222-2222-222222222222",
                  passwordHash: luciaHash,
                  passwordAlgo: "lucia_scrypt",
                },
              ],
            },
          ],
          update: async () => ({}),
        },
        authAccount: { update: async () => ({}) },
        authAuditEvent: { create: async () => ({}) },
      } as never,
      {
        createSession: async () => {
          sessionCreated = true;
          return {
            rawToken: "t",
            sessionId: "33333333-3333-3333-3333-333333333333",
            expiresAt: new Date(),
          };
        },
      } as never,
      { get: () => SECRET } as never,
      { send: async () => {} } as never,
      {
        createLoginChallenge: async () => {
          challengeCreated = true;
          return {
            mfaToken: "challenge-token",
            expiresAt: new Date(Date.now() + 60_000),
          };
        },
      } as never
    );

    const result = await auth.login({
      email: "admin@example.com",
      password,
    });
    assert.equal(result.kind, "mfa_required");
    assert.equal(sessionCreated, false);
    assert.equal(challengeCreated, true);
    if (result.kind === "mfa_required") {
      assert.equal(result.mfaToken, "challenge-token");
    }
  });

  it("leaves member login unchanged (no MFA challenge)", async () => {
    const { AuthService } = await import("./auth.service");
    const { hashPasswordLuciaScrypt } = await import("./lucia-scrypt");
    const password = "Member-Pass-99";
    const luciaHash = await hashPasswordLuciaScrypt(password);
    let sessionCreated = false;

    const auth = new AuthService(
      {
        user: {
          findMany: async () => [
            {
              id: "11111111-1111-1111-1111-111111111111",
              email: "user@example.com",
              emailNormalized: "user@example.com",
              mustResetPassword: false,
              mfaEnabled: false,
              createdAt: new Date(),
              profile: {
                id: "p",
                role: "user",
                banned: false,
                hasPaid: true,
              },
              authAccounts: [
                {
                  id: "22222222-2222-2222-2222-222222222222",
                  passwordHash: luciaHash,
                  passwordAlgo: "lucia_scrypt",
                },
              ],
            },
          ],
          update: async () => ({}),
        },
        authAccount: { update: async () => ({}) },
        authAuditEvent: { create: async () => ({}) },
      } as never,
      {
        createSession: async () => {
          sessionCreated = true;
          return {
            rawToken: "t",
            sessionId: "33333333-3333-3333-3333-333333333333",
            expiresAt: new Date(),
          };
        },
      } as never,
      { get: () => SECRET } as never,
      { send: async () => {} } as never
    );

    const result = await auth.login({
      email: "user@example.com",
      password,
    });
    assert.equal(result.kind, "session");
    assert.equal(sessionCreated, true);
    if (result.kind === "session") {
      assert.equal(result.user.role, "user");
      assert.ok(result.rawToken);
    }
  });

  it("staff without MFA still get a password session (restriction is AuthGuard + REQUIRE_STAFF_MFA)", async () => {
    const { AuthService } = await import("./auth.service");
    const { hashPasswordLuciaScrypt } = await import("./lucia-scrypt");
    const password = "Owner-Pass-99";
    const luciaHash = await hashPasswordLuciaScrypt(password);

    const auth = new AuthService(
      {
        user: {
          findMany: async () => [
            {
              id: "11111111-1111-1111-1111-111111111111",
              email: "owner@example.com",
              emailNormalized: "owner@example.com",
              mustResetPassword: false,
              mfaEnabled: false,
              createdAt: new Date(),
              profile: {
                id: "p",
                role: "owner",
                banned: false,
                hasPaid: true,
              },
              authAccounts: [
                {
                  id: "22222222-2222-2222-2222-222222222222",
                  passwordHash: luciaHash,
                  passwordAlgo: "lucia_scrypt",
                },
              ],
            },
          ],
          update: async () => ({}),
        },
        authAccount: { update: async () => ({}) },
        authAuditEvent: { create: async () => ({}) },
      } as never,
      {
        createSession: async () => ({
          rawToken: "t",
          sessionId: "33333333-3333-3333-3333-333333333333",
          expiresAt: new Date(),
        }),
      } as never,
      { get: () => SECRET } as never,
      { send: async () => {} } as never
    );

    const result = await auth.login({
      email: "owner@example.com",
      password,
    });
    assert.equal(result.kind, "session");
    if (result.kind === "session") {
      assert.equal(result.user.role, "owner");
    }
  });
});

describe("mfa H4 hierarchy helpers", () => {
  it("owner may reset admin MFA; admin may not reset owner", async () => {
    const { assertCanDisableTarget } = await import(
      "../admin/admin-auth.helpers"
    );
    assert.doesNotThrow(() =>
      assertCanDisableTarget({
        actorUserId: "owner-1",
        actorRole: "owner",
        targetUserId: "admin-1",
        targetRole: "admin",
      })
    );
    assert.throws(() =>
      assertCanDisableTarget({
        actorUserId: "admin-1",
        actorRole: "admin",
        targetUserId: "owner-1",
        targetRole: "owner",
      })
    );
  });
});

describe("mfa replay step", () => {
  it("same step is detectable for callers", () => {
    const secret = generateTotpSecret();
    const totp = buildTotp(secret, "x@y.z");
    const now = new Date();
    const code = totp.generate({ timestamp: now });
    const first = verifyTotpCode(secret, code, { now });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const second = verifyTotpCode(secret, code, { now });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(first.step, second.step);
  });
});
