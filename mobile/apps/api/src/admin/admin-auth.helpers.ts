/** Port of convex/lib/adminAuth.ts helpers for RequestUser. */

import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import {
  isOwnerRole,
  isStaffRole,
  type UserRole,
} from "../common/access";
import type { RequestUser } from "../auth/auth.guards";

export function requireAdmin(user: RequestUser | undefined): RequestUser {
  if (!user) throw new UnauthorizedException("Not authenticated");
  if (!isStaffRole(user.role)) {
    throw new ForbiddenException("Unauthorized");
  }
  return user;
}

export function requireOwner(user: RequestUser | undefined): RequestUser {
  if (!user) throw new UnauthorizedException("Not authenticated");
  if (!isOwnerRole(user.role)) {
    throw new ForbiddenException("Only the owner can manage admin roles.");
  }
  return user;
}

export function requireAdminOrOwner(user: RequestUser | undefined): RequestUser {
  return requireAdmin(user);
}

export function assertNotSelf(
  actorId: string,
  targetUserId: string,
  message = "You cannot perform this action on your own account."
) {
  if (actorId === targetUserId) {
    throw new ForbiddenException(message);
  }
}

export function assertCanBanTarget(role: UserRole | string | null | undefined) {
  if (isOwnerRole(role)) {
    throw new ForbiddenException("Cannot ban the owner account.");
  }
}

export function assertCanDeleteTarget(
  actorId: string,
  target: { userId: string; role: string }
) {
  if (isStaffRole(target.role)) {
    throw new ForbiddenException(
      "Cannot delete an admin or owner account. Remove their role first."
    );
  }
  if (target.userId === actorId) {
    throw new ForbiddenException(
      "You cannot delete your own account from the admin panel."
    );
  }
}

export function assertCanRejectTarget(role: string | null | undefined) {
  if (isStaffRole(role)) {
    throw new ForbiddenException("Cannot reject a staff account");
  }
}

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function parseLimit(
  raw: string | undefined,
  fallback: number,
  max: number
): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}
