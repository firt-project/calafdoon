import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import {
  AUTH_FAILED_MESSAGE,
  hashToken,
  normalizeEmail,
  safeEqualHex,
  sha256Hex,
} from "./crypto-util";
import {
  classifyPasswordHash,
  hashPasswordLuciaScrypt,
  verifyPasswordLuciaScrypt,
} from "./lucia-scrypt";
import {
  hashPasswordPreferred,
  shouldRehashOnLogin,
  verifyPassword,
} from "./password";
import { AuthRateLimitGuard } from "./rate-limit.guard";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import {
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
} from "./session.service";

describe("email normalization", () => {
  it("lowercases and trims", () => {
    assert.equal(normalizeEmail("  Admin@Example.COM "), "admin@example.com");
  });
});

describe("Lucia Scrypt compatibility", () => {
  it("verifies a freshly hashed Lucia Scrypt password", async () => {
    const password = "Test-Passphrase-Æøå-123!";
    const hash = await hashPasswordLuciaScrypt(password);
    assert.equal(classifyPasswordHash(hash), "standard_salt_key");
    assert.equal(await verifyPasswordLuciaScrypt(password, hash), true);
    assert.equal(await verifyPasswordLuciaScrypt("wrong", hash), false);
  });

  it("rejects malformed hashes", async () => {
    assert.equal(classifyPasswordHash("not-a-hash"), "malformed");
    assert.equal(classifyPasswordHash("s2:legacy"), "legacy_s2");
    assert.equal(classifyPasswordHash(""), "missing");
    const result = await verifyPassword("x", "bad:hash", "lucia_scrypt");
    assert.equal(result.ok, false);
  });

  it("uses constant-time compare path (equal length buffers)", async () => {
    // timingSafeEqual is used internally; verify wrong password same length still false
    const hash = await hashPasswordLuciaScrypt("correct-horse-battery");
    assert.equal(
      await verifyPasswordLuciaScrypt("correct-horse-batterx", hash),
      false
    );
  });
});

describe("preferred Argon2id + rehash policy", () => {
  it("hashes and verifies with argon2id", async () => {
    const { hash, algo } = await hashPasswordPreferred("New-Strong-Pass-99");
    assert.equal(algo, "argon2id");
    assert.equal((await verifyPassword("New-Strong-Pass-99", hash, algo)).ok, true);
    assert.equal((await verifyPassword("nope", hash, algo)).ok, false);
  });

  it("flags lucia hashes for rehash-on-login", () => {
    assert.equal(shouldRehashOnLogin("lucia_scrypt"), true);
    assert.equal(shouldRehashOnLogin("argon2id"), false);
  });
});

describe("session policy constants", () => {
  it("idle 3h and absolute 7d", () => {
    assert.equal(SESSION_IDLE_MS, 3 * 60 * 60 * 1000);
    assert.equal(SESSION_ABSOLUTE_MS, 7 * 24 * 60 * 60 * 1000);
  });

  it("stores only token hashes", () => {
    const raw = "raw-session-token-value";
    const hashed = hashToken(raw);
    assert.notEqual(hashed, raw);
    assert.equal(hashed, sha256Hex(raw));
  });
});

describe("CSRF token compare", () => {
  it("safeEqualHex rejects mismatches", () => {
    assert.equal(safeEqualHex("abc", "abc"), true);
    assert.equal(safeEqualHex("abc", "abd"), false);
    assert.equal(safeEqualHex("ab", "abcd"), false);
  });
});

