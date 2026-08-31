import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
  SetMetadata,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { isStaffRole, hasPaidAccess } from "../common/access";
import { SESSION_REQUIRED_MESSAGE } from "./crypto-util";
import { SessionService } from "./session.service";
import { isStaffMfaRequired } from "./staff-mfa-policy";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = "roles";
export const Roles = (...roles: Array<"admin" | "owner" | "user">) =>
  SetMetadata(ROLES_KEY, roles);

export const REQUIRE_PROFILE_KEY = "requireProfile";
export const RequireProfile = () => SetMetadata(REQUIRE_PROFILE_KEY, true);

export const REQUIRE_PAID_KEY = "requirePaid";
export const RequirePaid = () => SetMetadata(REQUIRE_PAID_KEY, true);

/** M4: route may run while User.mustResetPassword is true. */
export const ALLOW_DURING_PASSWORD_RESET_KEY = "allowDuringPasswordReset";
export const AllowDuringPasswordReset = () =>
  SetMetadata(ALLOW_DURING_PASSWORD_RESET_KEY, true);

/** Stable machine-readable denial for forced password reset. */
export const PASSWORD_RESET_REQUIRED = "PASSWORD_RESET_REQUIRED";

/** M3: route may run while email is unverified (emailVerificationTime null). */
export const ALLOW_WHILE_UNVERIFIED_KEY = "allowWhileUnverified";
export const AllowWhileUnverified = () =>
  SetMetadata(ALLOW_WHILE_UNVERIFIED_KEY, true);

/** Stable machine-readable denial for missing email verification. */
export const EMAIL_VERIFICATION_REQUIRED = "EMAIL_VERIFICATION_REQUIRED";

/**
 * L4: route may run while staff MFA enrollment is still required
 * (REQUIRE_STAFF_MFA and !mfaEnabled).
 */
export const ALLOW_WHILE_MFA_ENROLLMENT_KEY = "allowWhileMfaEnrollment";
export const AllowWhileMfaEnrollment = () =>
  SetMetadata(ALLOW_WHILE_MFA_ENROLLMENT_KEY, true);

/** Stable machine-readable denial for missing staff MFA enrollment. */
export const MFA_ENROLLMENT_REQUIRED = "MFA_ENROLLMENT_REQUIRED";

export type RequestUser = {
  id: string;
  email: string | null;
  role: "user" | "admin" | "owner";
  banned: boolean;
  hasProfile: boolean;
  hasPaid: boolean;
  mustResetPassword: boolean;
  /** True when User.emailVerificationTime is set. */
  emailVerified: boolean;
  /** Live User.mfaEnabled from the session load. */
  mfaEnabled: boolean;
  /**
   * True when REQUIRE_STAFF_MFA is on, role is staff, and MFA is not enabled.
   * Session exists but is restricted to enrollment allowlist routes.
   */
  mfaEnrollmentRequired: boolean;
  sessionId: string;
};

