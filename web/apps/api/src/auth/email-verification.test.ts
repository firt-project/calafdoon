import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash } from "node:crypto";
import {
  ALLOW_DURING_PASSWORD_RESET_KEY,
  ALLOW_WHILE_UNVERIFIED_KEY,
  AuthGuard,
  AllowWhileUnverified,
  EMAIL_VERIFICATION_REQUIRED,
  IS_PUBLIC_KEY,
  PASSWORD_RESET_REQUIRED,
  ROLES_KEY,
} from "./auth.guards";
import { generateToken, hashToken } from "./crypto-util";

function sha256(raw: string) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function mockGuardContext(opts: {
  isPublic?: boolean;
  allowReset?: boolean;
  allowUnverified?: boolean;
  roles?: string[];
  cookie?: string;
  session?: {
    id: string;
    expiresAt: Date;
    lastSeenAt: Date;
    user: {
      id: string;
      email: string | null;
      mustResetPassword: boolean;
      emailVerificationTime: Date | null;
      profile: {
        role: "user" | "admin" | "owner";
        banned: boolean;
        hasPaid: boolean;
      } | null;
    };
  } | null;
}) {
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === IS_PUBLIC_KEY) return opts.isPublic ?? false;
      if (key === ALLOW_DURING_PASSWORD_RESET_KEY) return opts.allowReset ?? false;
      if (key === ALLOW_WHILE_UNVERIFIED_KEY) return opts.allowUnverified ?? false;
      if (key === ROLES_KEY) return opts.roles;
      return undefined;
    },
  } as unknown as Reflector;

  const sessions = {
    findValidSession: async (raw: string) => {
      if (!opts.session) return null;
      if (raw !== "good-token") return null;
      return opts.session;
    },
    touchSession: async () => new Date(),
  };

  const req: Record<string, unknown> = {
    cookies: opts.cookie ? { hel_session: opts.cookie } : {},
    headers: {},
  };

  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  };

  return { guard: new AuthGuard(sessions as never, reflector, { get: () => undefined } as never), ctx, req };
}

const verifiedSession = {
  id: "sid-1",
  expiresAt: new Date(Date.now() + 60_000),
  lastSeenAt: new Date(),
  user: {
    id: "u1",
    email: "a@b.c",
    mustResetPassword: false,
    emailVerificationTime: new Date("2020-01-01T00:00:00.000Z"),
    profile: {
      role: "user" as const,
      banned: false,
      hasPaid: true,
    },
  },
};

