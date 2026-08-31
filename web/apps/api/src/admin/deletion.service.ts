import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { isStaffRole } from "../common/access";
import { AuditLogService } from "./audit-log.service";
import { assertCanDeleteTarget } from "./admin-auth.helpers";

type DeletionPlan = {
  sessions: number;
  passwordResetTokens: number;
  authAuditEvents: number;
  profileAuditEvents: number;
  userUploads: number;
  mediaToOrphan: number;
  preferences: number;
  likes: number;
  compatibilityScores: number;
  matches: number;
  conversations: number;
  messages: number;
  notifications: number;
  payments: number;
  blocks: number;
  reports: number;
  memberEmailLogs: number;
  supportContactsNulled: number;
  supportMessagesNulled: number;
  evcProofs: number;
  accountStatusHistory: number;
  accountAppeals: number;
  emailVerificationTokens: number;
  photoReveals: number;
  auditLogsAsActor: number;
  profile: number;
  authAccounts: number;
  user: number;
  migrationFailuresUntouched: true;
};

@Injectable()
export class DeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService
  ) {}

  private async buildPlan(userId: string): Promise<DeletionPlan> {
    const [
      sessions,
      passwordResetTokens,
      authAuditEvents,
      profileAuditEvents,
      userUploads,
      mediaOwned,
      preferences,
      likesFrom,
      likesTo,
      scoresA,
      scoresB,
      matchesA,
      matchesB,
      messagesSent,
      notifications,
      payments,
      blocksOut,
      blocksIn,
      reportsOut,
      reportsIn,
      memberEmailLogs,
      supportContacts,
      supportMessages,
      evcProofs,
      accountStatusHistory,
      accountAppeals,
      emailVerificationTokens,
      photoRevealsViewed,
      photoRevealsOwned,
      auditLogsAsActor,
      authAccounts,
    ] = await Promise.all([
      this.prisma.session.count({ where: { userId } }),
      this.prisma.passwordResetToken.count({ where: { userId } }),
      this.prisma.authAuditEvent.count({ where: { userId } }),
      this.prisma.profileAuditEvent.count({ where: { userId } }),
      this.prisma.userUpload.count({ where: { userId } }),
      this.prisma.mediaObject.count({ where: { ownerUserId: userId } }),
      this.prisma.preference.count({ where: { userId } }),
      this.prisma.like.count({ where: { fromUserId: userId } }),
      this.prisma.like.count({ where: { toUserId: userId } }),
      this.prisma.compatibilityScore.count({ where: { userAId: userId } }),
      this.prisma.compatibilityScore.count({ where: { userBId: userId } }),
      this.prisma.match.count({ where: { userAId: userId } }),
      this.prisma.match.count({ where: { userBId: userId } }),
      this.prisma.message.count({ where: { senderId: userId } }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.payment.count({ where: { userId } }),
      this.prisma.block.count({ where: { blockerId: userId } }),
      this.prisma.block.count({ where: { blockedId: userId } }),
      this.prisma.report.count({ where: { reporterId: userId } }),
      this.prisma.report.count({ where: { reportedUserId: userId } }),
      this.prisma.memberEmailLog.count({ where: { userId } }),
      this.prisma.supportContact.count({ where: { userId } }),
      this.prisma.supportMessage.count({ where: { authorUserId: userId } }),
      this.prisma.evcPaymentProof.count({ where: { userId } }),
      this.prisma.accountStatusHistory.count({ where: { userId } }),
      this.prisma.accountAppeal.count({ where: { userId } }),
      this.prisma.emailVerificationToken.count({ where: { userId } }),
      this.prisma.photoReveal.count({ where: { viewerUserId: userId } }),
      this.prisma.photoReveal.count({ where: { ownerUserId: userId } }),
      this.prisma.auditLog.count({ where: { actorUserId: userId } }),
      this.prisma.authAccount.count({ where: { userId } }),
    ]);

    const matchIds = (
      await this.prisma.match.findMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        select: { id: true },
      })
    ).map((m) => m.id);

    const conversations = matchIds.length
      ? await this.prisma.conversation.count({
          where: { matchId: { in: matchIds } },
        })
      : 0;

    const conversationIds = matchIds.length
      ? (
          await this.prisma.conversation.findMany({
            where: { matchId: { in: matchIds } },
            select: { id: true },
          })
        ).map((c) => c.id)
      : [];

    const messagesInConversations = conversationIds.length
      ? await this.prisma.message.count({
          where: { conversationId: { in: conversationIds } },
        })
      : 0;

    return {
      sessions,
      passwordResetTokens,
      authAuditEvents,
      profileAuditEvents,
      userUploads,
      mediaToOrphan: mediaOwned,
      preferences,
      likes: likesFrom + likesTo,
      compatibilityScores: scoresA + scoresB,
      matches: matchesA + matchesB,
      conversations,
      messages: Math.max(messagesSent, messagesInConversations),
      notifications,
      payments,
      blocks: blocksOut + blocksIn,
      reports: reportsOut + reportsIn,
      memberEmailLogs,
      supportContactsNulled: supportContacts,
      supportMessagesNulled: supportMessages,
      evcProofs,
      accountStatusHistory,
      accountAppeals,
      emailVerificationTokens,
      photoReveals: photoRevealsViewed + photoRevealsOwned,
      auditLogsAsActor,
      profile: 1,
      authAccounts,
      user: 1,
      migrationFailuresUntouched: true,
    };
  }

  async dryRun(actorUserId: string, profileId: string, correlationId?: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    assertCanDeleteTarget(actorUserId, profile);

    const plan = await this.buildPlan(profile.userId);
    const job = await this.prisma.deletionJob.create({
      data: {
        targetUserId: profile.userId,
        targetProfileId: profile.id,
        actorUserId,
        mode: "dry_run",
        status: "completed",
        planJson: plan as unknown as Prisma.InputJsonValue,
        resultJson: { dryRun: true },
        correlationId: correlationId ?? null,
        completedAt: new Date(),
      },
    });

    return { jobId: job.id, plan, mode: "dry_run" as const };
  }

  async executeSelfDelete(
    userId: string,
    opts?: { correlationId?: string; requestId?: string }
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });
    if (!profile) {
      return { success: true, alreadyGone: true as const };
    }
    if (isStaffRole(profile.role)) {
      throw new ForbiddenException(
        "Staff accounts cannot be deleted here. Contact support."
      );
    }
    return this.execute(userId, profile.id, { ...opts, self: true });
  }

  async execute(
    actorUserId: string,
    profileId: string,
    opts?: { correlationId?: string; requestId?: string; self?: boolean }
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });
    if (!profile) {
      return { success: true, alreadyGone: true as const };
    }
    if (isStaffRole(profile.role)) {
      throw new ForbiddenException(
        "Cannot delete an admin or owner account. Remove their role first."
      );
    }
    if (opts?.self) {
      if (profile.userId !== actorUserId) {
        throw new ForbiddenException("You can only delete your own account.");
      }
    } else {
      assertCanDeleteTarget(actorUserId, profile);
    }

    const plan = await this.buildPlan(profile.userId);
    const job = await this.prisma.deletionJob.create({
      data: {
        targetUserId: profile.userId,
        targetProfileId: profile.id,
        actorUserId,
        mode: "execute",
        status: "pending",
        planJson: plan as unknown as Prisma.InputJsonValue,
        correlationId: opts?.correlationId ?? null,
      },
    });

    // Do not write audit_logs before the hard-delete transaction:
    // target_user_id / actor_user_id Restrict FKs blocked deletes in production.
    // Trail is kept on deletion_jobs; admin audit is written after success.

    const userId = profile.userId;
    const deletedName = profile.name;

    try {
      await this.prisma.$transaction(async (tx) => {
        // 1. Sessions / auth tokens first
        await tx.session.deleteMany({ where: { userId } });
        await tx.passwordResetToken.deleteMany({ where: { userId } });
        await tx.emailVerificationToken.deleteMany({ where: { userId } });
        await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
        await tx.mfaLoginChallenge.deleteMany({ where: { userId } });
        await tx.authAuditEvent.deleteMany({ where: { userId } });
        await tx.profileAuditEvent.deleteMany({ where: { userId } });
        // Restrict FKs added after the original cascade plan
        await tx.accountAppeal.deleteMany({ where: { userId } });
        await tx.accountStatusHistory.deleteMany({ where: { userId } });
        await tx.photoReveal.deleteMany({
          where: { OR: [{ viewerUserId: userId }, { ownerUserId: userId }] },
        });
        // Clear any audit rows that still point at this user (actor or target)
        await tx.auditLog.deleteMany({ where: { actorUserId: userId } });
        await tx.auditLog.updateMany({
          where: {
            OR: [{ targetUserId: userId }, { targetProfileId: profile.id }],
          },
          data: { targetUserId: null, targetProfileId: null },
        });
        await tx.notification.updateMany({
          where: { relatedUserId: userId },
          data: { relatedUserId: null, convexRelatedUserId: null },
        });

        // 2. Orphan media (no physical purge)
        const media = await tx.mediaObject.findMany({
          where: { ownerUserId: userId },
          select: { id: true },
        });
        for (const m of media) {
          await tx.orphanedMediaObject.create({
            data: {
              mediaObjectId: m.id,
              reason: "member_deletion",
              deletionJobId: job.id,
            },
          });
          await tx.mediaObject.update({
            where: { id: m.id },
            data: { ownerUserId: null },
          });
        }

        await tx.userUpload.deleteMany({ where: { userId } });

        // Clear profile image refs before profile delete
        await tx.profile.update({
          where: { id: profile.id },
          data: {
            profileImageMediaId: null,
            profileImageConvexId: null,
          },
        });

        await tx.preference.deleteMany({ where: { userId } });
        await tx.like.deleteMany({
          where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
        });
        await tx.compatibilityScore.deleteMany({
          where: { OR: [{ userAId: userId }, { userBId: userId }] },
        });

        const matches = await tx.match.findMany({
          where: { OR: [{ userAId: userId }, { userBId: userId }] },
          select: { id: true },
        });
        for (const match of matches) {
          const conversation = await tx.conversation.findUnique({
            where: { matchId: match.id },
          });
          if (conversation) {
            await tx.message.deleteMany({
              where: { conversationId: conversation.id },
            });
            await tx.conversation.delete({ where: { id: conversation.id } });
          }
          // Detach payments from match before match delete
          await tx.payment.updateMany({
            where: { matchId: match.id },
            data: { matchId: null },
          });
          await tx.match.delete({ where: { id: match.id } });
        }

        await tx.message.deleteMany({ where: { senderId: userId } });
        await tx.notification.deleteMany({ where: { userId } });
        await tx.payment.deleteMany({ where: { userId } });
        await tx.block.deleteMany({
          where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        });
        await tx.report.deleteMany({
          where: {
            OR: [{ reporterId: userId }, { reportedUserId: userId }],
          },
        });
        await tx.memberEmailLog.deleteMany({ where: { userId } });

        // Preserve support threads (Convex leaves them) — null FKs
        await tx.supportMessage.updateMany({
          where: { authorUserId: userId },
          data: { authorUserId: null },
        });
        await tx.supportContact.updateMany({
          where: { userId },
          data: { userId: null, reviewedById: null },
        });
        await tx.supportContact.updateMany({
          where: { reviewedById: userId },
          data: { reviewedById: null },
        });

        // EVC proofs: required userId FK — delete rows (prod export had 0)
        await tx.evcPaymentProof.deleteMany({ where: { userId } });
        await tx.evcPaymentProof.updateMany({
          where: { reviewedById: userId },
          data: { reviewedById: null },
        });

        // Staff invite accepter null; sender invites must go (Restrict)
        await tx.staffInvite.updateMany({
          where: { acceptedByUserId: userId },
          data: { acceptedByUserId: null },
        });
        await tx.staffInvite.deleteMany({ where: { invitedById: userId } });

        // Audit targets SetNull via FK; also clear report reviewedBy
        await tx.report.updateMany({
          where: { reviewedById: userId },
          data: { reviewedById: null },
        });

        await tx.profile.delete({ where: { id: profile.id } });
        await tx.authAccount.deleteMany({ where: { userId } });
        await tx.user.delete({ where: { id: userId } });
      });

      await this.prisma.deletionJob.update({
        where: { id: job.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          resultJson: {
            deleted: true,
            userId,
            self: opts?.self ?? false,
            action: opts?.self ? "delete_user_self" : "delete_user",
          },
        },
      });

      if (!opts?.self) {
        try {
          await this.audit.write({
            actorUserId,
            action: "delete_user",
            // User/profile rows are gone — keep IDs only in metadata.
            targetUserId: null,
            targetProfileId: null,
            metadata: {
              name: deletedName,
              deletedUserId: userId,
              deletedProfileId: profile.id,
              self: false,
            },
            correlationId: opts?.correlationId,
            requestId: opts?.requestId,
          });
        } catch {
          // Deletion already succeeded; audit is best-effort.
        }
      }

      return { success: true, deleted: true as const, jobId: job.id, plan };
    } catch (err) {
      const prismaCode =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code ?? "")
          : "";
      const prismaMeta =
        err && typeof err === "object" && "meta" in err
          ? (err as { meta?: unknown }).meta
          : undefined;
      await this.prisma.deletionJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          completedAt: new Date(),
          resultJson: {
            error: err instanceof Error ? err.message : "unknown",
            prismaCode: prismaCode || undefined,
            prismaMeta: prismaMeta ?? undefined,
          },
        },
      });
      if (prismaCode === "P2003") {
        throw new BadRequestException(
          "Could not delete this member because related records are still linked. Try again or contact support."
        );
      }
      throw err;
    }
  }
}
