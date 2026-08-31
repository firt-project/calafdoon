import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { performance } from "node:perf_hooks";
import { AuthService } from "./auth.service";
import { RESET_GENERIC_MESSAGE } from "./crypto-util";

type AuditRow = {
  action: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
};

type UserRow = {
  id: string;
  email: string;
  emailNormalized: string;
  createdAt: Date;
  emailVerificationTime?: Date | null;
  profile: {
    id: string;
    banned: boolean;
    role: string;
    hasPaid: boolean;
    questionnaireComplete: boolean;
    registrationComplete: boolean;
  } | null;
  authAccounts: unknown[];
};

function baseUser(over: Partial<UserRow> = {}): UserRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    email: "a@example.com",
    emailNormalized: "a@example.com",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    emailVerificationTime: new Date("2026-01-01T00:00:00.000Z"),
    profile: {
      id: "p1",
      banned: false,
      role: "user",
      hasPaid: true,
      questionnaireComplete: true,
      registrationComplete: true,
    },
    authAccounts: [{ id: "acc1", provider: "password" }],
    ...over,
  };
}

function makeAuth(opts: {
  user: UserRow | null;
  mailFail?: boolean;
  onTokenCreate?: () => void;
  onMail?: () => void;
  audits?: AuditRow[];
}) {
  const audits = opts.audits ?? [];
  let tokenCreates = 0;
  let mailCalls = 0;

  const prisma = {
    user: {
      findMany: async () => (opts.user ? [opts.user] : []),
      findUnique: async () => opts.user,
    },
    authAccount: {
      findFirst: async () => null,
    },
    passwordResetToken: {
      create: async () => {
        tokenCreates += 1;
        opts.onTokenCreate?.();
        return { id: "tok1" };
      },
    },
    authAuditEvent: {
      create: async ({ data }: { data: AuditRow }) => {
        audits.push(data);
        return {};
      },
    },
  };

  const mail = {
    send: async () => {
      mailCalls += 1;
      opts.onMail?.();
      if (opts.mailFail) throw new Error("smtp down");
    },
  };

  const auth = new AuthService(
    prisma as never,
    {} as never,
    {
      get: (k: string) =>
        k === "APP_URL"
          ? "http://127.0.0.1:3001"
          : "test-session-secret-32chars-min!!",
    } as never,
    mail as never
  );

  return {
    auth,
    audits,
    tokenCreates: () => tokenCreates,
    mailCalls: () => mailCalls,
  };
}

describe("forgot-password anti-enumeration (M2)", () => {
  it("existing email: generic response + token + mail", async () => {
    const ctx = makeAuth({ user: baseUser() });
    const res = await ctx.auth.forgotPassword("a@example.com");
    assert.deepEqual(res, { message: RESET_GENERIC_MESSAGE });
    assert.equal(ctx.tokenCreates(), 1);
    assert.equal(ctx.mailCalls(), 1);
  });

  it("unknown email: same response, no token, no mail", async () => {
    const ctx = makeAuth({ user: null });
    const res = await ctx.auth.forgotPassword("missing@example.com");
    assert.deepEqual(res, { message: RESET_GENERIC_MESSAGE });
    assert.equal(ctx.tokenCreates(), 0);
    assert.equal(ctx.mailCalls(), 0);
  });

  it("disabled (banned) account: same response, still issues reset", async () => {
    const ctx = makeAuth({
      user: baseUser({
        profile: {
          id: "p1",
          banned: true,
          role: "user",
          hasPaid: true,
          questionnaireComplete: true,
          registrationComplete: true,
        },
      }),
    });
    const res = await ctx.auth.forgotPassword("a@example.com");
    assert.deepEqual(res, { message: RESET_GENERIC_MESSAGE });
    assert.equal(ctx.tokenCreates(), 1);
    assert.equal(ctx.mailCalls(), 1);
  });

  it("verified and unverified accounts: identical responses", async () => {
    const verified = makeAuth({
      user: baseUser({
        emailVerificationTime: new Date("2026-01-01T00:00:00.000Z"),
      }),
    });
    const unverified = makeAuth({
      user: baseUser({
        id: "22222222-2222-2222-2222-222222222222",
        email: "b@example.com",
        emailNormalized: "b@example.com",
        emailVerificationTime: null,
      }),
    });
    const a = await verified.auth.forgotPassword("a@example.com");
    const b = await unverified.auth.forgotPassword("b@example.com");
    assert.deepEqual(a, b);
    assert.equal(a.message, RESET_GENERIC_MESSAGE);
  });

  it("repeated requests: same response each time", async () => {
    const ctx = makeAuth({ user: baseUser() });
    const first = await ctx.auth.forgotPassword("a@example.com");
    const second = await ctx.auth.forgotPassword("a@example.com");
    assert.deepEqual(first, second);
    assert.equal(ctx.tokenCreates(), 2);
  });

  it("response equality and status-equivalent body for missing vs present", async () => {
    const missing = makeAuth({ user: null });
    const present = makeAuth({ user: baseUser() });
    const a = await missing.auth.forgotPassword("nope@example.com");
    const b = await present.auth.forgotPassword("a@example.com");
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    assert.ok(!("found" in a));
    assert.ok(!("sent" in a));
  });

  it("mail failure does not change client response (no 503 enumeration)", async () => {
    const ctx = makeAuth({ user: baseUser(), mailFail: true });
    const res = await ctx.auth.forgotPassword("a@example.com");
    assert.deepEqual(res, { message: RESET_GENERIC_MESSAGE });
    assert.equal(ctx.tokenCreates(), 1);
    assert.ok(
      ctx.audits.some(
        (e) =>
          e.action === "password_reset_failure" &&
          (e.metadata as { reason?: string } | undefined)?.reason ===
            "mail_send_failed"
      )
    );
  });

  it("audit events do not record existence flags or userId", async () => {
    const audits: AuditRow[] = [];
    const missing = makeAuth({ user: null, audits });
    const present = makeAuth({ user: baseUser(), audits });
    await missing.auth.forgotPassword("nope@example.com");
    await present.auth.forgotPassword("a@example.com");
    const requests = audits.filter((e) => e.action === "password_reset_request");
    assert.equal(requests.length, 2);
    for (const ev of requests) {
      assert.equal(ev.userId, null);
      assert.deepEqual(ev.metadata, { requested: true });
      assert.ok(!("found" in (ev.metadata ?? {})));
    }
  });

  it("timing: missing vs present with instant mail stay within tolerance", async () => {
    const samples = 25;
    const missingMs: number[] = [];
    const presentMs: number[] = [];
    for (let i = 0; i < samples; i++) {
      const missing = makeAuth({ user: null });
      const t0 = performance.now();
      await missing.auth.forgotPassword("nope@example.com");
      missingMs.push(performance.now() - t0);

      const present = makeAuth({ user: baseUser() });
      const t1 = performance.now();
      await present.auth.forgotPassword("a@example.com");
      presentMs.push(performance.now() - t1);
    }
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const avgMissing = avg(missingMs);
    const avgPresent = avg(presentMs);
    const diff = Math.abs(avgPresent - avgMissing);
    // With mocked DB/mail, residual difference is crypto+extra awaits only.
    // Cap at 25ms average to catch accidental early-return regressions.
    assert.ok(
      diff < 25,
      `avg missing=${avgMissing.toFixed(3)}ms present=${avgPresent.toFixed(3)}ms diff=${diff.toFixed(3)}ms`
    );
  });
});