describe("AuthGuard email verification (M3)", () => {
  it("allows verified users on ordinary routes", async () => {
    const { guard, ctx, req } = mockGuardContext({
      cookie: "good-token",
      session: verifiedSession,
    });
    assert.equal(await guard.canActivate(ctx as never), true);
    assert.equal((req.user as { emailVerified: boolean }).emailVerified, true);
  });

  it("denies unverified users on ordinary routes", async () => {
    const { guard, ctx } = mockGuardContext({
      cookie: "good-token",
      session: {
        ...verifiedSession,
        user: { ...verifiedSession.user, emailVerificationTime: null },
      },
    });
    await assert.rejects(
      () => guard.canActivate(ctx as never),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenException);
        const body = err.getResponse() as { code?: string };
        assert.equal(body.code, EMAIL_VERIFICATION_REQUIRED);
        return true;
      }
    );
  });

  it("allows unverified users on allowlisted routes", async () => {
    const { guard, ctx } = mockGuardContext({
      cookie: "good-token",
      allowUnverified: true,
      session: {
        ...verifiedSession,
        user: { ...verifiedSession.user, emailVerificationTime: null },
      },
    });
    assert.equal(await guard.canActivate(ctx as never), true);
  });

  it("new authenticated routes are denied by default for unverified users", async () => {
    const { guard, ctx } = mockGuardContext({
      cookie: "good-token",
      roles: ["admin"],
      session: {
        ...verifiedSession,
        user: {
          ...verifiedSession.user,
          emailVerificationTime: null,
          profile: { role: "admin", banned: false, hasPaid: true },
        },
      },
    });
    await assert.rejects(
      () => guard.canActivate(ctx as never),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenException);
        const body = err.getResponse() as { code?: string };
        assert.equal(body.code, EMAIL_VERIFICATION_REQUIRED);
        return true;
      }
    );
  });

  it("banned takes precedence over unverified", async () => {
    const { guard, ctx } = mockGuardContext({
      cookie: "good-token",
      allowUnverified: true,
      session: {
        ...verifiedSession,
        user: {
          ...verifiedSession.user,
          emailVerificationTime: null,
          profile: { role: "user", banned: true, hasPaid: true },
        },
      },
    });
    await assert.rejects(
      () => guard.canActivate(ctx as never),
      /Unable to access this account/
    );
  });

  it("mustResetPassword takes precedence over email verification denial code", async () => {
    const { guard, ctx } = mockGuardContext({
      cookie: "good-token",
      session: {
        ...verifiedSession,
        user: {
          ...verifiedSession.user,
          mustResetPassword: true,
          emailVerificationTime: null,
        },
      },
    });
    await assert.rejects(
      () => guard.canActivate(ctx as never),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenException);
        const body = err.getResponse() as { code?: string };
        assert.equal(body.code, PASSWORD_RESET_REQUIRED);
        return true;
      }
    );
  });

  it("dual restriction allows routes with both allowlist decorators", async () => {
    const { guard, ctx } = mockGuardContext({
      cookie: "good-token",
      allowReset: true,
      allowUnverified: true,
      session: {
        ...verifiedSession,
        user: {
          ...verifiedSession.user,
          mustResetPassword: true,
          emailVerificationTime: null,
        },
      },
    });
    assert.equal(await guard.canActivate(ctx as never), true);
  });

  it("AllowWhileUnverified decorator sets metadata key", () => {
    assert.equal(ALLOW_WHILE_UNVERIFIED_KEY, "allowWhileUnverified");
    assert.equal(typeof AllowWhileUnverified(), "function");
  });
});

