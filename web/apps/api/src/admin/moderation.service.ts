import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { isStaffRole } from "../common/access";
import { AuditLogService } from "./audit-log.service";
import { parseLimit } from "./admin-auth.helpers";

export const REPORT_REASONS = [
  "fake_profile",
  "inappropriate",
  "harassment",
  "spam",
  "other",
] as const;

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService
  ) {}

  private async unmatchBetweenUsers(userA: string, userB: string) {
    const matches = await this.prisma.match.findMany({
      where: {
        OR: [
          { userAId: userA, userBId: userB },
          { userAId: userB, userBId: userA },
        ],
        status: { in: ["active", "archived"] },
      },
    });
    for (const match of matches) {
      await this.prisma.match.update({
        where: { id: match.id },
        data: { status: "unmatched", chatUnlocked: false },
      });
    }
  }

  async blockUser(blockerId: string, blockedUserId: string) {
    if (blockerId === blockedUserId) {
      throw new BadRequestException("You cannot block yourself");
    }
    const target = await this.prisma.profile.findUnique({
      where: { userId: blockedUserId },
    });
    if (!target) throw new NotFoundException("User not found");
    if (isStaffRole(target.role)) {
      throw new ForbiddenException("You cannot block staff accounts");
    }

    const blocker = await this.prisma.user.findUniqueOrThrow({
      where: { id: blockerId },
    });
    const blocked = await this.prisma.user.findUniqueOrThrow({
      where: { id: blockedUserId },
    });

    const existing = await this.prisma.block.findUnique({
      where: {
        blockerId_blockedId: { blockerId, blockedId: blockedUserId },
      },
    });
    if (!existing) {
      await this.prisma.block.create({
        data: {
          convexId: `local_block_${randomUUID()}`,
          blockerId,
          blockedId: blockedUserId,
          convexBlockerId: blocker.convexId,
          convexBlockedId: blocked.convexId,
          blockedAt: new Date(),
        },
      });
    }

    await this.unmatchBetweenUsers(blockerId, blockedUserId);

    const like = await this.prisma.like.findUnique({
      where: {
        fromUserId_toUserId: { fromUserId: blockerId, toUserId: blockedUserId },
      },
    });
    if (like) {
      await this.prisma.like.update({
        where: { id: like.id },
        data: { action: "pass" },
      });
    } else {
      await this.prisma.like.create({
        data: {
          convexId: `local_like_${randomUUID()}`,
          fromUserId: blockerId,
          toUserId: blockedUserId,
          convexFromUserId: blocker.convexId,
          convexToUserId: blocked.convexId,
          action: "pass",
        },
      });
    }

    return { blocked: true };
  }

  async unblockUser(blockerId: string, blockedUserId: string) {
    await this.prisma.block.deleteMany({
      where: { blockerId, blockedId: blockedUserId },
    });
    return { unblocked: true };
  }

  async listMyBlocks(userId: string) {
    const blocks = await this.prisma.block.findMany({
      where: { blockerId: userId },
      orderBy: { blockedAt: "desc" },
    });
    return Promise.all(
      blocks.map(async (b) => {
        const profile = await this.prisma.profile.findUnique({
          where: { userId: b.blockedId },
          select: { name: true },
        });
        return {
          blockedUserId: b.blockedId,
          name: profile?.name ?? "User",
          createdAt: b.blockedAt.toISOString(),
        };
      })
    );
  }

  async reportUser(
    reporterId: string,
    opts: {
      reportedUserId: string;
      reason: string;
      details?: string;
      alsoBlock?: boolean;
    }
  ) {
    if (opts.reportedUserId === reporterId) {
      throw new BadRequestException("You cannot report yourself");
    }
    if (!(REPORT_REASONS as readonly string[]).includes(opts.reason)) {
      throw new BadRequestException("Invalid report reason");
    }
    const target = await this.prisma.profile.findUnique({
      where: { userId: opts.reportedUserId },
    });
    if (!target) throw new NotFoundException("User not found");

    const open = await this.prisma.report.findFirst({
      where: {
        reporterId,
        reportedUserId: opts.reportedUserId,
        status: "open",
      },
    });
    if (open) throw new BadRequestException("You already reported this user");

    const reporter = await this.prisma.user.findUniqueOrThrow({
      where: { id: reporterId },
    });
    const reported = await this.prisma.user.findUniqueOrThrow({
      where: { id: opts.reportedUserId },
    });

    await this.prisma.report.create({
      data: {
        convexId: `local_report_${randomUUID()}`,
        reporterId,
        reportedUserId: opts.reportedUserId,
        convexReporterId: reporter.convexId,
        convexReportedUserId: reported.convexId,
        reason: opts.reason,
        details: opts.details?.trim()
          ? opts.details.trim().slice(0, 500)
          : null,
        status: "open",
        reportCreatedAt: new Date(),
      },
    });

    if (opts.alsoBlock) {
      await this.blockUser(reporterId, opts.reportedUserId);
    }
    return { reported: true };
  }

  async listReports(opts: {
    status?: "open" | "reviewed" | "dismissed";
    cursor?: string;
    limit?: number;
  }) {
    const limit = parseLimit(String(opts.limit ?? 50), 50, 100);
    const rows = await this.prisma.report.findMany({
      where: {
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.cursor ? { id: { lt: opts.cursor } } : {}),
      },
      orderBy: { reportCreatedAt: "desc" },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const items = await Promise.all(
      page.map(async (report) => {
        const reported = await this.prisma.profile.findUnique({
          where: { userId: report.reportedUserId },
        });
        const reporter = await this.prisma.profile.findUnique({
          where: { userId: report.reporterId },
        });
        return {
          _id: report.id,
          id: report.id,
          reason: report.reason,
          details: report.details ?? "",
          status: report.status,
          priority: report.priority ?? "medium",
          adminNotes: report.adminNotes ?? "",
          resolution: report.resolution ?? "",
          createdAt: report.reportCreatedAt.getTime(),
          reviewedAt: report.reviewedAt?.getTime() ?? null,
          reportedUserId: report.reportedUserId,
          reportedName: reported?.name ?? "Unknown",
          reportedProfileId: reported?.id ?? null,
          reportedBanned: reported?.banned ?? false,
          reporterName: reporter?.name ?? "Unknown",
        };
      })
    );

    return {
      items,
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  async getReport(id: string) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException("Report not found");
    const reported = await this.prisma.profile.findUnique({
      where: { userId: report.reportedUserId },
    });
    const reporter = await this.prisma.profile.findUnique({
      where: { userId: report.reporterId },
    });
    return {
      id: report.id,
      reason: report.reason,
      details: report.details ?? "",
      status: report.status,
      priority: report.priority ?? "medium",
      adminNotes: report.adminNotes ?? "",
      resolution: report.resolution ?? "",
      createdAt: report.reportCreatedAt.toISOString(),
      reviewedAt: report.reviewedAt?.toISOString() ?? null,
      reportedUserId: report.reportedUserId,
      reportedName: reported?.name ?? "Unknown",
      reportedProfileId: reported?.id ?? null,
      reportedBanned: reported?.banned ?? false,
      reporterName: reporter?.name ?? "Unknown",
    };
  }

  async updateReportStatus(
    actorUserId: string,
    reportId: string,
    opts: {
      status: "reviewed" | "dismissed";
      priority?: "low" | "medium" | "high";
      adminNotes?: string;
      resolution?: string;
    }
  ) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException("Report not found");

    await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: opts.status,
        reviewedAt: new Date(),
        reviewedById: actorUserId,
        ...(opts.priority !== undefined ? { priority: opts.priority } : {}),
        ...(opts.adminNotes !== undefined
          ? { adminNotes: opts.adminNotes.trim().slice(0, 2000) }
          : {}),
        ...(opts.resolution !== undefined
          ? { resolution: opts.resolution.trim().slice(0, 1000) }
          : {}),
      },
    });

    await this.audit.write({
      actorUserId,
      action: "update_report",
      targetUserId: report.reportedUserId,
      metadata: {
        reportId,
        status: opts.status,
        priority: opts.priority,
      },
    });
    return { updated: true };
  }
}
