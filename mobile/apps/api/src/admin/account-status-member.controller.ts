import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { CurrentUser, type RequestUser } from "../auth/auth.guards";
import { CsrfGuard } from "../auth/csrf";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { PrismaService } from "../prisma/prisma.service";
import { AccountStatusService } from "./account-status.service";
import { resolveReviewStatus } from "../common/review-status";

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues[0]?.message ?? "Invalid request body"
    );
  }
  return result.data;
}

/**
 * Member-facing account status timeline (public messages only).
 */
@Controller("account-status")
export class AccountStatusMemberController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly status: AccountStatusService
  ) {}

  @Get()
  @UseGuards(RateLimitGuard)
  async mine(@CurrentUser() user: RequestUser) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) throw new BadRequestException("Profile not found");

    const dbUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        createdAt: true,
        lastLoginAt: true,
        lastActiveAt: true,
        emailVerificationTime: true,
        phoneVerificationTime: true,
      },
    });

    const history = await this.status.listHistory({
      userId: user.id,
      publicOnly: true,
      limit: 100,
    });

    const appeal = await this.prisma.accountAppeal.findFirst({
      where: { userId: user.id },
      orderBy: { submittedAt: "desc" },
    });

    const review = resolveReviewStatus(profile);
    const statusChangedAt =
      profile.statusChangedAt?.toISOString() ??
      history.items[0]?.createdAt ??
      profile.updatedAt.toISOString();

    let nextStep =
      "Continue using Hel Calafkaaga. Contact support if you need help.";
    if (profile.banned) {
      nextStep =
        "Your account is banned. You may submit an appeal if you believe this was a mistake.";
    } else if (review === "pending_review") {
      nextStep =
        "Your application is currently being reviewed. We will notify you when a decision is made.";
    } else if (review === "rejected") {
      nextStep =
        "Update your profile photo or details, then wait for another review.";
    } else if ((review as string) === "changes_requested") {
      nextStep =
        "Please update the requested profile details and resubmit for review.";
    } else if (review === "paused") {
      nextStep =
        "Your account is paused. Matching and messaging are temporarily unavailable.";
    } else if (review === "incomplete") {
      nextStep = "Complete your questionnaire and payment to continue.";
    } else if (review === "approved") {
      nextStep = "Browse matches and start conversations.";
    }

    const waitingSince =
      review === "pending_review"
        ? (profile.submittedAt ?? profile.statusChangedAt ?? profile.updatedAt)
        : null;

    return {
      currentStatus: profile.banned ? "banned" : review,
      banned: profile.banned,
      registeredAt: dbUser.createdAt.toISOString(),
      submittedAt: profile.submittedAt?.toISOString() ?? null,
      approvedAt: profile.approvedAt?.toISOString() ?? null,
      rejectedAt: profile.rejectedAt?.toISOString() ?? null,
      pausedAt: profile.pausedAt?.toISOString() ?? null,
      resumedAt: profile.resumedAt?.toISOString() ?? null,
      suspendedAt: profile.suspendedAt?.toISOString() ?? null,
      suspensionExpiresAt: profile.suspensionExpiresAt?.toISOString() ?? null,
      bannedAt: profile.bannedAt?.toISOString() ?? null,
      unbannedAt: profile.unbannedAt?.toISOString() ?? null,
      lastLoginAt: dbUser.lastLoginAt?.toISOString() ?? null,
      lastActiveAt: dbUser.lastActiveAt?.toISOString() ?? null,
      emailVerifiedAt: dbUser.emailVerificationTime?.toISOString() ?? null,
      phoneVerifiedAt: dbUser.phoneVerificationTime?.toISOString() ?? null,
      statusChangedAt,
      waitingSince: waitingSince?.toISOString() ?? null,
      /** No SLA configured in backend — do not invent a deadline. */
      reviewSlaHours: null as number | null,
      reviewSlaMessage: "Your application is currently being reviewed.",
      nextStep,
      latestPublicReason:
        history.items.find((i) => i.publicUserMessage)?.publicUserMessage ??
        null,
      appeal: appeal
        ? {
            status: appeal.status,
            submittedAt: appeal.submittedAt.toISOString(),
            reviewedAt: appeal.reviewedAt?.toISOString() ?? null,
            adminResponse: appeal.adminResponse,
          }
        : null,
      timeline: history.items,
    };
  }

  @Post("resubmit")
  @UseGuards(CsrfGuard, RateLimitGuard)
  async resubmit(@CurrentUser() user: RequestUser) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) throw new BadRequestException("Profile not found");

    const result = await this.status.transition({
      actorUserId: user.id,
      profileId: profile.id,
      event: "resubmit",
      publicUserMessage: "Profile resubmitted for review.",
    });

    if (profile.assignedReviewerId) {
      const reviewer = await this.prisma.user.findUnique({
        where: { id: profile.assignedReviewerId },
      });
      if (reviewer) {
        await this.prisma.notification.create({
          data: {
            convexId: `local_notif_resub_${profile.id}_${Date.now()}`,
            userId: reviewer.id,
            convexUserId: reviewer.convexId,
            type: "approval",
            title: "Member resubmitted profile",
            body: `${profile.name || "A member"} resubmitted their profile for review.`,
            read: false,
            notificationCreatedAt: new Date(),
          },
        });
      }
    }

    return {
      ok: true,
      reviewStatus: result.newStatus,
      resubmittedAt: result.at,
    };
  }

  @Post("appeals")
  @UseGuards(CsrfGuard, RateLimitGuard)
  async submitAppeal(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({ message: z.string().min(10).max(4000) }),
      body
    );
    const profile = await this.prisma.profile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) throw new BadRequestException("Profile not found");

    const pending = await this.prisma.accountAppeal.findFirst({
      where: { userId: user.id, status: "pending" },
    });
    if (pending) {
      throw new BadRequestException("You already have a pending appeal.");
    }

    const now = new Date();
    const appeal = await this.prisma.$transaction(async (tx) => {
      const row = await tx.accountAppeal.create({
        data: {
          userId: user.id,
          profileId: profile.id,
          message: parsed.message,
          status: "pending",
          submittedAt: now,
        },
      });
      await this.status.recordHistory(tx, {
        userId: user.id,
        profileId: profile.id,
        eventType: "appeal_submitted",
        previousStatus: profile.reviewStatus,
        newStatus: profile.reviewStatus,
        publicUserMessage: "Appeal submitted for review.",
        performedByAdminName: "You",
        createdAt: now,
        metadata: { appealId: row.id },
      });
      return row;
    });

    return {
      id: appeal.id,
      status: appeal.status,
      submittedAt: appeal.submittedAt.toISOString(),
    };
  }
}