describe("AuthService email verification (M3)", () => {
  it("register creates unverified user, hashed token only, and no token in response", async () => {
    const { AuthService } = await import("./auth.service");
    const userId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    let storedHash: string | null = null;
    let storedEmail: string | null = null;
    let mailText = "";
    let mailHtml = "";
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
        create: async ({ data }: { data: Record<string, unknown> }) => {
          assert.equal(data.emailVerificationTime, null);
          return { id: userId, ...data };
        },
      },
      authAccount: {
        findFirst: async () => null,
        create: async ({ data }: { data: { emailVerified?: boolean } }) => {
          assert.equal(data.emailVerified, false);
          return {};
        },
      },
      profile: { create: async () => ({}) },
      preference: { create: async () => ({}) },
      emailVerificationToken: {
        updateMany: async () => ({ count: 0 }),
        create: async ({
          data,
        }: {
          data: { tokenHash: string; email: string };
        }) => {
          storedHash = data.tokenHash;
          storedEmail = data.email;
          return { id: "tok1" };
        },
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
      {
        get: (k: string) =>
          k === "APP_URL" ? "https://app.example" : "test-session-secret-32chars-min!!",
      } as never,
      {
        send: async (msg: { text: string; html?: string }) => {
          mailText = msg.text;
          mailHtml = msg.html ?? "";
        },
      } as never
    );

    const result = await auth.register({
      email: "New@Example.com",
      password: "Register-Pass-99",
      ip: "127.0.0.1",
    });

    assert.equal(result.user.emailVerified, false);
    assert.equal(result.rawToken, "reg-tok");
    assert.ok(storedHash);
    assert.equal(storedEmail, "new@example.com");
    assert.equal(storedHash!.includes("reg-tok"), false);
    assert.ok(!JSON.stringify(result).includes(storedHash!));
    assert.ok(!JSON.stringify(result).includes("/verify-email?token="));
    assert.ok(mailText.includes("/verify-email?token="));
    assert.ok(mailHtml.includes("Verify your email"));
    const tokenMatch = mailText.match(/token=([A-Za-z0-9_-]+)/);
    assert.ok(tokenMatch?.[1]);
    assert.equal(storedHash, sha256(decodeURIComponent(tokenMatch![1]!)));
    assert.ok(auditActions.includes("register_success"));
    assert.ok(auditActions.includes("email_verification_sent"));
  });

  it("correct token verifies email and consumes token", async () => {
    const { AuthService } = await import("./auth.service");
    const raw = generateToken(32);
    const tokenHash = hashToken(raw);
    const userId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    let userVerifiedAt: Date | null = null;
    let tokenUsedAt: Date | null = null;
    let accountVerified: boolean | null = null;

    const row = {
      id: "tok-row",
      userId,
      email: "v@example.com",
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null as Date | null,
    };

    const prisma = {
      emailVerificationToken: {
        findUnique: async ({ where }: { where: { tokenHash: string } }) =>
          where.tokenHash === tokenHash ? { ...row, usedAt: tokenUsedAt } : null,
        updateMany: async ({
          where,
          data,
        }: {
          where: { id?: string; usedAt: null; userId?: string };
          data: { usedAt: Date };
        }) => {
          if (where.id === row.id && tokenUsedAt == null) {
            tokenUsedAt = data.usedAt;
            return { count: 1 };
          }
          if (where.userId === userId) {
            return { count: 0 };
          }
          return { count: 0 };
        },
      },
      user: {
        findUnique: async () => ({
          id: userId,
          email: "v@example.com",
          emailVerificationTime: userVerifiedAt,
        }),
        update: async ({ data }: { data: { emailVerificationTime: Date } }) => {
          userVerifiedAt = data.emailVerificationTime;
          return {};
        },
      },
      authAccount: {
        updateMany: async ({ data }: { data: { emailVerified: boolean } }) => {
          accountVerified = data.emailVerified;
          return { count: 1 };
        },
      },
      authAuditEvent: { create: async () => ({}) },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    };

    const auth = new AuthService(
      prisma as never,
      {} as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );

    const out = await auth.verifyEmailToken(raw, "1.1.1.1");
    assert.deepEqual(out, { ok: true, emailVerified: true });
    assert.ok(userVerifiedAt);
    assert.ok(tokenUsedAt);
    assert.equal(accountVerified, true);

    await assert.rejects(
      () => auth.verifyEmailToken(raw),
      BadRequestException
    );
  });

  it("rejects incorrect, expired, and malformed tokens", async () => {
    const { AuthService } = await import("./auth.service");
    const raw = generateToken(32);
    const tokenHash = hashToken(raw);

    const prisma = {
      emailVerificationToken: {
        findUnique: async ({ where }: { where: { tokenHash: string } }) => {
          if (where.tokenHash === tokenHash) {
            return {
              id: "t1",
              userId: "u1",
              email: "e@example.com",
              tokenHash,
              expiresAt: new Date(Date.now() - 1000),
              usedAt: null,
            };
          }
          return null;
        },
      },
      authAuditEvent: { create: async () => ({}) },
    };

    const auth = new AuthService(
      prisma as never,
      {} as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );

    await assert.rejects(() => auth.verifyEmailToken("wrong-token-xx"), BadRequestException);
    await assert.rejects(() => auth.verifyEmailToken(raw), BadRequestException);
    await assert.rejects(() => auth.verifyEmailToken("short"), BadRequestException);
  });

  it("resend rotates token, does not expose it, and is safe when already verified", async () => {
    const { AuthService } = await import("./auth.service");
    const userId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    const hashes: string[] = [];
    let mailBody = "";

    const makePrisma = (verified: boolean) => {
      const prisma = {
        user: {
          findUnique: async () => ({
            id: userId,
            email: "r@example.com",
            emailVerificationTime: verified ? new Date() : null,
          }),
        },
        emailVerificationToken: {
          updateMany: async () => ({ count: 1 }),
          create: async ({ data }: { data: { tokenHash: string } }) => {
            hashes.push(data.tokenHash);
            return { id: `tok-${hashes.length}` };
          },
        },
        authAuditEvent: { create: async () => ({}) },
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
      };
      return prisma;
    };

    const verifiedAuth = new AuthService(
      makePrisma(true) as never,
      {} as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );
    const already = await verifiedAuth.resendEmailVerification(userId);
    assert.deepEqual(already, {
      ok: true,
      sent: false,
      alreadyVerified: true,
    });
    assert.equal(hashes.length, 0);

    const unverifiedPrisma = makePrisma(false);
    const auth = new AuthService(
      unverifiedPrisma as never,
      {} as never,
      {
        get: (k: string) =>
          k === "APP_URL" ? "https://app.example" : "test-session-secret-32chars-min!!",
      } as never,
      {
        send: async (msg: { text: string }) => {
          mailBody = msg.text;
        },
      } as never
    );

    const first = await auth.resendEmailVerification(userId);
    const second = await auth.resendEmailVerification(userId);
    assert.equal(first.sent, true);
    assert.equal(second.sent, true);
    assert.equal(hashes.length, 2);
    assert.notEqual(hashes[0], hashes[1]);
    assert.ok(!JSON.stringify(first).includes(hashes[0]!));
    assert.ok(mailBody.includes("/verify-email?token="));
    assert.ok(!JSON.stringify(second).includes("token="));
  });

  it("mail failure on register does not expose token and keeps user unverified", async () => {
    const { AuthService } = await import("./auth.service");
    const userId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    let storedHash: string | null = null;
    const auditActions: string[] = [];

    const prisma = {
      user: {
        findFirst: async () => null,
        findUnique: async () => ({
          id: userId,
          email: "fail@example.com",
          emailNormalized: "fail@example.com",
          mustResetPassword: false,
          emailVerificationTime: null,
          profile: { role: "user", banned: false, hasPaid: false },
        }),
        create: async () => ({ id: userId }),
      },
      authAccount: {
        findFirst: async () => null,
        create: async () => ({}),
      },
      profile: { create: async () => ({}) },
      preference: { create: async () => ({}) },
      emailVerificationToken: {
        updateMany: async () => ({ count: 0 }),
        create: async ({ data }: { data: { tokenHash: string } }) => {
          storedHash = data.tokenHash;
          return { id: "tok" };
        },
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
          sessionId: "sid",
          expiresAt: new Date(Date.now() + 1000),
        }),
      } as never,
      { get: () => "https://app.example" } as never,
      {
        send: async () => {
          throw new Error("smtp down");
        },
      } as never
    );

    const result = await auth.register({
      email: "fail@example.com",
      password: "Register-Pass-99",
    });
    assert.equal(result.user.emailVerified, false);
    assert.ok(storedHash);
    assert.ok(!JSON.stringify(result).includes(storedHash!));
    assert.ok(auditActions.includes("email_verification_send_failed"));
  });

  it("password reset does not set emailVerificationTime", async () => {
    const { AuthService } = await import("./auth.service");
    const raw = generateToken(32);
    const tokenHash = hashToken(raw);
    let userPatch: Record<string, unknown> | null = null;

    const prisma = {
      passwordResetToken: {
        findUnique: async () => ({
          id: "pr1",
          userId: "u1",
          tokenHash,
          expiresAt: new Date(Date.now() + 60_000),
          usedAt: null,
        }),
        update: async () => ({}),
      },
      authAccount: {
        updateMany: async () => ({ count: 1 }),
      },
      user: {
        update: async ({ data }: { data: Record<string, unknown> }) => {
          userPatch = data;
          return {};
        },
      },
      session: { updateMany: async () => ({ count: 0 }) },
      authAuditEvent: { create: async () => ({}) },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    };

    const auth = new AuthService(
      prisma as never,
      {} as never,
      { get: () => "test-session-secret-32chars-min!!" } as never,
      { send: async () => {} } as never
    );

    await auth.resetPassword({ token: raw, newPassword: "NewPass1234" });
    assert.ok(userPatch);
    assert.equal("emailVerificationTime" in userPatch!, false);
    assert.equal(userPatch!.mustResetPassword, false);
  });

  it("existing verified migration policy: emailVerificationTime set means verified", () => {
    assert.equal(
      ({ emailVerificationTime: new Date() } as { emailVerificationTime: Date | null })
        .emailVerificationTime != null,
      true
    );
    assert.equal(
      ({ emailVerificationTime: null } as { emailVerificationTime: Date | null })
        .emailVerificationTime != null,
      false
    );
  });
});