export type AuthedRequest = Request & {
  user?: RequestUser;
  rawSessionToken?: string;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) throw new UnauthorizedException(SESSION_REQUIRED_MESSAGE);
    return req.user;
  }
);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const cookieToken = req.cookies?.["hel_session"] as string | undefined;
    const headerToken =
      typeof req.headers["x-session-token"] === "string"
        ? req.headers["x-session-token"]
        : undefined;

    // H5: reject ambiguous dual credentials (cookie + differing header).
    if (
      cookieToken &&
      headerToken &&
      cookieToken.length > 0 &&
      headerToken.length > 0 &&
      cookieToken !== headerToken
    ) {
      throw new ForbiddenException("Ambiguous session credentials");
    }

    // Prefer HttpOnly cookie; header is a non-browser compatibility fallback only.
    const raw = cookieToken || headerToken;

    if (!raw) {
      if (isPublic) return true;
      throw new UnauthorizedException(SESSION_REQUIRED_MESSAGE);
    }

    const session = await this.sessions.findValidSession(raw);
    if (!session) {
      if (isPublic) return true;
      throw new UnauthorizedException(SESSION_REQUIRED_MESSAGE);
    }

    await this.sessions.touchSession(
      session.id,
      session.expiresAt,
      session.lastSeenAt
    );

    const profile = session.user.profile;
    const role = profile?.role ?? "user";
    const mfaEnabled = session.user.mfaEnabled === true;
    const mfaEnrollmentRequired =
      isStaffMfaRequired(this.config) &&
      isStaffRole(role) &&
      !mfaEnabled;

    req.rawSessionToken = raw;
    req.user = {
      id: session.user.id,
      email: session.user.email,
      role,
      banned: profile?.banned ?? false,
      hasProfile: !!profile,
      hasPaid: hasPaidAccess(profile),
      mustResetPassword: session.user.mustResetPassword === true,
      emailVerified: session.user.emailVerificationTime != null,
      mfaEnabled,
      mfaEnrollmentRequired,
      sessionId: session.id,
    };

    if (isPublic) return true;

    // Precedence:
    // 1) authentication (above)
    // 2) banned/deleted/suspended
    // 3) mustResetPassword (M4)
    // 4) email verification (M3)
    // 5) required staff MFA enrollment (L4)
    // 6) role / profile / paid authorization
    if (req.user.banned) {
      throw new ForbiddenException("Unable to access this account");
    }

    if (req.user.mustResetPassword) {
      const allowReset = this.reflector.getAllAndOverride<boolean>(
        ALLOW_DURING_PASSWORD_RESET_KEY,
        [context.getHandler(), context.getClass()]
      );
      if (!allowReset) {
        throw new ForbiddenException({
          statusCode: 403,
          message: "Password reset required",
          code: PASSWORD_RESET_REQUIRED,
        });
      }
    }

    if (!req.user.emailVerified) {
      const allowUnverified = this.reflector.getAllAndOverride<boolean>(
        ALLOW_WHILE_UNVERIFIED_KEY,
        [context.getHandler(), context.getClass()]
      );
      if (!allowUnverified) {
        throw new ForbiddenException({
          statusCode: 403,
          message: "Email verification required",
          code: EMAIL_VERIFICATION_REQUIRED,
        });
      }
    }

    if (req.user.mfaEnrollmentRequired) {
      const allowMfaEnroll = this.reflector.getAllAndOverride<boolean>(
        ALLOW_WHILE_MFA_ENROLLMENT_KEY,
        [context.getHandler(), context.getClass()]
      );
      if (!allowMfaEnroll) {
        throw new ForbiddenException({
          statusCode: 403,
          message: "Staff MFA enrollment required",
          code: MFA_ENROLLMENT_REQUIRED,
        });
      }
    }

    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles?.length) {
      const ok =
        roles.includes(req.user.role) ||
        (roles.includes("admin") && req.user.role === "owner");
      if (!ok) throw new ForbiddenException("Insufficient permissions");
    }

    if (
      this.reflector.getAllAndOverride<boolean>(REQUIRE_PROFILE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) &&
      !req.user.hasProfile
    ) {
      throw new ForbiddenException("Profile required");
    }

    if (
      this.reflector.getAllAndOverride<boolean>(REQUIRE_PAID_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) &&
      !req.user.hasPaid &&
      req.user.role === "user"
    ) {
      throw new ForbiddenException("Paid access required");
    }

    return true;
  }
}

/** Authenticated + not banned (default AuthGuard already enforces when not @Public). */
@Injectable()
export class ActiveUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) throw new UnauthorizedException(SESSION_REQUIRED_MESSAGE);
    if (req.user.banned) {
      throw new ForbiddenException("Unable to access this account");
    }
    return true;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) throw new UnauthorizedException(SESSION_REQUIRED_MESSAGE);
    if (req.user.role !== "admin" && req.user.role !== "owner") {
      throw new ForbiddenException("Admin required");
    }
    return true;
  }
}

@Injectable()
export class OwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) throw new UnauthorizedException(SESSION_REQUIRED_MESSAGE);
    if (req.user.role !== "owner") {
      throw new ForbiddenException("Owner required");
    }
    return true;
  }
}
