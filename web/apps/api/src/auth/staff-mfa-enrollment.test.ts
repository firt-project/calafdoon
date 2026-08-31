import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  ALLOW_DURING_PASSWORD_RESET_KEY,
  ALLOW_WHILE_MFA_ENROLLMENT_KEY,
  ALLOW_WHILE_UNVERIFIED_KEY,
  AuthGuard,
  AllowWhileMfaEnrollment,
  EMAIL_VERIFICATION_REQUIRED,
  IS_PUBLIC_KEY,
  MFA_ENROLLMENT_REQUIRED,
  PASSWORD_RESET_REQUIRED,
  ROLES_KEY,
} from "./auth.guards";
import { CsrfGuard, CSRF_COOKIE, SESSION_COOKIE } from "./csrf";

function mockContext(opts: {
  isPublic?: boolean;
  allowReset?: boolean;
  allowUnverified?: boolean;
  allowMfaEnroll?: boolean;
  roles?: string[];
  cookie?: string;
  header?: string;
  requireStaffMfa?: boolean;
  session?: {
    id: string;
    expiresAt: Date;
    lastSeenAt: Date;
    user: {
      id: string;
      email: string | null;
      mustResetPassword: boolean;
      emailVerificationTime?: Date | null;
      mfaEnabled?: boolean;
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
      if (key === ALLOW_WHILE_MFA_ENROLLMENT_KEY)
        return opts.allowMfaEnroll ?? false;
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

  const config = {
    get: (k: string) =>
      k === "REQUIRE_STAFF_MFA"
        ? opts.requireStaffMfa
          ? "true"
          : "false"
        : undefined,
  };

  const req: Record<string, unknown> = {
    cookies: opts.cookie ? { hel_session: opts.cookie } : {},
    headers: opts.header ? { "x-session-token": opts.header } : {},
  };

  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  };

  return {
    guard: new AuthGuard(sessions as never, reflector, config as never),
    ctx,
    req,
  };
}

const verifiedMember = {
  id: "sid-1",
  expiresAt: new Date(Date.now() + 60_000),
  lastSeenAt: new Date(),
  user: {
    id: "u1",
    email: "member@example.com",
    mustResetPassword: false,
    emailVerificationTime: new Date("2020-01-01T00:00:00.000Z"),
    mfaEnabled: false,
    profile: {
      role: "user" as const,
      banned: false,
      hasPaid: true,
    },
  },
};

function staffSession(
  role: "admin" | "owner",
  patch: Partial<(typeof verifiedMember)["user"]> = {}
) {
  return {
    ...verifiedMember,
    user: {
      ...verifiedMember.user,
      email: `${role}@example.com`,
      mfaEnabled: false,
      profile: {
        role,
        banned: false,
        hasPaid: true,
      },
      ...patch,
      profile: {
        role,
        banned: false,
        hasPaid: true,
        ...(patch.profile ?? {}),
      },
    },
  };
}

describe("AuthGuard staff MFA enrollment (L4 mandatory)", () => {
  it("member login path unchanged when REQUIRE_STAFF_MFA is on", async () => {
    const { guard, ctx, req } = mockContext({
      cookie: "good-token",
      requireStaffMfa: true,
      session: verifiedMember,
    });
    assert.equal(await guard.canActivate(ctx as never), true);
    assert.equal(
      (req.user as { mfaEnrollmentRequired: boolean }).mfaEnrollmentRequired,
      false
    );
  });

  it("admin without MFA is restricted with MFA_ENROLLMENT_REQUIRED", async () => {
    const { guard, ctx, req } = mockContext({
      cookie: "good-token",
      requireStaffMfa: true,
      session: staffSession("admin"),
    });
    await assert.rejects(
      () => guard.canActivate(ctx as never),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenException);
        const body = err.getResponse() as { code?: string };
        assert.equal(body.code, MFA_ENROLLMENT_REQUIRED);
        return true;
      }
    );
    assert.equal(
      (req.user as { mfaEnrollmentRequired: boolean }).mfaEnrollmentRequired,
      true
    );
  });

  it("owner without MFA is restricted (no owner exemption)", async () => {
    const { guard, ctx } = mockContext({
      cookie: "good-token",
      requireStaffMfa: true,
      session: staffSession("owner"),
    });
    await assert.rejects(
      () => guard.canActivate(ctx as never),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenException);
        const body = err.getResponse() as { code?: string };
        assert.equal(body.code, MFA_ENROLLMENT_REQUIRED);
        return true;
      }
    );
  });

  it("unenrolled staff can access enrollment allowlist routes", async () => {
    const { guard, ctx } = mockContext({
      cookie: "good-token",
      requireStaffMfa: true,
      allowMfaEnroll: true,
      session: staffSession("admin"),
    });
    assert.equal(await guard.canActivate(ctx as never), true);
  });

  it("unenrolled staff cannot access admin routes (@Roles)", async () => {
    const { guard, ctx } = mockContext({
      cookie: "good-token",
      requireStaffMfa: true,
      allowMfaEnroll: false,
      roles: ["admin"],
      session: staffSession("admin"),
    });
    await assert.rejects(
      () => guard.canActivate(ctx as never),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenException);
        const body = err.getResponse() as { code?: string };
        assert.equal(body.code, MFA_ENROLLMENT_REQUIRED);
        return true;
      }
    );
  });

  it("flag off leaves unenrolled staff unrestricted", async () => {
    const { guard, ctx, req } = mockContext({
      cookie: "good-token",
      requireStaffMfa: false,
      roles: ["admin"],
      session: staffSession("admin"),
    });
    assert.equal(await guard.canActivate(ctx as never), true);
    assert.equal(
      (req.user as { mfaEnrollmentRequired: boolean }).mfaEnrollmentRequired,
      false
    );
  });

  it("enrolled staff are not enrollment-restricted", async () => {
    const { guard, ctx, req } = mockContext({
      cookie: "good-token",
      requireStaffMfa: true,
      roles: ["admin"],
      session: staffSession("admin", { mfaEnabled: true }),
    });
    assert.equal(await guard.canActivate(ctx as never), true);
    assert.equal(
      (req.user as { mfaEnrollmentRequired: boolean }).mfaEnrollmentRequired,
      false
    );
  });

  it("M4 mustResetPassword precedes MFA_ENROLLMENT_REQUIRED", async () => {
    const { guard, ctx } = mockContext({
      cookie: "good-token",
      requireStaffMfa: true,
      session: staffSession("owner", { mustResetPassword: true }),
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

  it("M3 email verification precedes MFA_ENROLLMENT_REQUIRED", async () => {
    const { guard, ctx } = mockContext({
      cookie: "good-token",
      requireStaffMfa: true,
      session: staffSession("admin", { emailVerificationTime: null }),
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

  it("header-token sessions cannot bypass MFA enrollment enforcement", async () => {
    const { guard, ctx } = mockContext({
      header: "good-token",
      requireStaffMfa: true,
      session: staffSession("admin"),
    });
    await assert.rejects(
      () => guard.canActivate(ctx as never),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenException);
        const body = err.getResponse() as { code?: string };
        assert.equal(body.code, MFA_ENROLLMENT_REQUIRED);
        return true;
      }
    );
  });

  it("M4 allowlist does not skip MFA enrollment for non-MFA routes without AllowWhileMfaEnrollment", async () => {
    const { guard, ctx } = mockContext({
      cookie: "good-token",
      requireStaffMfa: true,
      allowReset: true,
      session: staffSession("admin", { mustResetPassword: false }),
    });
    await assert.rejects(
      () => guard.canActivate(ctx as never),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenException);
        const body = err.getResponse() as { code?: string };
        assert.equal(body.code, MFA_ENROLLMENT_REQUIRED);
        return true;
      }
    );
  });

  it("M3+M4 cleared staff still blocked from admin until MFA enrolled", async () => {
    const { guard, ctx } = mockContext({
      cookie: "good-token",
      requireStaffMfa: true,
      allowUnverified: true,
      allowReset: true,
      roles: ["admin"],
      session: staffSession("admin"),
    });
    await assert.rejects(
      () => guard.canActivate(ctx as never),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenException);
        const body = err.getResponse() as { code?: string };
        assert.equal(body.code, MFA_ENROLLMENT_REQUIRED);
        return true;
      }
    );
  });
});

describe("CSRF on MFA enrollment mutations (H5)", () => {
  const guard = new CsrfGuard();

  it("requires CSRF for enroll/start when session cookie present", () => {
    assert.throws(
      () =>
        guard.canActivate({
          switchToHttp: () => ({
            getRequest: () => ({
              method: "POST",
              path: "/auth/mfa/enroll/start",
              url: "/auth/mfa/enroll/start",
              cookies: {
                [SESSION_COOKIE]: "session",
                [CSRF_COOKIE]: "a".repeat(64),
              },
              headers: {},
            }),
          }),
        } as never),
      (err: unknown) => err instanceof ForbiddenException
    );
  });

  it("accepts matching CSRF for enroll/confirm", () => {
    const token = "b".repeat(64);
    assert.equal(
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            method: "POST",
            path: "/auth/mfa/enroll/confirm",
            url: "/auth/mfa/enroll/confirm",
            cookies: {
              [SESSION_COOKIE]: "session",
              [CSRF_COOKIE]: token,
            },
            headers: { "x-csrf-token": token },
          }),
        }),
      } as never),
      true
    );
  });
});
