import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  isOwnerRole,
  isPremiumMember,
  isStaffRole,
} from "../common/access";
import { requiresAdminProfileApproval } from "../common/review-status";
import { ScoreQueueService } from "../queue/score-queue.service";
import { NotificationQueueService } from "../queue/notification-queue.service";
import { MAIL_ADAPTER } from "../auth/auth.service";
import type { MailAdapter } from "../auth/mail.adapter";
import { escapeHtml } from "../mail/html-escape";
import { AuditLogService } from "./audit-log.service";
import { DeletionService } from "./deletion.service";
import { MetricsService } from "./metrics.service";
import { MediaAccessService } from "../media/media-access.service";
import { resolveProfileMainImageUrl } from "../media/profile-image-url";
import {
  assertCanRejectTarget,
  parseLimit,
} from "./admin-auth.helpers";
import { AccountStatusService } from "./account-status.service";
import { buildAdminUserDateFilter } from "./admin-user-date-filter";
import type { ReviewStatus } from "@prisma/client";
import { normalizeEmail } from "../auth/crypto-util";
import { emailMatchWhere } from "../auth/email-identity";
import { MfaService } from "../auth/mfa.service";
import { detectEmailDomainTypo, sanitizeEmailForPlayExport } from "./play-tester-email";

const SOMALI_PHOTO_MSG =
  "Fadlan geli sawirkaaga saxda ah si uu kuu furmo. Mahadsanid.";

