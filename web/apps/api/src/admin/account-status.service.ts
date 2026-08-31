import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AccountStatusEventType,
  Prisma,
  ReviewStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { isStaffRole } from "../common/access";
import { AuditLogService } from "./audit-log.service";
import { MetricsService } from "./metrics.service";
import {
  assertCanBanTarget,
  assertNotSelf,
  STAFF_ACTION_FORBIDDEN,
} from "./admin-auth.helpers";

export type EffectiveStatus =
  | ReviewStatus
  | "banned"
  | "deleted";

type TransitionInput = {
  actorUserId: string;
  profileId: string;
  event:
    | "approve"
    | "reject"
    | "ban"
    | "unban"
    | "pause"
    | "resume"
    | "suspend"
    | "unsuspend"
    | "request_changes"
    | "resubmit";
  reason?: string;
  internalAdminNote?: string;
  publicUserMessage?: string;
  /** Timed suspension end (UTC). */
  suspensionExpiresAt?: Date | null;
  /** Optional deadline when requesting profile changes. */
  changesDeadlineAt?: Date | null;
  /** Require a new photo as part of request-changes. */
  requireNewPhoto?: boolean;
  allowResubmission?: boolean;
  metadata?: Record<string, unknown>;
};

function asReviewStatus(value: string | null | undefined): ReviewStatus {
  switch (value) {
    case "incomplete":
    case "pending_review":
    case "approved":
    case "rejected":
    case "suspended":
    case "paused":
    case "changes_requested":
      return value;
    default:
      return "incomplete";
  }
}

/** Status that should be restored after ban/pause/suspend ends. */
export function capturableStatus(profile: {
  banned: boolean;
  reviewStatus: ReviewStatus | null;
  questionnaireComplete: boolean;
  approved: boolean;
}): ReviewStatus {
  if (profile.banned) {
    // Already banned — keep whatever was stored previously elsewhere.
    return asReviewStatus(profile.reviewStatus);
  }
  const current = profile.reviewStatus;
  if (
    current === "approved" ||
    current === "pending_review" ||
    current === "rejected" ||
    current === "incomplete" ||
    current === "paused" ||
    current === "suspended" ||
    current === "changes_requested"
  ) {
    // Don't capture transitional lock states as restore targets.
    if (current === "paused" || current === "suspended") {
      if (profile.approved) return "approved";
      if (profile.questionnaireComplete) return "pending_review";
      return "incomplete";
    }
    return current;
  }
  if (profile.approved) return "approved";
  if (profile.questionnaireComplete) return "pending_review";
  return "incomplete";
}

function approvedFlagForStatus(status: ReviewStatus): boolean {
  return status === "approved";
}

