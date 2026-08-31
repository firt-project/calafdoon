import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  ALLOW_DURING_PASSWORD_RESET_KEY,
  ALLOW_WHILE_UNVERIFIED_KEY,
  AuthGuard,
  AllowDuringPasswordReset,
  IS_PUBLIC_KEY,
  PASSWORD_RESET_REQUIRED,
  ROLES_KEY,
} from "./auth.guards";

function mockContext(opts: {
  isPublic?: boolean;
  allowReset?: boolean;
  allowUnverified?: boolean;
  roles?: string[];
  cookie?: string;
  header?: string;
  session?: {
    id: string;
    expiresAt: Date;
    lastSeenAt: Date;
    user: {
      id: string;
      email: string | null;
      mustResetPassword: boolean;
      emailVerificationTime?: Date | null;
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
    headers: opts.header ? { "x-session-token": opts.header } : {},
  };

  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  };

  return { guard: new AuthGuard(sessions as never, reflector, { get: () => undefined } as never), ctx, req };
}

const baseSession = {
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

describe("AuthGuard mustResetPassword (M4)", () => {
  it("allows normal users on ordinary routes", async () => {
    const { guard, ctx, req } = mockContext({
      cookie: "good-token",
      session: baseSession,
    });
    assert.equal(await guard.canActivate(ctx as never), true);
    assert.equal((req.user as { mustResetPassword: boolean }).mustResetPassword, false);
  });

  it("denies reset-required users on ordinary routes with PASSWORD_RESET_REQUIRED", async () => {
    const { guard, ctx } = mockContext({
      cookie: "good-token",
      session: {
        ...baseSession,
        user: { ...baseSession.user, mustResetPassword: true },
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

  it("allows reset-required users on allowlisted routes", async () => {
    const { guard, ctx } = mockContext({
      cookie: "good-token",
      allowReset: true,
      session: {
        ...baseSession,
        user: { ...baseSession.user, mustResetPassword: true },
      },
    });
    assert.equal(await guard.canActivate(ctx as never), true);
  });

  it("banned takes precedence over mustResetPassword", async () => {
    const { guard, ctx } = mockContext({
      cookie: "good-token",
      allowReset: true,
      session: {
        ...baseSession,
        user: {
          ...baseSession.user,
          mustResetPassword: true,
          profile: { role: "user", banned: true, hasPaid: true },
        },
      },
    });
    await assert.rejects(
      () => guard.canActivate(ctx as never),
      /Unable to access this account/
    );
  });

  it("reset-required admin cannot use admin roles without allowlist", async () => {
    const { guard, ctx } = mockContext({
      cookie: "good-token",
      roles: ["admin"],
      session: {
        ...baseSession,
        user: {
          ...baseSession.user,
          mustResetPassword: true,
          profile: { role: "admin", banned: false, hasPaid: true },
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

  it("reset-required owner cannot use owner routes without allowlist", async () => {
    const { guard, ctx } = mockContext({
      cookie: "good-token",
      roles: ["owner"],
      session: {
        ...baseSession,
        user: {
          ...baseSession.user,
          mustResetPassword: true,
          profile: { role: "owner", banned: false, hasPaid: true },
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

  it("header-token sessions also enforce mustResetPassword", async () => {
    const { guard, ctx } = mockContext({
      header: "good-token",
      session: {
        ...baseSession,
        user: { ...baseSession.user, mustResetPassword: true },
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

  it("unauthenticated still returns auth error before reset logic", async () => {
    const { guard, ctx } = mockContext({ session: null });
    await assert.rejects(
      () => guard.canActivate(ctx as never),
      UnauthorizedException
    );
  });

  it("AllowDuringPasswordReset decorator sets metadata key", () => {
    assert.equal(ALLOW_DURING_PASSWORD_RESET_KEY, "allowDuringPasswordReset");
    const deco = AllowDuringPasswordReset();
    assert.equal(typeof deco, "function");
  });

  it("missing profile does not crash when mustResetPassword is true", async () => {
    const { guard, ctx } = mockContext({
      cookie: "good-token",
      allowReset: true,
      session: {
        ...baseSession,
        user: {
          ...baseSession.user,
          mustResetPassword: true,
          profile: null,
        },
      },
    });
    assert.equal(await guard.canActivate(ctx as never), true);
  });
});