/** Matches frontend isPremiumMember (hasPersonalSupport or legacy $20+ payments). */
function premiumProfileWhere(): Prisma.ProfileWhereInput {
  return {
    OR: [
      { hasPersonalSupport: true },
      {
        user: {
          payments: {
            some: {
              status: "completed",
              OR: [
                {
                  paymentType: {
                    in: ["registration_premium", "premium_upgrade"],
                  },
                },
                { amount: { gte: 2000 } },
              ],
            },
          },
        },
      },
    ],
  };
}

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly deletion: DeletionService,
    private readonly metrics: MetricsService,
    private readonly scores: ScoreQueueService,
    private readonly notifQueue: NotificationQueueService,
    private readonly mediaAccess: MediaAccessService,
    private readonly accountStatus: AccountStatusService,
    private readonly config: ConfigService,
    private readonly mfa: MfaService,
    @Inject(MAIL_ADAPTER) private readonly mail: MailAdapter
  ) {}

  private appUrl(): string {
    return (
      this.config.get<string>("APP_URL") ?? "https://www.helcalafkaaga.com"
    ).replace(/\/$/, "");
  }

  private async notifyApproval(opts: {
    userId: string;
    title: string;
    body: string;
    emailCta?: { label: string; path: string };
    sendEmail?: boolean;
  }) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: opts.userId },
    });
    const notification = await this.prisma.notification.create({
      data: {
        convexId: `local_notif_${randomUUID()}`,
        userId: opts.userId,
        convexUserId: user.convexId,
        type: "approval",
        title: opts.title,
        body: opts.body,
        read: false,
        notificationCreatedAt: new Date(),
      },
    });
    if (opts.sendEmail !== false && user.email) {
      const path = opts.emailCta?.path ?? "/matches";
      const absolute =
        path.startsWith("http://") || path.startsWith("https://")
          ? path
          : `${this.appUrl()}${path.startsWith("/") ? path : `/${path}`}`;
      await this.mail.send({
        to: user.email,
        subject: opts.title,
        text: `${opts.body}\n\n${opts.emailCta?.label ?? "Open app"}: ${absolute}`,
        html: `<p>${escapeHtml(opts.body)}</p><p><a href="${escapeHtml(absolute)}">${escapeHtml(opts.emailCta?.label ?? "Open app")}</a></p>`,
      });
      await this.notifQueue.enqueueEmailStub({
        notificationId: notification.id,
        userId: opts.userId,
        type: "approval",
      });
    }
  }

  async listUsers(opts: {
    actorUserId: string;
    actorRole: "admin" | "owner";
    search?: string;
    role?: string;
    reviewStatus?: string;
    hasPaid?: boolean;
    paymentTier?: "basic" | "premium";
    gender?: "male" | "female";
    onTrial?: boolean;
    cursor?: string;
    limit?: number;
    country?: string;
    dateField?: string;
    dateFrom?: string;
    dateTo?: string;
    preset?: string;
    timeZone?: string;
    eventType?: string;
    assignedReviewerId?: string;
    waitingMoreThanHours?: number;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const pageSize = Math.min(
      Math.max(opts.pageSize ?? opts.limit ?? 50, 1),
      250
    );
    const page = Math.max(opts.page ?? 1, 1);
    const where: Prisma.ProfileWhereInput = {};
    const andClauses: Prisma.ProfileWhereInput[] = [];

    const role = opts.role?.trim();
    if (role && role !== "all") {
      where.role = role as never;
    }

    const reviewStatus = opts.reviewStatus?.trim();
    if (reviewStatus && reviewStatus !== "all") {
      if (reviewStatus === "needs_action") {
        where.reviewStatus = {
          in: ["pending_review", "rejected", "changes_requested"],
        };
      } else {
        where.reviewStatus = reviewStatus as never;
      }
    }

    if (opts.paymentTier === "premium") {
      andClauses.push(premiumProfileWhere());
    } else if (opts.paymentTier === "basic") {
      where.hasPaid = true;
      andClauses.push({ NOT: premiumProfileWhere() });
    } else if (opts.onTrial) {
      where.hasPaid = false;
      where.trialEndsAt = { gt: new Date() };
    } else if (opts.hasPaid !== undefined) {
      where.hasPaid = opts.hasPaid;
    }

    if (opts.gender === "male" || opts.gender === "female") {
      where.gender = opts.gender;
    }

    if (opts.country?.trim()) {
      where.country = { equals: opts.country.trim(), mode: "insensitive" };
    }

    if (opts.assignedReviewerId?.trim()) {
      if (opts.assignedReviewerId === "me") {
        where.assignedReviewerId = opts.actorUserId;
      } else if (opts.assignedReviewerId === "unassigned") {
        where.assignedReviewerId = null;
      } else {
        where.assignedReviewerId = opts.assignedReviewerId.trim();
      }
    }

    if (opts.waitingMoreThanHours != null && opts.waitingMoreThanHours > 0) {
      const cutoff = new Date(
        Date.now() - opts.waitingMoreThanHours * 60 * 60 * 1000
      );
      andClauses.push({
        reviewStatus: { in: ["pending_review", "changes_requested"] },
        OR: [
          { submittedAt: { lte: cutoff } },
          { submittedAt: null, createdAt: { lte: cutoff } },
        ],
      });
    }

    const dateFilter = buildAdminUserDateFilter({
      dateField: opts.dateField,
      eventType: opts.eventType,
      dateFrom: opts.dateFrom,
      dateTo: opts.dateTo,
      preset: opts.preset,
      timeZone: opts.timeZone,
    });
    if (Object.keys(dateFilter.profileWhere).length > 0) {
      andClauses.push(dateFilter.profileWhere);
    }

    if (opts.search?.trim()) {
      const q = opts.search.trim();
      // Tokens are AND'd across fields so "ahmed somalia" matches name+country.
      const tokens = q.split(/\s+/).filter((t) => t.length > 0);
      const matchToken = (token: string): Prisma.ProfileWhereInput => {
        const tLower = token.toLowerCase();
        const emailNormalized = token.includes("@")
          ? normalizeEmail(token)
          : "";
        const phoneDigits = token.replace(/[^\d+]/g, "");
        const looksLikeUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            token
          );
        const or: Prisma.ProfileWhereInput[] = [
          { name: { contains: token, mode: "insensitive" } },
          { city: { contains: token, mode: "insensitive" } },
          { country: { contains: token, mode: "insensitive" } },
          { occupation: { contains: token, mode: "insensitive" } },
          { education: { contains: token, mode: "insensitive" } },
          { waliName: { contains: token, mode: "insensitive" } },
          { user: { emailNormalized: { contains: tLower } } },
          { user: { email: { contains: token, mode: "insensitive" } } },
          { user: { name: { contains: token, mode: "insensitive" } } },
        ];
        if (looksLikeUuid) {
          or.push({ id: { equals: token } }, { userId: { equals: token } });
        }
        if (emailNormalized) {
          or.push({ user: { emailNormalized } });
          or.push({
            user: {
              email: { equals: emailNormalized, mode: "insensitive" },
            },
          });
        }
        if (phoneDigits.length >= 3) {
          or.push({ phone: { contains: phoneDigits } });
          or.push({ waliPhone: { contains: phoneDigits } });
        } else if (token.length >= 3) {
          or.push({ phone: { contains: token } });
          or.push({ waliPhone: { contains: token } });
        }
        return { OR: or };
      };

      if (tokens.length <= 1) {
        andClauses.push(matchToken(tokens[0] ?? q));
      } else {
        // Full phrase in name, OR each word matching somewhere (name/email/country/…).
        andClauses.push({
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { AND: tokens.map(matchToken) },
          ],
        });
      }
    }

    if (andClauses.length > 0) {
      where.AND = andClauses;
    }

    // Cursor mode (legacy) takes precedence over page for infinite scroll.
    if (opts.cursor) {
      where.id = { lt: opts.cursor };
    }

    const sortBy = opts.sortBy || "waiting";
    const sortOrder = opts.sortOrder === "asc" ? "asc" : "desc";
    let orderBy: Prisma.ProfileOrderByWithRelationInput[] = [{ id: "desc" }];
    if (sortBy === "registered") {
      orderBy = [{ user: { createdAt: sortOrder } }, { id: sortOrder }];
    } else if (sortBy === "submitted") {
      orderBy = [{ submittedAt: sortOrder }, { id: sortOrder }];
    } else if (sortBy === "statusChanged") {
      orderBy = [{ statusChangedAt: sortOrder }, { id: sortOrder }];
    } else if (sortBy === "name") {
      orderBy = [{ name: sortOrder }, { id: sortOrder }];
    } else if (sortBy === "waiting" || reviewStatus === "pending_review") {
      orderBy = [
        { submittedAt: "asc" },
        { createdAt: "asc" },
        { id: "asc" },
      ];
    }

    const fetchLimit = opts.cursor
      ? reviewStatus === "needs_action"
        ? Math.min(pageSize * 3, 150)
        : pageSize + 1
      : undefined;

    const [total, rows] = await Promise.all([
      this.prisma.profile.count({ where }),
      this.prisma.profile.findMany({
        where,
        orderBy,
        ...(opts.cursor
          ? { take: fetchLimit }
          : { skip: (page - 1) * pageSize, take: pageSize }),
        include: {
          user: {
            select: {
              email: true,
              id: true,
              convexId: true,
              createdAt: true,
              lastActiveAt: true,
              lastLoginAt: true,
            },
          },
        },
      }),
    ]);

    const filtered =
      reviewStatus === "needs_action"
        ? rows.filter((p) => requiresAdminProfileApproval(p))
        : rows;

    const hasMore = opts.cursor
      ? reviewStatus === "needs_action"
        ? filtered.length > pageSize
        : rows.length > pageSize
      : page * pageSize < total;
    const pageRows = opts.cursor
      ? filtered.slice(0, pageSize)
      : filtered;

    const reviewerIds = [
      ...new Set(
        pageRows
          .map((p) => p.assignedReviewerId)
          .filter((id): id is string => !!id)
      ),
    ];
    const reviewers =
      reviewerIds.length > 0
        ? await this.prisma.profile.findMany({
            where: { userId: { in: reviewerIds } },
            select: { userId: true, name: true },
          })
        : [];
    const reviewerName = new Map(reviewers.map((r) => [r.userId, r.name]));

    const items = await Promise.all(
      pageRows.map(async (p) => {
        const paidAgg = await this.prisma.payment.aggregate({
          where: { userId: p.userId, status: "completed" },
          _sum: { amount: true },
        });
        const imageUrl = await resolveProfileMainImageUrl(
          this.prisma,
          this.mediaAccess,
          p,
          { userId: opts.actorUserId, roles: [opts.actorRole] }
        );
        const waitingSince = p.submittedAt ?? p.user.createdAt;
        const waitingMs = Date.now() - waitingSince.getTime();
        return {
          _id: p.id,
          id: p.id,
          userId: p.userId,
          name: p.name,
          // Full email for staff search / support (detail already returns unmasked).
          email: p.user.email,
          gender: p.gender,
          role: p.role,
          hasPaid: p.hasPaid,
          hasPersonalSupport: p.hasPersonalSupport,
          approved: p.approved,
          banned: p.banned,
          reviewStatus: p.reviewStatus,
          questionnaireComplete: p.questionnaireComplete,
          profileImageId: p.profileImageMediaId ?? p.profileImageConvexId,
          profileImageMediaId: p.profileImageMediaId,
          imageUrl,
          phone: p.phone,
          paidCents: paidAgg._sum.amount ?? 0,
          country: p.country,
          city: p.city,
          registeredAt: p.user.createdAt.toISOString(),
          submittedAt: p.submittedAt?.toISOString() ?? null,
          approvedAt: p.approvedAt?.toISOString() ?? null,
          rejectedAt: p.rejectedAt?.toISOString() ?? null,
          statusChangedAt: p.statusChangedAt?.toISOString() ?? null,
          lastActiveAt: p.user.lastActiveAt?.toISOString() ?? null,
          assignedReviewerId: p.assignedReviewerId,
          assignedReviewerName: p.assignedReviewerId
            ? reviewerName.get(p.assignedReviewerId) ?? null
            : null,
          assignedReviewerAt: p.assignedReviewerAt?.toISOString() ?? null,
          waitingSince: waitingSince.toISOString(),
          waitingMs,
          updatedAt: p.updatedAt.toISOString(),
        };
      })
    );

    const summaryCounts = {
      total,
      pending_review: await this.prisma.profile.count({
        where: { ...where, reviewStatus: "pending_review" },
      }),
      changes_requested: await this.prisma.profile.count({
        where: { ...where, reviewStatus: "changes_requested" },
      }),
      rejected: await this.prisma.profile.count({
        where: { ...where, reviewStatus: "rejected" },
      }),
      approved: await this.prisma.profile.count({
        where: { ...where, reviewStatus: "approved", banned: false },
      }),
      banned: await this.prisma.profile.count({
        where: { ...where, banned: true },
      }),
      paused: await this.prisma.profile.count({
        where: { ...where, reviewStatus: "paused" },
      }),
    };

    return {
      items,
      records: items,
      total,
      page,
      pageSize,
      nextCursor: hasMore ? pageRows[pageRows.length - 1]?.id ?? null : null,
      appliedFilters: {
        role: role ?? null,
        reviewStatus: reviewStatus ?? null,
        hasPaid: opts.hasPaid ?? null,
        paymentTier: opts.paymentTier ?? null,
        gender: opts.gender ?? null,
        onTrial: opts.onTrial ?? null,
        country: opts.country ?? null,
        assignedReviewerId: opts.assignedReviewerId ?? null,
        ...dateFilter.applied,
        sortBy,
        sortOrder,
      },
      summaryCounts,
    };
  }

  async getUserDetail(profileId: string, actorUserId: string, actorRole: "admin" | "owner") {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      include: {
        user: {
          select: {
            email: true,
            id: true,
            convexId: true,
            mfaEnabled: true,
            mfaEnabledAt: true,
          },
        },
      },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    const preferences = await this.prisma.preference.findUnique({
      where: { userId: profile.userId },
    });
    const paidAgg = await this.prisma.payment.aggregate({
      where: { userId: profile.userId, status: "completed" },
      _sum: { amount: true },
    });
    const imageUrl = await resolveProfileMainImageUrl(
      this.prisma,
      this.mediaAccess,
      profile,
      { userId: actorUserId, roles: [actorRole] }
    );
    return {
      profile: {
        ...profile,
        _id: profile.id,
        email: profile.user.email,
        paidCents: paidAgg._sum.amount ?? 0,
        profileImageId: profile.profileImageMediaId ?? profile.profileImageConvexId,
        profileImageMediaId: profile.profileImageMediaId,
        imageUrl,
        mfaEnabled: profile.user.mfaEnabled === true,
        mfaEnabledAt: profile.user.mfaEnabledAt?.toISOString() ?? null,
        user: undefined,
      },
      preferences,
    };
  }

  /**
   * L4: reset staff MFA by profile id (same :id convention as ban/approve).
   * Authorization uses H4 hierarchy inside MfaService.adminResetMfa.
   */
  async resetUserMfa(
    actorUserId: string,
    actorRole: "admin" | "owner",
    profileId: string,
    ip?: string
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { userId: true, role: true },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    return this.mfa.adminResetMfa({
      actorUserId,
      actorRole,
      targetUserId: profile.userId,
      ip,
    });
  }

  async getUserActivity(
    profileId: string,
    opts?: { messageLimit?: number; likeLimit?: number }
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    const messageLimit = Math.min(Math.max(opts?.messageLimit ?? 50, 1), 100);
    const likeLimit = Math.min(Math.max(opts?.likeLimit ?? 40, 1), 80);

    const messages = await this.prisma.message.findMany({
      where: { senderId: profile.userId },
      orderBy: { messageCreatedAt: "desc" },
      take: messageLimit,
      select: {
        id: true,
        body: true,
        imageMediaId: true,
        messageCreatedAt: true,
        conversationId: true,
      },
    });

    const conversationIds = [...new Set(messages.map((m) => m.conversationId))];
    const conversations =
      conversationIds.length > 0
        ? await this.prisma.conversation.findMany({
            where: { id: { in: conversationIds } },
            select: {
              id: true,
              match: { select: { userAId: true, userBId: true } },
            },
          })
        : [];
    const peerByConversation = new Map<string, string>();
    for (const c of conversations) {
      const peerId =
        c.match.userAId === profile.userId ? c.match.userBId : c.match.userAId;
      peerByConversation.set(c.id, peerId);
    }

    const likesGivenRaw = await this.prisma.like.findMany({
      where: { fromUserId: profile.userId, action: "like" },
      take: likeLimit,
      orderBy: { createdAt: "desc" },
    });
    const likesReceivedRaw = await this.prisma.like.findMany({
      where: { toUserId: profile.userId, action: "like" },
      take: likeLimit,
      orderBy: { createdAt: "desc" },
    });

    const peerUserIds = [
      ...peerByConversation.values(),
      ...likesGivenRaw.map((l) => l.toUserId),
      ...likesReceivedRaw.map((l) => l.fromUserId),
    ];
    const peerProfiles =
      peerUserIds.length > 0
        ? await this.prisma.profile.findMany({
            where: { userId: { in: [...new Set(peerUserIds)] } },
            select: { id: true, userId: true, name: true },
          })
        : [];
    const peerByUserId = new Map(
      peerProfiles.map((p) => [p.userId, { profileId: p.id, name: p.name }])
    );

    const matches = await this.prisma.match.findMany({
      where: {
        OR: [{ userAId: profile.userId }, { userBId: profile.userId }],
        status: "active",
      },
      take: 40,
    });

    const enrichedMessages = messages.map((m) => {
      const peerUserId = peerByConversation.get(m.conversationId);
      const peer = peerUserId ? peerByUserId.get(peerUserId) : undefined;
      return {
        id: m.id,
        direction: "sent" as const,
        body: m.body?.trim() || (m.imageMediaId ? "[Image]" : ""),
        hasImage: Boolean(m.imageMediaId),
        createdAt: m.messageCreatedAt.toISOString(),
        peerName: peer?.name ?? "Unknown",
        peerProfileId: peer?.profileId ?? null,
      };
    });

    const likesGiven = likesGivenRaw.map((like) => {
      const peer = peerByUserId.get(like.toUserId);
      return {
        id: like.id,
        action: like.action,
        peerName: peer?.name ?? "Unknown",
        peerProfileId: peer?.profileId ?? null,
      };
    });
    const likesReceived = likesReceivedRaw.map((like) => {
      const peer = peerByUserId.get(like.fromUserId);
      return {
        id: like.id,
        action: like.action,
        peerName: peer?.name ?? "Unknown",
        peerProfileId: peer?.profileId ?? null,
      };
    });

    return {
      messages: enrichedMessages,
      likesGiven,
      likesReceived,
      activeMatches: matches.length,
      messageCount: enrichedMessages.length,
      likesGivenCount: likesGiven.length,
      likesReceivedCount: likesReceived.length,
    };
  }

  async approveUser(
    actorUserId: string,
    profileId: string,
    opts?: { expectedUpdatedAt?: string }
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    this.assertExpectedUpdatedAt(profile.updatedAt, opts?.expectedUpdatedAt);

    if (
      profile.reviewStatus === "approved" ||
      (profile.approved &&
        profile.reviewStatus !== "rejected" &&
        profile.reviewStatus !== "paused" &&
        profile.reviewStatus !== "changes_requested" &&
        !profile.banned)
    ) {
      if (profile.reviewStatus !== "approved") {
        await this.accountStatus.transition({
          actorUserId,
          profileId,
          event: "approve",
          publicUserMessage:
            "Your profile was approved. You can now browse matches and connect with members.",
        });
      }
      return { ok: true, alreadyApproved: true };
    }

    const result = await this.accountStatus.transition({
      actorUserId,
      profileId,
      event: "approve",
      publicUserMessage:
        "Your profile was approved. You can now browse matches and connect with members.",
    });

    await this.prisma.profile.update({
      where: { id: profileId },
      data: {
        reviewCompletedAt: new Date(),
        assignedReviewerId: actorUserId,
        assignedReviewerAt: new Date(),
      },
    });

    await this.notifyApproval({
      userId: profile.userId,
      title: "Profile approved",
      body: "Your profile was approved. You can now browse matches and connect with members.",
      sendEmail: true,
    });
    await this.scores.enqueueUserRecalculation(profile.userId, "admin_approve");
    return { ...result, ok: true as const };
  }

  async rejectUser(
    actorUserId: string,
    profileId: string,
    opts?: {
      reason?: string;
      publicUserMessage?: string;
      internalAdminNote?: string;
      allowResubmission?: boolean;
      requestPhoto?: boolean;
      expectedUpdatedAt?: string;
    }
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    assertCanRejectTarget(profile.role);
    this.assertExpectedUpdatedAt(profile.updatedAt, opts?.expectedUpdatedAt);

    const body =
      opts?.publicUserMessage?.trim() ||
      opts?.reason?.trim() ||
      SOMALI_PHOTO_MSG;
    const result = await this.accountStatus.transition({
      actorUserId,
      profileId,
      event: "reject",
      reason: opts?.reason?.trim(),
      internalAdminNote: opts?.internalAdminNote,
      publicUserMessage: body,
    });

    await this.prisma.profile.update({
      where: { id: profileId },
      data: {
        allowResubmission: opts?.allowResubmission ?? true,
        reviewCompletedAt: new Date(),
      },
    });

    await this.notifyApproval({
      userId: profile.userId,
      title: "Sawirka profile-ka",
      body,
      emailCta: { label: "Cusboonaysii sawirka", path: "/profile" },
      sendEmail: true,
    });

    if (opts?.requestPhoto) {
      await this.requestProfilePhoto(actorUserId, profileId);
    }

    return { ...result, ok: true as const };
  }

  async banUser(
    actorUserId: string,
    profileId: string,
    banned: boolean,
    opts?: { reason?: string; internalAdminNote?: string }
  ) {
    const result = await this.accountStatus.transition({
      actorUserId,
      profileId,
      event: banned ? "ban" : "unban",
      reason: opts?.reason,
      internalAdminNote: opts?.internalAdminNote,
      publicUserMessage: banned
        ? opts?.reason || "Your account has been banned."
        : opts?.reason || "Your account ban has been lifted.",
    });
    return { ...result, ok: true as const, banned };
  }

  async pauseUser(
    actorUserId: string,
    profileId: string,
    opts?: { reason?: string; publicUserMessage?: string }
  ) {
    return this.accountStatus.transition({
      actorUserId,
      profileId,
      event: "pause",
      reason: opts?.reason,
      publicUserMessage:
        opts?.publicUserMessage ||
        opts?.reason ||
        "Your account has been paused. Matching and messaging are temporarily unavailable.",
    });
  }

  async resumeUser(
    actorUserId: string,
    profileId: string,
    opts?: { reason?: string }
  ) {
    return this.accountStatus.transition({
      actorUserId,
      profileId,
      event: "resume",
      reason: opts?.reason,
      publicUserMessage:
        opts?.reason || "Your account has been resumed.",
    });
  }

  async suspendUser(
    actorUserId: string,
    profileId: string,
    opts: {
      reason?: string;
      suspensionExpiresAt?: string | Date | null;
      publicUserMessage?: string;
    }
  ) {
    const expires =
      opts.suspensionExpiresAt == null || opts.suspensionExpiresAt === ""
        ? null
        : new Date(opts.suspensionExpiresAt);
    if (expires && Number.isNaN(expires.getTime())) {
      throw new BadRequestException("Invalid suspensionExpiresAt");
    }
    return this.accountStatus.transition({
      actorUserId,
      profileId,
      event: "suspend",
      reason: opts.reason,
      suspensionExpiresAt: expires,
      publicUserMessage:
        opts.publicUserMessage ||
        opts.reason ||
        "Your account has been temporarily suspended.",
    });
  }

  async unsuspendUser(actorUserId: string, profileId: string, reason?: string) {
    return this.accountStatus.transition({
      actorUserId,
      profileId,
      event: "unsuspend",
      reason,
      publicUserMessage: reason || "Your temporary suspension has ended.",
    });
  }

  private assertExpectedUpdatedAt(
    actual: Date,
    expectedUpdatedAt?: string
  ) {
    if (!expectedUpdatedAt) return;
    const expectedMs = Date.parse(expectedUpdatedAt);
    if (Number.isNaN(expectedMs)) {
      throw new BadRequestException("Invalid expectedUpdatedAt");
    }
    if (actual.getTime() !== expectedMs) {
      throw new ConflictException(
        "This account was updated by another admin. Refresh and try again."
      );
    }
  }

  async requestChanges(
    actorUserId: string,
    profileId: string,
    opts: {
      whatMustChange: string;
      publicInstructions: string;
      internalAdminNote?: string;
      deadlineAt?: string | null;
      requireNewPhoto?: boolean;
      expectedUpdatedAt?: string;
    }
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    assertCanRejectTarget(profile.role);
    this.assertExpectedUpdatedAt(profile.updatedAt, opts.expectedUpdatedAt);

    const publicMsg =
      opts.publicInstructions.trim() ||
      opts.whatMustChange.trim() ||
      "Please update your profile and resubmit.";

    const result = await this.accountStatus.transition({
      actorUserId,
      profileId,
      event: "request_changes",
      reason: opts.whatMustChange.trim(),
      publicUserMessage: publicMsg,
      internalAdminNote: opts.internalAdminNote,
      changesDeadlineAt: opts.deadlineAt
        ? new Date(opts.deadlineAt)
        : null,
      requireNewPhoto: opts.requireNewPhoto,
      allowResubmission: true,
      metadata: {
        whatMustChange: opts.whatMustChange.trim(),
        requireNewPhoto: !!opts.requireNewPhoto,
      },
    });

    await this.notifyApproval({
      userId: profile.userId,
      title: "Profile changes requested",
      body: publicMsg,
      emailCta: { label: "Update profile", path: "/profile" },
      sendEmail: true,
    });

    if (opts.requireNewPhoto) {
      await this.requestProfilePhoto(actorUserId, profileId, publicMsg);
    }

    return { ...result, ok: true as const };
  }

  async assignReviewer(
    actorUserId: string,
    profileId: string,
    opts: {
      action: "assign_me" | "reassign" | "release";
      reviewerUserId?: string;
      expectedUpdatedAt?: string;
    }
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    this.assertExpectedUpdatedAt(profile.updatedAt, opts.expectedUpdatedAt);

    const now = new Date();
    let assignedReviewerId: string | null = null;
    if (opts.action === "assign_me") {
      assignedReviewerId = actorUserId;
    } else if (opts.action === "reassign") {
      if (!opts.reviewerUserId?.trim()) {
        throw new BadRequestException("reviewerUserId is required to reassign");
      }
      assignedReviewerId = opts.reviewerUserId.trim();
    } else {
      assignedReviewerId = null;
    }

    const updated = await this.prisma.profile.update({
      where: { id: profileId },
      data: {
        assignedReviewerId,
        assignedReviewerAt: assignedReviewerId ? now : null,
        reviewStartedAt:
          opts.action === "assign_me" || opts.action === "reassign"
            ? now
            : profile.reviewStartedAt,
      },
    });

    await this.prisma.$transaction(async (tx) => {
      await this.accountStatus.recordHistory(tx, {
        userId: profile.userId,
        profileId: profile.id,
        eventType: "reviewer_assigned",
        previousStatus: profile.reviewStatus,
        newStatus: profile.reviewStatus,
        reason:
          opts.action === "release"
            ? "Reviewer released"
            : opts.action === "assign_me"
              ? "Assigned to self"
              : "Reassigned",
        performedByAdminId: actorUserId,
        performedByAdminName: undefined,
        metadata: {
          action: opts.action,
          assignedReviewerId,
        },
      });
    });

    await this.audit.write({
      actorUserId,
      action: "REVIEWER_ASSIGNED",
      targetUserId: profile.userId,
      targetProfileId: profileId,
      metadata: { action: opts.action, assignedReviewerId },
    });

    return {
      ok: true as const,
      assignedReviewerId: updated.assignedReviewerId,
      assignedReviewerAt: updated.assignedReviewerAt?.toISOString() ?? null,
      reviewStartedAt: updated.reviewStartedAt?.toISOString() ?? null,
    };
  }

  async bulkApprove(
    actorUserId: string,
    profileIds: string[],
    opts?: { expectedUpdatedAtById?: Record<string, string> }
  ) {
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of profileIds.slice(0, 50)) {
      try {
        await this.approveUser(actorUserId, id, {
          expectedUpdatedAt: opts?.expectedUpdatedAtById?.[id],
        });
        results.push({ id, ok: true });
      } catch (e) {
        results.push({
          id,
          ok: false,
          error: e instanceof Error ? e.message : "Failed",
        });
      }
    }
    return { results };
  }

  async bulkReject(
    actorUserId: string,
    profileIds: string[],
    opts: {
      reason: string;
      publicUserMessage: string;
      internalAdminNote?: string;
      expectedUpdatedAtById?: Record<string, string>;
    }
  ) {
    if (!opts.publicUserMessage?.trim()) {
      throw new BadRequestException("publicUserMessage is required for bulk reject");
    }
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of profileIds.slice(0, 50)) {
      try {
        await this.rejectUser(actorUserId, id, {
          reason: opts.reason,
          publicUserMessage: opts.publicUserMessage,
          internalAdminNote: opts.internalAdminNote,
          expectedUpdatedAt: opts.expectedUpdatedAtById?.[id],
        });
        results.push({ id, ok: true });
      } catch (e) {
        results.push({
          id,
          ok: false,
          error: e instanceof Error ? e.message : "Failed",
        });
      }
    }
    return { results };
  }

  async getStatusHistory(profileId: string, opts?: { limit?: number }) {
    return this.accountStatus.listHistory({
      profileId,
      limit: opts?.limit,
      publicOnly: false,
    });
  }

  async requestProfilePhoto(
    actorUserId: string,
    profileId: string,
    message?: string
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    if (isStaffRole(profile.role)) {
      throw new ForbiddenException(
        "Cannot request a photo from a staff account"
      );
    }
    const body = message?.trim() || SOMALI_PHOTO_MSG;
    await this.notifyApproval({
      userId: profile.userId,
      title: "Sawirka profile-ka",
      body,
      emailCta: { label: "Cusboonaysii sawirka", path: "/profile" },
      sendEmail: true,
    });
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: profile.userId },
    });
    await this.prisma.memberEmailLog.create({
      data: {
        convexId: `local_mel_${randomUUID()}`,
        userId: profile.userId,
        convexUserId: user.convexId,
        kind: "request_profile_photo",
        sentAt: new Date(),
      },
    });
    await this.audit.write({
      actorUserId,
      action: "request_profile_photo",
      targetUserId: profile.userId,
      targetProfileId: profileId,
    });
    return { ok: true };
  }

  async setAdvisorReviewed(
    actorUserId: string,
    profileId: string,
    advisorReviewed: boolean
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    if (!isPremiumMember(profile)) {
      throw new BadRequestException(
        "Advisor review is only for premium members"
      );
    }
    await this.prisma.profile.update({
      where: { id: profileId },
      data: { advisorReviewed },
    });
    return { ok: true };
  }

  /** Owner-only: demote to user. Cannot promote to admin (invites only). */
  async setUserRole(
    actorUserId: string,
    profileId: string,
    role: "user" | "admin"
  ) {
    const actor = await this.prisma.profile.findUnique({
      where: { userId: actorUserId },
    });
    if (!actor || !isOwnerRole(actor.role)) {
      throw new ForbiddenException(
        "Only the owner can manage admin roles."
      );
    }

    const target = await this.prisma.profile.findUnique({
      where: { id: profileId },
    });
    if (!target) throw new NotFoundException("Profile not found.");
    if (isOwnerRole(target.role)) {
      throw new ForbiddenException("The owner role cannot be changed.");
    }
    if (role === "admin") {
      throw new BadRequestException(
        "Admins must be invited. Use Invite admin on the Users tab."
      );
    }
    if (target.userId === actorUserId) {
      throw new ForbiddenException("You cannot demote yourself.");
    }
    if (target.role === role) return { ok: true };

    await this.prisma.profile.update({
      where: { id: profileId },
      data: { role },
    });
    await this.audit.write({
      actorUserId,
      action: "set_role",
      targetUserId: target.userId,
      targetProfileId: profileId,
      metadata: { role },
    });
    return { ok: true };
  }

  async deleteUser(
    actorUserId: string,
    profileId: string,
    opts?: { dryRun?: boolean; correlationId?: string; requestId?: string }
  ) {
    if (opts?.dryRun) {
      return this.deletion.dryRun(
        actorUserId,
        profileId,
        opts.correlationId
      );
    }
    const result = await this.deletion.execute(actorUserId, profileId, {
      correlationId: opts?.correlationId,
      requestId: opts?.requestId,
    });
    try {
      await this.metrics.scheduleRebuild();
    } catch {
      // Member is already deleted; metrics rebuild must not fail the request.
    }
    return result;
  }

  /**
   * List / fix / delete member accounts with known fake email domains
   * (@gmail.come, @gmail.con, …). Owner only — returns PII. Staff never touched.
   */
  async purgeTypoEmails(
    actorUserId: string,
    opts: {
      mode: "dry-run" | "fix" | "delete";
      confirm?: string;
    }
  ) {
    const actor = await this.prisma.profile.findUnique({
      where: { userId: actorUserId },
      select: { role: true },
    });
    if (!actor || !isOwnerRole(actor.role)) {
      throw new ForbiddenException("Only the owner can manage typo-email accounts");
    }
    if (opts.mode === "fix" && opts.confirm !== "FIX_TYPO_EMAILS") {
      throw new BadRequestException('confirm must be "FIX_TYPO_EMAILS"');
    }
    if (opts.mode === "delete" && opts.confirm !== "DELETE_TYPO_EMAILS") {
      throw new BadRequestException('confirm must be "DELETE_TYPO_EMAILS"');
    }

    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [{ email: { not: null } }, { emailNormalized: { not: null } }],
      },
      select: {
        id: true,
        email: true,
        emailNormalized: true,
        profile: {
          select: {
            id: true,
            name: true,
            role: true,
            hasPaid: true,
            banned: true,
          },
        },
      },
    });

    const hits: Array<{
      userId: string;
      profileId: string;
      name: string | null;
      hasPaid: boolean;
      original: string;
      fixed: string;
    }> = [];

    for (const u of users) {
      const raw = (u.emailNormalized || u.email || "").trim();
      if (!raw) continue;
      const typo = detectEmailDomainTypo(raw);
      if (!typo) continue;
      if (!u.profile || isStaffRole(u.profile.role)) continue;
      hits.push({
        userId: u.id,
        profileId: u.profile.id,
        name: u.profile.name,
        hasPaid: u.profile.hasPaid,
        original: typo.original,
        fixed: typo.fixed,
      });
    }

    if (opts.mode === "dry-run") {
      return {
        mode: "dry-run" as const,
        count: hits.length,
        paidCount: hits.filter((h) => h.hasPaid).length,
        items: hits,
      };
    }

    if (opts.mode === "fix") {
      let fixed = 0;
      let conflicts = 0;
      for (const h of hits) {
        const taken = await this.prisma.user.findFirst({
          where: {
            id: { not: h.userId },
            OR: [
              { emailNormalized: h.fixed },
              { email: { equals: h.fixed, mode: "insensitive" } },
            ],
          },
          select: { id: true },
        });
        if (taken) {
          conflicts += 1;
          continue;
        }
        await this.prisma.user.update({
          where: { id: h.userId },
          data: { email: h.fixed, emailNormalized: h.fixed },
        });
        await this.prisma.authAccount.updateMany({
          where: {
            userId: h.userId,
            provider: "password",
            providerAccountId: {
              equals: h.original,
              mode: "insensitive",
            },
          },
          data: { providerAccountId: h.fixed },
        });
        fixed += 1;
      }
      await this.audit.write({
        actorUserId,
        action: "purge_typo_emails_fix",
        metadata: { fixed, conflicts, scanned: hits.length },
      });
      return { mode: "fix" as const, fixed, conflicts, count: hits.length };
    }

    // delete
    let deleted = 0;
    const errors: string[] = [];
    for (const h of hits) {
      try {
        await this.deletion.execute(actorUserId, h.profileId);
        deleted += 1;
      } catch (e) {
        errors.push(
          `${h.original}: ${e instanceof Error ? e.message : "failed"}`
        );
      }
    }
    await this.metrics.scheduleRebuild();
    await this.audit.write({
      actorUserId,
      action: "purge_typo_emails_delete",
      metadata: { deleted, errors: errors.slice(0, 20), scanned: hits.length },
    });
    return {
      mode: "delete" as const,
      deleted,
      errors,
      count: hits.length,
    };
  }

  /**
   * Export unique member emails (role=user) for Play Console tester invites.
   * Owner-only. Fixes common Gmail domain typos and drops still-invalid addresses.
   * Every export is audit-logged (count only — not the email list).
   */
  async exportMemberEmails(
    actorUserId: string,
    confirm: "EXPORT_MEMBER_EMAILS"
  ): Promise<{
    emails: string[];
    count: number;
    skipped: number;
    fixed: number;
  }> {
    if (confirm !== "EXPORT_MEMBER_EMAILS") {
      throw new BadRequestException('confirm must be "EXPORT_MEMBER_EMAILS"');
    }
    const actor = await this.prisma.profile.findUnique({
      where: { userId: actorUserId },
      select: { role: true },
    });
    if (!actor || !isOwnerRole(actor.role)) {
      throw new ForbiddenException("Only the owner can export member emails");
    }

    const rows = await this.prisma.profile.findMany({
      where: {
        role: "user",
        banned: false,
        user: { deletedAt: null },
      },
      select: {
        user: { select: { email: true, emailNormalized: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const seen = new Set<string>();
    const emails: string[] = [];
    let skipped = 0;
    let fixed = 0;

    for (const row of rows) {
      const raw = (row.user.email ?? row.user.emailNormalized ?? "").trim();
      if (!raw) {
        skipped += 1;
        continue;
      }
      const cleaned = sanitizeEmailForPlayExport(raw);
      if (!cleaned) {
        skipped += 1;
        continue;
      }
      if (cleaned !== raw.trim().toLowerCase()) fixed += 1;
      if (seen.has(cleaned)) continue;
      seen.add(cleaned);
      emails.push(cleaned);
    }

    emails.sort((a, b) => a.localeCompare(b));

    await this.audit.write({
      actorUserId,
      action: "export_member_emails",
      metadata: {
        count: emails.length,
        skipped,
        fixed,
      },
    });

    return { emails, count: emails.length, skipped, fixed };
  }

  /**
   * Resolve why an email blocks signup even when Members search looks empty.
   * Checks User + password AuthAccount (same as register), not only Profile.
   */
  async lookupEmailIdentity(email: string) {
    const emailNormalized = normalizeEmail(email);
    if (!emailNormalized || !emailNormalized.includes("@")) {
      throw new BadRequestException("Enter a valid email address");
    }

    const users = await this.prisma.user.findMany({
      where: emailMatchWhere(emailNormalized),
      select: {
        id: true,
        email: true,
        emailNormalized: true,
        name: true,
        deletedAt: true,
        createdAt: true,
        profile: {
          select: {
            id: true,
            name: true,
            role: true,
            banned: true,
            reviewStatus: true,
            hasPaid: true,
            registrationComplete: true,
            questionnaireComplete: true,
            gender: true,
          },
        },
        authAccounts: {
          select: {
            id: true,
            provider: true,
            providerAccountId: true,
          },
        },
      },
      take: 20,
    });

    const passwordAccounts = await this.prisma.authAccount.findMany({
      where: {
        provider: "password",
        providerAccountId: {
          equals: emailNormalized,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        userId: true,
        providerAccountId: true,
        user: {
          select: {
            id: true,
            email: true,
            emailNormalized: true,
            deletedAt: true,
            profile: { select: { id: true, name: true } },
          },
        },
      },
      take: 20,
    });

    const blocksSignup = users.length > 0 || passwordAccounts.length > 0;
    const orphans = users.filter((u) => !u.profile);

    return {
      emailNormalized,
      found: blocksSignup,
      blocksSignup,
      userCount: users.length,
      passwordAccountCount: passwordAccounts.length,
      orphanUserCount: orphans.length,
      users: users.map((u) => ({
        userId: u.id,
        email: u.email,
        emailNormalized: u.emailNormalized,
        name: u.name,
        deletedAt: u.deletedAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
        hasProfile: !!u.profile,
        profileId: u.profile?.id ?? null,
        profileName: u.profile?.name ?? null,
        role: u.profile?.role ?? null,
        banned: u.profile?.banned ?? false,
        reviewStatus: u.profile?.reviewStatus ?? null,
        hasPaid: u.profile?.hasPaid ?? false,
        authProviders: u.authAccounts.map((a) => a.provider),
      })),
      passwordAccounts: passwordAccounts.map((a) => ({
        authAccountId: a.id,
        userId: a.userId,
        providerAccountId: a.providerAccountId,
        userEmail: a.user.email,
        hasProfile: !!a.user.profile,
        profileId: a.user.profile?.id ?? null,
        deletedAt: a.user.deletedAt?.toISOString() ?? null,
      })),
      hint: !blocksSignup
        ? "No auth identity found — this email should be free to register."
        : orphans.length > 0
          ? "Email is taken by a User with no Profile (hidden from All members). Free it with “Release email” or open the profile if one exists."
          : "Email is taken. Open the profile below — it may use a placeholder name like “User”." ,
    };
  }

  /** Hard-delete a User that has no Profile so the email can register again. */
  async releaseOrphanEmail(actorUserId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: { select: { id: true, role: true } },
        authAccounts: { select: { id: true, provider: true } },
      },
    });
    if (!user) throw new NotFoundException("User not found");
    if (user.profile) {
      throw new BadRequestException(
        "This account has a profile. Delete it from the member detail page instead."
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.session.deleteMany({ where: { userId } });
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      await tx.emailVerificationToken.deleteMany({ where: { userId } });
      await tx.authAuditEvent.deleteMany({ where: { userId } });
      await tx.accountStatusHistory.deleteMany({ where: { userId } });
      await tx.accountAppeal.deleteMany({ where: { userId } });
      await tx.photoReveal.deleteMany({
        where: { OR: [{ viewerUserId: userId }, { ownerUserId: userId }] },
      });
      await tx.auditLog.deleteMany({ where: { actorUserId: userId } });
      await tx.preference.deleteMany({ where: { userId } });
      await tx.authAccount.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });

    await this.audit.write({
      actorUserId,
      action: "release_orphan_email",
      targetUserId: userId,
      metadata: {
        email: user.email,
        emailNormalized: user.emailNormalized,
      },
    });
    await this.metrics.scheduleRebuild();
    return {
      ok: true,
      releasedEmail: user.emailNormalized ?? user.email,
    };
  }
}