@Injectable()
export class AccountStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly metrics: MetricsService
  ) {}

  async recordHistory(
    tx: Prisma.TransactionClient,
    args: {
      userId: string;
      profileId: string;
      eventType: AccountStatusEventType;
      previousStatus: ReviewStatus | null;
      newStatus: ReviewStatus | null;
      reason?: string | null;
      internalAdminNote?: string | null;
      publicUserMessage?: string | null;
      performedByAdminId?: string | null;
      performedByAdminName?: string | null;
      metadata?: Record<string, unknown> | null;
      createdAt?: Date;
    }
  ) {
    return tx.accountStatusHistory.create({
      data: {
        userId: args.userId,
        profileId: args.profileId,
        eventType: args.eventType,
        previousStatus: args.previousStatus,
        newStatus: args.newStatus,
        reason: args.reason?.slice(0, 2000) ?? null,
        internalAdminNote: args.internalAdminNote?.slice(0, 4000) ?? null,
        publicUserMessage: args.publicUserMessage?.slice(0, 2000) ?? null,
        performedByAdminId: args.performedByAdminId ?? null,
        performedByAdminName: args.performedByAdminName?.slice(0, 200) ?? null,
        metadata: (args.metadata as Prisma.InputJsonValue) ?? undefined,
        createdAt: args.createdAt ?? new Date(),
      },
    });
  }

  private async actorName(actorUserId: string): Promise<string> {
    const actor = await this.prisma.profile.findUnique({
      where: { userId: actorUserId },
      select: { name: true, role: true },
    });
    if (!actor) return "Staff";
    if (actor.role === "owner") return actor.name || "Super Admin";
    return actor.name || "Admin";
  }

  /**
   * Apply a status transition in a transaction: profile update + history + audit.
   */
  async transition(input: TransitionInput) {
    const now = new Date();
    const actorName = await this.actorName(input.actorUserId);

    const result = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({
        where: { id: input.profileId },
      });
      if (!profile) throw new NotFoundException("Profile not found");

      const actor = await tx.profile.findUnique({
        where: { userId: input.actorUserId },
        select: { userId: true, role: true },
      });
      // Staff-driven transitions require a live staff actor from the DB.
      // Member self-resubmit is the only exception.
      if (input.event !== "resubmit") {
        if (!actor || !isStaffRole(actor.role)) {
          throw new ForbiddenException(STAFF_ACTION_FORBIDDEN);
        }
        assertNotSelf(
          input.actorUserId,
          profile.userId,
          STAFF_ACTION_FORBIDDEN
        );
      }

      const previous = asReviewStatus(profile.reviewStatus);
      let eventType: AccountStatusEventType;
      let newStatus: ReviewStatus;
      let data: Prisma.ProfileUpdateInput = {
        statusChangedAt: now,
      };
      let auditAction = "";

      switch (input.event) {
        case "approve": {
          if (profile.banned) {
            throw new BadRequestException("Unban the member before approving.");
          }
          if (isStaffRole(profile.role)) {
            throw new BadRequestException("Staff accounts cannot be approved here.");
          }
          eventType = "approved";
          newStatus = "approved";
          data = {
            ...data,
            approved: true,
            verified: false,
            reviewStatus: "approved",
            approvedAt: now,
            statusBeforePause: null,
            statusBeforeSuspend: null,
          };
          auditAction = "USER_APPROVED";
          break;
        }
        case "reject": {
          if (isStaffRole(profile.role)) {
            throw new BadRequestException("Cannot reject a staff account");
          }
          if (profile.banned) {
            throw new BadRequestException("Unban the member before rejecting.");
          }
          eventType = "rejected";
          newStatus = "rejected";
          data = {
            ...data,
            approved: false,
            verified: false,
            reviewStatus: "rejected",
            rejectedAt: now,
          };
          auditAction = "USER_REJECTED";
          break;
        }
        case "ban": {
          assertCanBanTarget({
            actorUserId: input.actorUserId,
            actorRole: actor!.role,
            targetUserId: profile.userId,
            targetRole: profile.role,
          });
          if (profile.banned) {
            throw new BadRequestException("Member is already banned.");
          }
          const before = capturableStatus(profile);
          eventType = "banned";
          newStatus = "suspended";
          data = {
            ...data,
            banned: true,
            reviewStatus: "suspended",
            statusBeforeBan: before,
            bannedAt: now,
          };
          auditAction = "USER_BANNED";
          break;
        }
        case "unban": {
          assertCanBanTarget({
            actorUserId: input.actorUserId,
            actorRole: actor!.role,
            targetUserId: profile.userId,
            targetRole: profile.role,
          });
          if (!profile.banned) {
            throw new BadRequestException("Member is not banned.");
          }
          const restored =
            profile.statusBeforeBan ??
            (profile.approved
              ? ("approved" as const)
              : profile.questionnaireComplete
                ? ("pending_review" as const)
                : ("incomplete" as const));
          // Never auto-approve unless they were approved before the ban.
          eventType = "unbanned";
          newStatus = restored;
          data = {
            ...data,
            banned: false,
            reviewStatus: restored,
            approved: approvedFlagForStatus(restored),
            statusBeforeBan: null,
            unbannedAt: now,
          };
          auditAction = "USER_UNBANNED";
          break;
        }
        case "pause": {
          if (isStaffRole(profile.role)) {
            throw new BadRequestException("Cannot pause a staff account.");
          }
          if (profile.banned) {
            throw new BadRequestException("Unban before pausing.");
          }
          if (profile.reviewStatus === "paused") {
            throw new BadRequestException("Member is already paused.");
          }
          const before = capturableStatus(profile);
          eventType = "paused";
          newStatus = "paused";
          data = {
            ...data,
            reviewStatus: "paused",
            statusBeforePause: before,
            pausedAt: now,
            // Keep approved flag as historical truth for restore path.
          };
          auditAction = "USER_PAUSED";
          break;
        }
        case "resume": {
          if (profile.reviewStatus !== "paused") {
            throw new BadRequestException("Member is not paused.");
          }
          const restored =
            profile.statusBeforePause ??
            (profile.approved
              ? ("approved" as const)
              : profile.questionnaireComplete
                ? ("pending_review" as const)
                : ("incomplete" as const));
          eventType = "resumed";
          newStatus = restored;
          data = {
            ...data,
            reviewStatus: restored,
            approved: approvedFlagForStatus(restored),
            statusBeforePause: null,
            resumedAt: now,
          };
          auditAction = "USER_RESUMED";
          break;
        }
        case "suspend": {
          if (isStaffRole(profile.role)) {
            throw new BadRequestException("Cannot suspend a staff account.");
          }
          if (profile.banned) {
            throw new BadRequestException("Member is banned; use unban first.");
          }
          const before = capturableStatus(profile);
          eventType = "suspended";
          newStatus = "suspended";
          data = {
            ...data,
            reviewStatus: "suspended",
            statusBeforeSuspend: before,
            suspendedAt: now,
            suspensionExpiresAt: input.suspensionExpiresAt ?? null,
          };
          auditAction = "USER_SUSPENDED";
          break;
        }
        case "unsuspend": {
          if (
            profile.reviewStatus !== "suspended" ||
            profile.banned
          ) {
            throw new BadRequestException(
              "Member is not under a timed suspension."
            );
          }
          const restored =
            profile.statusBeforeSuspend ??
            (profile.approved
              ? ("approved" as const)
              : profile.questionnaireComplete
                ? ("pending_review" as const)
                : ("incomplete" as const));
          eventType = "unsuspended";
          newStatus = restored;
          data = {
            ...data,
            reviewStatus: restored,
            approved: approvedFlagForStatus(restored),
            statusBeforeSuspend: null,
            suspensionExpiresAt: null,
          };
          auditAction = "USER_UNSUSPENDED";
          break;
        }
        case "request_changes": {
          if (isStaffRole(profile.role)) {
            throw new BadRequestException(
              "Cannot request changes on a staff account"
            );
          }
          if (profile.banned) {
            throw new BadRequestException(
              "Unban the member before requesting changes."
            );
          }
          eventType = "changes_requested";
          newStatus = "changes_requested";
          data = {
            ...data,
            approved: false,
            verified: false,
            reviewStatus: "changes_requested",
            changesRequestedAt: now,
            changesDeadlineAt: input.changesDeadlineAt ?? null,
            allowResubmission: input.allowResubmission ?? true,
            assignedReviewerId: input.actorUserId,
            assignedReviewerAt: now,
          };
          auditAction = "USER_CHANGES_REQUESTED";
          break;
        }
        case "resubmit": {
          if (
            profile.reviewStatus !== "changes_requested" &&
            profile.reviewStatus !== "rejected"
          ) {
            throw new BadRequestException(
              "Only rejected or changes-requested profiles can resubmit."
            );
          }
          if (profile.allowResubmission === false) {
            throw new BadRequestException("Resubmission is not allowed.");
          }
          eventType = "resubmitted";
          newStatus = "pending_review";
          data = {
            ...data,
            approved: false,
            reviewStatus: "pending_review",
            resubmittedAt: now,
            submittedAt: now,
            rejectedAt: null,
            changesRequestedAt: null,
            changesDeadlineAt: null,
          };
          auditAction = "USER_RESUBMITTED";
          break;
        }
        default:
          throw new BadRequestException("Unknown status transition");
      }

      const updated = await tx.profile.update({
        where: { id: profile.id },
        data,
      });

      await this.recordHistory(tx, {
        userId: profile.userId,
        profileId: profile.id,
        eventType,
        previousStatus: previous,
        newStatus,
        reason: input.reason ?? null,
        internalAdminNote: input.internalAdminNote ?? null,
        publicUserMessage:
          input.publicUserMessage ??
          input.reason ??
          null,
        performedByAdminId: input.actorUserId,
        performedByAdminName: actorName,
        metadata: {
          event: input.event,
          suspensionExpiresAt: input.suspensionExpiresAt?.toISOString() ?? null,
          requireNewPhoto: input.requireNewPhoto ?? false,
          ...(input.metadata ?? {}),
        },
        createdAt: now,
      });

      return {
        updated,
        previous,
        newStatus,
        auditAction,
        eventType,
        now,
      };
    });

    await this.audit.write({
      actorUserId: input.actorUserId,
      action: result.auditAction,
      targetUserId: result.updated.userId,
      targetProfileId: result.updated.id,
      metadata: {
        previousStatus: result.previous,
        newStatus: result.newStatus,
        reason: input.reason ?? null,
        internalAdminNote: input.internalAdminNote ?? null,
        at: result.now.toISOString(),
      },
    });

    await this.metrics.scheduleRebuild();

    return {
      ok: true as const,
      previousStatus: result.previous,
      newStatus: result.newStatus,
      eventType: result.eventType,
      at: result.now.toISOString(),
      profile: result.updated,
    };
  }

  async listHistory(opts: {
    profileId?: string;
    userId?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    cursor?: string;
    /** When true, strip internalAdminNote. */
    publicOnly?: boolean;
  }) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const cursorDate = opts.cursor ? new Date(opts.cursor) : null;

    const rows = await this.prisma.accountStatusHistory.findMany({
      where: {
        ...(opts.profileId ? { profileId: opts.profileId } : {}),
        ...(opts.userId ? { userId: opts.userId } : {}),
        ...(opts.from || opts.to
          ? {
              createdAt: {
                ...(opts.from ? { gte: opts.from } : {}),
                ...(opts.to ? { lt: opts.to } : {}),
              },
            }
          : {}),
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: page.map((row) => ({
        id: row.id,
        userId: row.userId,
        profileId: row.profileId,
        eventType: row.eventType,
        previousStatus: row.previousStatus,
        newStatus: row.newStatus,
        reason: row.reason,
        publicUserMessage: row.publicUserMessage,
        internalAdminNote: opts.publicOnly ? undefined : row.internalAdminNote,
        performedByAdminId: opts.publicOnly ? undefined : row.performedByAdminId,
        performedByAdminName: opts.publicOnly
          ? row.performedByAdminName
            ? "Staff"
            : "System"
          : row.performedByAdminName,
        createdAt: row.createdAt.toISOString(),
        metadata: opts.publicOnly ? undefined : row.metadata,
      })),
      nextCursor: hasMore
        ? page[page.length - 1]?.createdAt.toISOString() ?? null
        : null,
    };
  }

  /**
   * Aggregate status events in [from, to) UTC for dashboard reports.
   * Only real counts from account_status_history + users.created_at.
   */
  async reportPeriod(from: Date, to: Date, country?: string) {
    const profileFilter = country
      ? { profile: { country: { equals: country, mode: "insensitive" as const } } }
      : {};

    const [
      registrations,
      events,
      activeUsers,
      messages,
      reports,
    ] = await Promise.all([
      this.prisma.user.count({
        where: {
          createdAt: { gte: from, lt: to },
          deletedAt: null,
          ...(country
            ? {
                profile: {
                  country: { equals: country, mode: "insensitive" },
                },
              }
            : {}),
        },
      }),
      this.prisma.accountStatusHistory.groupBy({
        by: ["eventType"],
        where: {
          createdAt: { gte: from, lt: to },
          ...(country
            ? {
                profile: {
                  country: { equals: country, mode: "insensitive" },
                },
              }
            : {}),
        },
        _count: { _all: true },
      }),
      this.prisma.user.count({
        where: {
          lastActiveAt: { gte: from, lt: to },
          deletedAt: null,
          ...profileFilter,
        },
      }),
      this.prisma.message.count({
        where: { messageCreatedAt: { gte: from, lt: to } },
      }),
      this.prisma.report.count({
        where: { createdAt: { gte: from, lt: to } },
      }),
    ]);

    const byType: Record<string, number> = {};
    for (const row of events) {
      byType[row.eventType] = row._count._all;
    }

    const pendingSnapshot = await this.prisma.profile.count({
      where: {
        reviewStatus: "pending_review",
        banned: false,
        ...(country
          ? { country: { equals: country, mode: "insensitive" } }
          : {}),
      },
    });

    const changesRequestedSnapshot = await this.prisma.profile.count({
      where: {
        reviewStatus: "changes_requested",
        banned: false,
        ...(country
          ? { country: { equals: country, mode: "insensitive" } }
          : {}),
      },
    });

    const submissions = await this.prisma.profile.count({
      where: {
        submittedAt: { gte: from, lt: to },
        ...(country
          ? { country: { equals: country, mode: "insensitive" } }
          : {}),
      },
    });

    const approvedEvents = await this.prisma.accountStatusHistory.findMany({
      where: {
        eventType: "approved",
        createdAt: { gte: from, lt: to },
        ...(country
          ? {
              profile: {
                country: { equals: country, mode: "insensitive" },
              },
            }
          : {}),
      },
      select: {
        createdAt: true,
        profileId: true,
        profile: { select: { submittedAt: true, createdAt: true } },
      },
      take: 5000,
    });
    const reviewDurationsMs = approvedEvents
      .map((e) => {
        const start = e.profile?.submittedAt ?? e.profile?.createdAt;
        if (!start) return null;
        return e.createdAt.getTime() - start.getTime();
      })
      .filter((ms): ms is number => ms != null && ms >= 0)
      .sort((a, b) => a - b);
    const avgReviewMs =
      reviewDurationsMs.length > 0
        ? Math.round(
            reviewDurationsMs.reduce((a, b) => a + b, 0) /
              reviewDurationsMs.length
          )
        : null;
    const medianReviewMs =
      reviewDurationsMs.length > 0
        ? reviewDurationsMs[Math.floor(reviewDurationsMs.length / 2)]!
        : null;

    const oldestPending = await this.prisma.profile.findFirst({
      where: {
        reviewStatus: "pending_review",
        banned: false,
        ...(country
          ? { country: { equals: country, mode: "insensitive" } }
          : {}),
      },
      orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        submittedAt: true,
        createdAt: true,
      },
    });

    const waitingCutoff24 = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const waitingCutoff48 = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const pendingOver24h = await this.prisma.profile.count({
      where: {
        reviewStatus: "pending_review",
        banned: false,
        OR: [
          { submittedAt: { lte: waitingCutoff24 } },
          { submittedAt: null, createdAt: { lte: waitingCutoff24 } },
        ],
        ...(country
          ? { country: { equals: country, mode: "insensitive" } }
          : {}),
      },
    });
    const pendingOver48h = await this.prisma.profile.count({
      where: {
        reviewStatus: "pending_review",
        banned: false,
        OR: [
          { submittedAt: { lte: waitingCutoff48 } },
          { submittedAt: null, createdAt: { lte: waitingCutoff48 } },
        ],
        ...(country
          ? { country: { equals: country, mode: "insensitive" } }
          : {}),
      },
    });

    const decided = (byType.approved ?? 0) + (byType.rejected ?? 0);
    const approvalRate =
      decided > 0 ? Math.round(((byType.approved ?? 0) / decided) * 1000) / 10 : null;
    const rejectionRate =
      decided > 0 ? Math.round(((byType.rejected ?? 0) / decided) * 1000) / 10 : null;

    const reviewsByAdmin = await this.prisma.accountStatusHistory.groupBy({
      by: ["performedByAdminId"],
      where: {
        eventType: { in: ["approved", "rejected", "changes_requested"] },
        createdAt: { gte: from, lt: to },
        performedByAdminId: { not: null },
        ...(country
          ? {
              profile: {
                country: { equals: country, mode: "insensitive" },
              },
            }
          : {}),
      },
      _count: { _all: true },
    });

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      timezoneNote: "All bounds are UTC. Convert display timezone in the UI.",
      registrations,
      submissions,
      profileSubmissions: submissions,
      approved: byType.approved ?? 0,
      rejected: byType.rejected ?? 0,
      changesRequested: byType.changes_requested ?? 0,
      paused: byType.paused ?? 0,
      resumed: byType.resumed ?? 0,
      suspended: byType.suspended ?? 0,
      unsuspended: byType.unsuspended ?? 0,
      banned: byType.banned ?? 0,
      unbanned: byType.unbanned ?? 0,
      deleted: byType.deleted ?? 0,
      restored: byType.restored ?? 0,
      appealsSubmitted: byType.appeal_submitted ?? 0,
      appealsReviewed: byType.appeal_reviewed ?? 0,
      verificationApproved: byType.verification_approved ?? 0,
      verificationRejected: byType.verification_rejected ?? 0,
      pendingSnapshot,
      changesRequestedSnapshot,
      pendingAtEnd: pendingSnapshot,
      averageReviewTimeMs: avgReviewMs,
      medianReviewTimeMs: medianReviewMs,
      oldestPendingApplication: oldestPending
        ? {
            profileId: oldestPending.id,
            name: oldestPending.name,
            waitingSince: (
              oldestPending.submittedAt ?? oldestPending.createdAt
            ).toISOString(),
          }
        : null,
      pendingOver24h,
      pendingOver48h,
      approvalRate,
      rejectionRate,
      reviewsCompletedPerAdmin: reviewsByAdmin.map((r) => ({
        adminUserId: r.performedByAdminId,
        count: r._count._all,
      })),
      activeUsers,
      messages,
      reports,
      // Features not in this product — always 0, not fake engagement.
      uploadedVideos: 0,
      liveStreams: 0,
      giftTransactions: 0,
      coinTransactions: 0,
      diamondEarnings: 0,
      withdrawals: 0,
      revenue: 0,
    };
  }

  /** Mark questionnaire complete / payment submission time once. */
  async markSubmitted(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });
    if (!profile) return;
    if (profile.submittedAt) return;
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.profile.update({
        where: { id: profile.id },
        data: {
          submittedAt: now,
          statusChangedAt: now,
          ...(profile.reviewStatus === "incomplete" || !profile.reviewStatus
            ? { reviewStatus: "pending_review" }
            : {}),
        },
      });
      await this.recordHistory(tx, {
        userId,
        profileId: profile.id,
        eventType: "submitted",
        previousStatus: asReviewStatus(profile.reviewStatus),
        newStatus:
          profile.reviewStatus === "incomplete" || !profile.reviewStatus
            ? "pending_review"
            : asReviewStatus(profile.reviewStatus),
        publicUserMessage: "Profile information submitted for review.",
        performedByAdminName: "System",
        createdAt: now,
      });
    });
  }

  async touchLogin(userId: string) {
    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: now, lastActiveAt: now },
    });
  }

  async touchActive(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() },
    });
  }
}
