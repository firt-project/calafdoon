import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AUTH_FAILED_MESSAGE } from "./crypto-util";
import { SessionService } from "./session.service";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = "roles";
export const Roles = (...roles: Array<"admin" | "owner" | "user">) =>
  SetMetadata(ROLES_KEY, roles);

export const REQUIRE_PROFILE_KEY = "requireProfile";
export const RequireProfile = () => SetMetadata(REQUIRE_PROFILE_KEY, true);

export const REQUIRE_PAID_KEY = "requirePaid";
export const RequirePaid = () => SetMetadata(REQUIRE_PAID_KEY, true);

export type RequestUser = {
  id: string;
  email: string | null;
  role: "user" | "admin" | "owner";
  banned: boolean;
  hasProfile: boolean;
  hasPaid: boolean;
  sessionId: string;
};

export type AuthedRequest = Request & {
  user?: RequestUser;
  rawSessionToken?: string;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) throw new UnauthorizedException(AUTH_FAILED_MESSAGE);
    return req.user;
  }
);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const raw =
      (req.cookies?.["hel_session"] as string | undefined) ??
      (typeof req.headers["x-session-token"] === "string"
        ? req.headers["x-session-token"]
        : undefined);

    if (!raw) {
      if (isPublic) return true;
      throw new UnauthorizedException(AUTH_FAILED_MESSAGE);
    }

    const session = await this.sessions.findValidSession(raw);
    if (!session) {
      if (isPublic) return true;
      throw new UnauthorizedException(AUTH_FAILED_MESSAGE);
    }

    await this.sessions.touchSession(
      session.id,
      session.expiresAt,
      session.lastSeenAt
    );

    const profile = session.user.profile;
    req.rawSessionToken = raw;
    req.user = {
      id: session.user.id,
      email: session.user.email,
      role: profile?.role ?? "user",
      banned: profile?.banned ?? false,
      hasProfile: !!profile,
      hasPaid: profile?.hasPaid ?? false,
      sessionId: session.id,
    };

    if (isPublic) return true;

    if (req.user.banned) {
      throw new ForbiddenException("Unable to access this account");
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
    if (!req.user) throw new UnauthorizedException(AUTH_FAILED_MESSAGE);
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
    if (!req.user) throw new UnauthorizedException(AUTH_FAILED_MESSAGE);
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
    if (!req.user) throw new UnauthorizedException(AUTH_FAILED_MESSAGE);
    if (req.user.role !== "owner") {
      throw new ForbiddenException("Owner required");
    }
    return true;
  }
}