describe("rate limiting", () => {
  it("in-memory fallback trips after too many attempts for same email", () => {
    const guard = new AuthRateLimitGuard();
    const makeCtx = (email: string) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({
            path: "/auth/login",
            ip: "127.0.0.1",
            socket: { remoteAddress: "127.0.0.1" },
            body: { email },
          }),
        }),
      }) as never;

    let threw = false;
    try {
      for (let i = 0; i < 20; i++) {
        guard.canActivate(makeCtx("rate@example.com"));
      }
    } catch (e: unknown) {
      threw = true;
      assert.ok(e && typeof e === "object" && "status" in e);
    }
    assert.equal(threw, true);
  });

  it("Redis rate limiter fail-closed on auth when Redis down", async () => {
    const redis = {
      connect: async () => false,
      client: null,
      available: false,
    };
    const guard = new RateLimitGuard(redis as never);
    await assert.rejects(
      () =>
        guard.canActivate({
          switchToHttp: () => ({
            getRequest: () => ({
              path: "/auth/login",
              method: "POST",
              ip: "127.0.0.1",
              socket: { remoteAddress: "127.0.0.1" },
              body: { email: "a@b.co" },
            }),
          }),
        } as never),
      (err: unknown) =>
        err instanceof Error && /unavailable|Too many/i.test(err.message)
    );
  });

  it("Redis rate limiter degrade-open on discover when Redis down", async () => {
    const redis = {
      connect: async () => false,
      client: null,
      available: false,
    };
    const guard = new RateLimitGuard(redis as never);
    const ok = await guard.canActivate({
      switchToHttp: () => ({
        getRequest: () => ({
          path: "/matches/discover",
          method: "GET",
          ip: "127.0.0.1",
          socket: { remoteAddress: "127.0.0.1" },
          body: {},
          user: { id: "11111111-1111-1111-1111-111111111111" },
        }),
      }),
    } as never);
    assert.equal(ok, true);
  });
});

describe("auth failure message", () => {
  it("is generic", () => {
    assert.match(AUTH_FAILED_MESSAGE, /Invalid email or password/);
  });

  it("session and password prompts are distinct from login failure", async () => {
    const { SESSION_REQUIRED_MESSAGE, INCORRECT_PASSWORD_MESSAGE } = await import(
      "./crypto-util"
    );
    assert.match(SESSION_REQUIRED_MESSAGE, /sign in again/i);
    assert.match(INCORRECT_PASSWORD_MESSAGE, /Incorrect password/i);
    assert.notEqual(SESSION_REQUIRED_MESSAGE, AUTH_FAILED_MESSAGE);
    assert.notEqual(INCORRECT_PASSWORD_MESSAGE, AUTH_FAILED_MESSAGE);
  });
});

