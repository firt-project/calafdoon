/** Port of convex/lib/adminAuth.ts helpers for RequestUser. */

import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import {
  isOwnerRole,
  isStaffRole,
  type UserRole,
} from "../common/access";
import type { RequestUser } from "../auth/auth.guards";

/** Safe generic denial — do not leak target role / hierarchy details. */
export const STAFF_ACTION_FORBIDDEN =
  "You are not authorized to perform this action.";

/**
 * Privilege rank for staff hierarchy (H4).
 * owner (3) > admin (2) > user (1). Unknown roles fail closed (null).
 */
export function staffPrivilegeRank(
  role: string | null | undefined
): number | null {
  if (role === "owner") return 3;
  if (role === "admin") return 2;
  if (role === "user") return 1;
  if (role == null || role === "") return 1;
  return null;
}

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
  message = STAFF_ACTION_FORBIDDEN
) {
  if (!actorId || !targetUserId || actorId === targetUserId) {
    throw new ForbiddenException(message);
  }
}

/**
 * Central policy for disabling / restoring account access (ban, unban, and
 * other privilege-sensitive staff actions against another account).
 *
 * - Never act on yourself
 * - Actor must be staff
 * - Members (user) may be moderated by any staff
 * - Staff targets require a strictly higher-ranked actor (owner > admin)
 * - Unknown roles fail closed
 */
export function assertCanDisableTarget(opts: {
  actorUserId: string;
  actorRole: UserRole | string | null | undefined;
  targetUserId: string;
  targetRole: UserRole | string | null | undefined;
}) {
  assertNotSelf(opts.actorUserId, opts.targetUserId, STAFF_ACTION_FORBIDDEN);

  const actorRank = staffPrivilegeRank(opts.actorRole);
  const targetRank = staffPrivilegeRank(opts.targetRole);
  if (actorRank == null || targetRank == null) {
    throw new ForbiddenException(STAFF_ACTION_FORBIDDEN);
  }
  if (actorRank < 2) {
    throw new ForbiddenException(STAFF_ACTION_FORBIDDEN);
  }
  // Normal members — any staff may moderate.
  if (targetRank < 2) return;
  // Staff / equal / higher — only a strictly higher role may act.
  if (actorRank <= targetRank) {
    throw new ForbiddenException(STAFF_ACTION_FORBIDDEN);
  }
}

/**
 * Ban / unban authorization (H4).
 * Replaces the previous owner-only check that still allowed self and peer-admin bans.
 */
export function assertCanBanTarget(opts: {
  actorUserId: string;
  actorRole: UserRole | string | null | undefined;
  targetUserId: string;
  targetRole: UserRole | string | null | undefined;
}) {
  assertCanDisableTarget(opts);
}

export function assertCanDeleteTarget(
  actorId: string,
  target: { userId: string; role: string }
) {
  assertNotSelf(actorId, target.userId, STAFF_ACTION_FORBIDDEN);
  if (isStaffRole(target.role)) {
    throw new ForbiddenException(STAFF_ACTION_FORBIDDEN);
  }
}

export function assertCanRejectTarget(role: string | null | undefined) {
  if (isStaffRole(role)) {
    throw new ForbiddenException(STAFF_ACTION_FORBIDDEN);
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