describe("AuthService behaviour (mocked prisma)", () => {
  /** Login now uses findMany; keep findFirst for register/check-email mocks. */
  function withFindMany(
    user: Record<string, unknown> | null | (() => Promise<unknown>)
  ) {
    const resolve = async () =>
      typeof user === "function" ? await user() : user;
    return {
      findFirst: async () => {
        const row = await resolve();
        return row;
      },
      findMany: async () => {
        const row = await resolve();
        if (!row) return [];
        return [{ createdAt: new Date("2024-01-01"), ...(row as object) }];
      },
      update: async () => ({}),
      findUnique: async () => null,
    };
  }

  it("login succeeds for valid lucia hash and does not create profiles", async () => {
    const { AuthService } = await import("./auth.service");
    const password = "Migrated-User-Pass-42";
    const luciaHash = await hashPasswordLuciaScrypt(password);

    let profileCreateCalls = 0;
    let rehashed = false;
    let sessionCreated = false;

    const userId = "11111111-1111-1111-1111-111111111111";
    const accountId = "22222222-2222-2222-2222-222222222222";

    const prisma = {
      user: {
        findFirst: async () => ({
          id: userId,
          email: "user@example.com",
          emailNormalized: "user@example.com",
          mustResetPassword: false,
          profile: {
            id: "p1",
            role: "user",
            banned: false,
            hasPaid: true,
          },
          authAccounts: [
            {
              id: accountId,
              passwordHash: luciaHash,
              passwordAlgo: "lucia_scrypt",
            },
          ],
        }),
        findUnique: async () => null,
        update: async () => ({}),
      },
      authAccount: {
        update: async ({ data }: { data: { passwordAlgo: string } }) => {
          rehashed = data.passwordAlgo === "argon2id";
          return {};
        },
        updateMany: async () => ({ count: 1 }),
        findFirst: async () => null,
      },
      authAuditEvent: { create: async () => ({}) },
      passwordResetToken: {
        create: async () => ({}),
        findUnique: async () => null,
        update: async () => ({}),
      },
      session: {
        create: async () => {
          sessionCreated = true;
          return {
            id: "33333333-3333-3333-3333-333333333333",
          };
        },
        update: async () => ({}),
        updateMany: async () => ({ count: 1 }),
        findUnique: async () => null,
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
      profile: {
        create: async () => {
          profileCreateCalls += 1;
          return {};
        },
      },
    };

    const sessions = {
      createSession: async () => {
        sessionCreated = true;
        return {
          rawToken: "tok",
          sessionId: "33333333-3333-3333-3333-333333333333",
          expiresAt: new Date(Date.now() + 1000),
        };
      },
      revokeSession: async () => {},
      revokeAllForUser: async () => {},
      findValidSession: async () => null,
      touchSession: async () => new Date(),
      hashIp: () => null,
      hashUserAgent: () => null,
    };

    const config = {
      get: (k: string) =>
        k === "SESSION_SECRET" ? "test-session-secret-32chars-min!!" : undefined,
    };

    const mail = { send: async () => {}, sent: [] };

    const auth = new AuthService(
      prisma as never,
      sessions as never,
      config as never,
      mail as never
    );

    const result = await auth.login({
      email: "User@Example.com",
      password,
      ip: "127.0.0.1",
    });

    assert.equal(result.user.email, "user@example.com");
    assert.equal(result.user.hasProfile, true);
    assert.equal(result.user.role, "user");
    assert.equal(sessionCreated, true);
    assert.equal(rehashed, true);
    assert.equal(profileCreateCalls, 0);
  });

  it("rejects wrong password with generic error", async () => {
    const { AuthService } = await import("./auth.service");
    const luciaHash = await hashPasswordLuciaScrypt("right-password");
    const prisma = {
      user: {
        findFirst: async () => ({
          id: "11111111-1111-1111-1111-111111111111",
          email: "user@example.com",
          emailNormalized: "user@example.com",
          mustResetPassword: false,
          profile: { id: "p1", role: "user", banned: false, hasPaid: false },
          authAccounts: [
            {
              id: "22222222-2222-2222-2222-222222222222",
              passwordHash: luciaHash,
              passwordAlgo: "lucia_scrypt",
            },
          ],
        }),
      },
      authAuditEvent: { create: async () => ({}) },
    };
    const auth = new AuthService(
      prisma as never,
      {
        createSession: async () => {
          throw new Error("should not create session");
        },
      } as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );

    await assert.rejects(
      () =>
        auth.login({
          email: "user@example.com",
          password: "wrong-password",
        }),
      (err: unknown) =>
        err instanceof Error && err.message.includes(AUTH_FAILED_MESSAGE)
    );
  });

  it("rejects unknown email with same generic error", async () => {
    const { AuthService } = await import("./auth.service");
    const auth = new AuthService(
      {
        user: withFindMany(null),
        authAuditEvent: { create: async () => ({}) },
      } as never,
      {} as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );
    await assert.rejects(
      () => auth.login({ email: "nobody@example.com", password: "x" }),
      (err: unknown) =>
        err instanceof Error && err.message.includes(AUTH_FAILED_MESSAGE)
    );
  });

  it("rejects banned user", async () => {
    const { AuthService } = await import("./auth.service");
    const luciaHash = await hashPasswordLuciaScrypt("pass");
    const auth = new AuthService(
      {
        user: {
          findFirst: async () => ({
            id: "11111111-1111-1111-1111-111111111111",
            email: "b@example.com",
            emailNormalized: "b@example.com",
            mustResetPassword: false,
            profile: { id: "p", role: "user", banned: true, hasPaid: false },
            authAccounts: [
              {
                id: "22222222-2222-2222-2222-222222222222",
                passwordHash: luciaHash,
                passwordAlgo: "lucia_scrypt",
              },
            ],
          }),
        },
        authAuditEvent: { create: async () => ({}) },
      } as never,
      {} as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );
    await assert.rejects(() =>
      auth.login({ email: "b@example.com", password: "pass" })
    );
  });

  it("allows user without profile", async () => {
    const { AuthService } = await import("./auth.service");
    const password = "No-Profile-Pass";
    const luciaHash = await hashPasswordLuciaScrypt(password);
    const auth = new AuthService(
      {
        user: {
          findFirst: async () => ({
            id: "11111111-1111-1111-1111-111111111111",
            email: "np@example.com",
            emailNormalized: "np@example.com",
            mustResetPassword: false,
            profile: null,
            authAccounts: [
              {
                id: "22222222-2222-2222-2222-222222222222",
                passwordHash: luciaHash,
                passwordAlgo: "lucia_scrypt",
              },
            ],
          }),
          update: async () => ({}),
        },
        authAccount: {
          update: async () => ({}),
        },
        authAuditEvent: { create: async () => ({}) },
      } as never,
      {
        createSession: async () => ({
          rawToken: "t",
          sessionId: "33333333-3333-3333-3333-333333333333",
          expiresAt: new Date(),
        }),
      } as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );
    const result = await auth.login({
      email: "np@example.com",
      password,
    });
    assert.equal(result.kind, "session");
    if (result.kind === "session") {
      assert.equal(result.user.hasProfile, false);
      assert.equal(result.user.role, "user");
    }
  });

  it("preserves admin and owner roles", async () => {
    const { AuthService } = await import("./auth.service");
    const password = "Staff-Pass-99";
    const luciaHash = await hashPasswordLuciaScrypt(password);

    async function loginAs(role: "admin" | "owner") {
      const auth = new AuthService(
        {
          user: {
            findFirst: async () => ({
              id: "11111111-1111-1111-1111-111111111111",
              email: `${role}@example.com`,
              emailNormalized: `${role}@example.com`,
              mustResetPassword: false,
              mfaEnabled: false,
              profile: { id: "p", role, banned: false, hasPaid: true },
              authAccounts: [
                {
                  id: "22222222-2222-2222-2222-222222222222",
                  passwordHash: luciaHash,
                  passwordAlgo: "lucia_scrypt",
                },
              ],
            }),
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
        { get: () => "test-session-secret-32chars-min!!" } as never,
        { send: async () => {} } as never
      );
      return auth.login({ email: `${role}@example.com`, password });
    }

    const admin = await loginAs("admin");
    const owner = await loginAs("owner");
    assert.equal(admin.kind, "session");
    assert.equal(owner.kind, "session");
    if (admin.kind === "session") assert.equal(admin.user.role, "admin");
    if (owner.kind === "session") assert.equal(owner.user.role, "owner");
  });

  it("forgot-password returns identical generic response for missing and known emails (M2)", async () => {
    const { AuthService } = await import("./auth.service");
    const { RESET_GENERIC_MESSAGE } = await import("./crypto-util");
    const mailMissing = { send: async () => {}, calls: 0 };
    const mailPresent = {
      send: async () => {
        mailPresent.calls += 1;
      },
      calls: 0,
    };
    let tokenCreates = 0;
    const audits: Array<{ action: string; metadata?: unknown; userId?: unknown }> =
      [];
    const authMissing = new AuthService(
      {
        user: withFindMany(null),
        authAccount: { findFirst: async () => null },
        authAuditEvent: {
          create: async (args: { data: (typeof audits)[number] }) => {
            audits.push(args.data);
            return {};
          },
        },
        passwordResetToken: {
          create: async () => {
            tokenCreates += 1;
            return {};
          },
        },
      } as never,
      {} as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      mailMissing as never
    );
    const authPresent = new AuthService(
      {
        user: withFindMany({
          id: "11111111-1111-1111-1111-111111111111",
          email: "a@example.com",
          emailNormalized: "a@example.com",
          profile: null,
          authAccounts: [],
        }),
        passwordResetToken: {
          create: async () => {
            tokenCreates += 1;
            return {};
          },
        },
        authAuditEvent: {
          create: async (args: { data: (typeof audits)[number] }) => {
            audits.push(args.data);
            return {};
          },
        },
      } as never,
      {} as never,
      {
        get: (k: string) =>
          k === "APP_URL"
            ? "http://127.0.0.1:3001"
            : "test-session-secret-32chars-min!!",
      } as never,
      mailPresent as never
    );
    const a = await authMissing.forgotPassword("missing@example.com");
    const b = await authPresent.forgotPassword("a@example.com");
    assert.deepEqual(a, b);
    assert.equal(a.message, RESET_GENERIC_MESSAGE);
    assert.equal(mailPresent.calls, 1);
    assert.equal(tokenCreates, 1); // only known email stores a token
    for (const ev of audits.filter((e) => e.action === "password_reset_request")) {
      assert.equal(ev.userId ?? null, null);
      assert.deepEqual(ev.metadata, { requested: true });
    }
  });

  it("reset token rejects reuse and expiry", async () => {
    const { AuthService } = await import("./auth.service");
    const token = "reset-token-value-abcdefghijklmnop";
    const tokenHash = hashToken(token);
    const userId = "11111111-1111-1111-1111-111111111111";

    const usedAuth = new AuthService(
      {
        passwordResetToken: {
          findUnique: async () => ({
            id: "t1",
            userId,
            tokenHash,
            usedAt: new Date(),
            expiresAt: new Date(Date.now() + 60_000),
          }),
        },
        authAuditEvent: { create: async () => ({}) },
      } as never,
      {} as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );
    await assert.rejects(() =>
      usedAuth.resetPassword({ token, newPassword: "NewPass1234" })
    );

    const expiredAuth = new AuthService(
      {
        passwordResetToken: {
          findUnique: async () => ({
            id: "t1",
            userId,
            tokenHash,
            usedAt: null,
            expiresAt: new Date(Date.now() - 1000),
          }),
        },
        authAuditEvent: { create: async () => ({}) },
      } as never,
      {} as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );
    await assert.rejects(() =>
      expiredAuth.resetPassword({ token, newPassword: "NewPass1234" })
    );
  });

  it("successful reset revokes sessions and updates hash", async () => {
    const { AuthService } = await import("./auth.service");
    const token = "fresh-reset-token-abcdefghijklmnop";
    const tokenHash = hashToken(token);
    const userId = "11111111-1111-1111-1111-111111111111";
    let revoked = false;
    let algo: string | null = null;

    const prisma: Record<string, unknown> = {
      passwordResetToken: {
        findUnique: async () => ({
          id: "t1",
          userId,
          tokenHash,
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        update: async () => ({}),
      },
      authAccount: {
        updateMany: async ({ data }: { data: { passwordAlgo: string } }) => {
          algo = data.passwordAlgo;
          return { count: 1 };
        },
      },
      user: { update: async () => ({}) },
      session: {
        updateMany: async () => {
          revoked = true;
          return { count: 2 };
        },
      },
      authAuditEvent: { create: async () => ({}) },
      $transaction: async (fn: (tx: Record<string, unknown>) => Promise<unknown>) =>
        fn(prisma),
    };

    const auth = new AuthService(
      prisma as never,
      {} as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );
    const result = await auth.resetPassword({
      token,
      newPassword: "Brand-New-Pass-55",
    });
    assert.equal(result.message, "Password updated");
    assert.equal(revoked, true);
    assert.equal(algo, "argon2id");
  });

  it("logout and logout-all revoke sessions", async () => {
    const { AuthService } = await import("./auth.service");
    let revokedOne = false;
    let revokedAll = false;
    const sessions = {
      revokeSession: async () => {
        revokedOne = true;
      },
      revokeAllForUser: async () => {
        revokedAll = true;
      },
    };
    const auth = new AuthService(
      { authAuditEvent: { create: async () => ({}) } } as never,
      sessions as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );
    await auth.logout("sid", "11111111-1111-1111-1111-111111111111");
    await auth.logoutAll("11111111-1111-1111-1111-111111111111");
    assert.equal(revokedOne, true);
    assert.equal(revokedAll, true);
  });

  it("change-password updates to argon2id, clears mustResetPassword, and revokes sessions", async () => {
    const { AuthService } = await import("./auth.service");
    const current = "Current-Pass-11";
    const luciaHash = await hashPasswordLuciaScrypt(current);
    let algo: string | null = null;
    let clearedReset = false;
    let revoked = false;
    const auth = new AuthService(
      {
        authAccount: {
          findFirst: async () => ({
            id: "22222222-2222-2222-2222-222222222222",
            passwordHash: luciaHash,
            passwordAlgo: "lucia_scrypt",
          }),
        },
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            authAccount: {
              update: async ({
                data,
              }: {
                data: { passwordAlgo: string };
              }) => {
                algo = data.passwordAlgo;
                return {};
              },
            },
            user: {
              update: async ({
                data,
              }: {
                data: { mustResetPassword: boolean };
              }) => {
                if (data.mustResetPassword === false) clearedReset = true;
                return {};
              },
            },
            session: {
              updateMany: async () => {
                revoked = true;
                return { count: 1 };
              },
            },
          };
          return fn(tx);
        },
        authAuditEvent: { create: async () => ({}) },
      } as never,
      {} as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );
    const result = await auth.changePassword({
      userId: "11111111-1111-1111-1111-111111111111",
      currentPassword: current,
      newPassword: "Changed-Pass-22",
    });
    assert.equal(result.message, "Password changed");
    assert.equal(algo, "argon2id");
    assert.equal(clearedReset, true);
    assert.equal(revoked, true);
  });

  it("failed change-password does not clear mustResetPassword", async () => {
    const { AuthService } = await import("./auth.service");
    let clearedReset = false;
    const auth = new AuthService(
      {
        authAccount: {
          findFirst: async () => ({
            id: "22222222-2222-2222-2222-222222222222",
            passwordHash: await hashPasswordLuciaScrypt("right-pass"),
            passwordAlgo: "lucia_scrypt",
          }),
        },
        $transaction: async () => {
          clearedReset = true;
        },
        authAuditEvent: { create: async () => ({}) },
      } as never,
      {} as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );
    await assert.rejects(
      () =>
        auth.changePassword({
          userId: "11111111-1111-1111-1111-111111111111",
          currentPassword: "wrong-pass",
          newPassword: "Changed-Pass-22",
        }),
      UnauthorizedException
    );
    assert.equal(clearedReset, false);
  });

  it("checkEmailRegistered returns available when email free", async () => {
    const { AuthService } = await import("./auth.service");
    const auth = new AuthService(
      {
        user: withFindMany(null),
        authAccount: { findFirst: async () => null },
      } as never,
      {} as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );
    const result = await auth.checkEmailRegistered("  Free@Example.COM ");
    assert.equal(result.available, true);
  });

  it("checkEmailRegistered returns unavailable when user or password account exists", async () => {
    const { AuthService } = await import("./auth.service");
    const takenByUser = new AuthService(
      {
        user: { findFirst: async () => ({ id: "u1" }) },
        authAccount: { findFirst: async () => null },
      } as never,
      {} as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );
    assert.equal(
      (await takenByUser.checkEmailRegistered("taken@example.com")).available,
      false
    );

    const takenByAccount = new AuthService(
      {
        user: withFindMany(null),
        authAccount: { findFirst: async () => ({ id: "a1" }) },
      } as never,
      {} as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );
    assert.equal(
      (await takenByAccount.checkEmailRegistered("acct@example.com")).available,
      false
    );
  });

  it("register creates user/profile/preferences, session, and does not grant hasPaid", async () => {
    const { AuthService } = await import("./auth.service");
    const userId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    let createdUser = false;
    let createdAccount = false;
    let createdProfile = false;
    let createdPref = false;
    let hasPaid = true;
    let registrationComplete: boolean | null = true;
    const auditActions: string[] = [];

    const prisma = {
      user: {
        findFirst: async () => null,
        findUnique: async () => ({
          id: userId,
          email: "new@example.com",
          emailNormalized: "new@example.com",
          mustResetPassword: false,
          emailVerificationTime: null,
          profile: { role: "user", banned: false, hasPaid: false },
        }),
        create: async ({ data }: { data: { email: string; gender: string } }) => {
          createdUser = true;
          assert.equal(data.email, "new@example.com");
          assert.equal(data.gender, "male");
          return { id: userId, ...data };
        },
      },
      authAccount: {
        findFirst: async () => null,
        create: async () => {
          createdAccount = true;
          return {};
        },
      },
      profile: {
        create: async ({
          data,
        }: {
          data: { hasPaid: boolean; registrationComplete: boolean };
        }) => {
          createdProfile = true;
          hasPaid = data.hasPaid;
          registrationComplete = data.registrationComplete;
          return {};
        },
      },
      preference: {
        create: async ({
          data,
        }: {
          data: { preferredGender: string };
        }) => {
          createdPref = true;
          assert.equal(data.preferredGender, "female");
          return {};
        },
      },
      emailVerificationToken: {
        updateMany: async () => ({ count: 0 }),
        create: async () => ({ id: "evt1" }),
      },
      authAuditEvent: {
        create: async ({ data }: { data: { action: string } }) => {
          auditActions.push(data.action);
          return {};
        },
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    };

    const auth = new AuthService(
      prisma as never,
      {
        createSession: async () => ({
          rawToken: "reg-tok",
          sessionId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          expiresAt: new Date(Date.now() + 1000),
        }),
      } as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );

    const result = await auth.register({
      email: "New@Example.com",
      password: "Register-Pass-99",
      ip: "127.0.0.1",
    });

    assert.equal(createdUser, true);
    assert.equal(createdAccount, true);
    assert.equal(createdProfile, true);
    assert.equal(createdPref, true);
    assert.equal(hasPaid, false);
    assert.equal(registrationComplete, false);
    assert.equal(result.user.hasPaid, false);
    assert.equal(result.user.hasProfile, true);
    assert.equal(result.user.emailVerified, false);
    assert.equal(result.rawToken, "reg-tok");
    assert.ok(auditActions.includes("register_success"));
    assert.ok(!auditActions.includes("register_failed"));
  });

  it("register rejects duplicate email with generic message", async () => {
    const { AuthService } = await import("./auth.service");
    const { REGISTER_FAILED_MESSAGE } = await import("./crypto-util");
    let audited = false;
    const auth = new AuthService(
      {
        user: { findFirst: async () => ({ id: "u1" }) },
        authAccount: { findFirst: async () => null },
        authAuditEvent: {
          create: async ({ data }: { data: { action: string } }) => {
            if (data.action === "register_failed") audited = true;
            return {};
          },
        },
      } as never,
      {
        createSession: async () => {
          throw new Error("should not create session");
        },
      } as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );

    await assert.rejects(
      () =>
        auth.register({
          email: "dup@example.com",
          password: "Register-Pass-99",
        }),
      (err: unknown) =>
        err instanceof Error && err.message.includes(REGISTER_FAILED_MESSAGE)
    );
    assert.equal(audited, true);
  });

  it("register rejects short passwords", async () => {
    const { AuthService } = await import("./auth.service");
    const auth = new AuthService(
      {
        user: withFindMany(null),
        authAccount: { findFirst: async () => null },
        authAuditEvent: { create: async () => ({}) },
      } as never,
      {} as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );
    await assert.rejects(
      () => auth.register({ email: "short@example.com", password: "short" }),
      (err: unknown) =>
        err instanceof Error && /at least 8 characters/i.test(err.message)
    );
  });
});

describe("SessionService expiry policy", () => {
  it("rejects idle-expired and absolute-expired sessions", async () => {
    const { SessionService } = await import("./session.service");
    const raw = "session-raw-token-for-expiry-tests-xx";
    const tokenHash = hashToken(raw);

    const idleExpired = {
      id: "s1",
      tokenHash,
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      absoluteExpiresAt: new Date(Date.now() + 86_400_000),
      user: { id: "u1", profile: null, authAccounts: [] },
    };
    const absoluteExpired = {
      ...idleExpired,
      expiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() - 1000),
    };
    const valid = {
      ...idleExpired,
      expiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 86_400_000),
    };

    let row: typeof idleExpired | null = idleExpired;
    const prisma = {
      session: {
        findUnique: async () => row,
        create: async () => ({ id: "s1" }),
        update: async () => ({}),
        updateMany: async () => ({ count: 1 }),
      },
    };
    const sessions = new SessionService(
      prisma as never,
      { get: () => "test-session-secret-32chars-min!!" } as never
    );

    assert.equal(await sessions.findValidSession(raw), null);
    row = absoluteExpired;
    assert.equal(await sessions.findValidSession(raw), null);
    row = valid;
    assert.ok(await sessions.findValidSession(raw));
  });
});
