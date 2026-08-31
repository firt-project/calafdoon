import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { parseLimit } from "./admin-auth.helpers";

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async write(args: {
    actorUserId: string;
    action: string;
    targetUserId?: string | null;
    targetProfileId?: string | null;
    metadata?: Record<string, unknown> | string;
    correlationId?: string | null;
    requestId?: string | null;
  }) {
    const actor = await this.prisma.user.findUniqueOrThrow({
      where: { id: args.actorUserId },
      select: { convexId: true },
    });

    let convexTargetUserId: string | null = null;
    let convexTargetProfileId: string | null = null;
    if (args.targetUserId) {
      const u = await this.prisma.user.findUnique({
        where: { id: args.targetUserId },
        select: { convexId: true },
      });
      convexTargetUserId = u?.convexId ?? null;
    }
    if (args.targetProfileId) {
      const p = await this.prisma.profile.findUnique({
        where: { id: args.targetProfileId },
        select: { convexId: true },
      });
      convexTargetProfileId = p?.convexId ?? null;
    }

    const metadata =
      args.metadata === undefined
        ? null
        : typeof args.metadata === "string"
          ? args.metadata.slice(0, 2000)
          : JSON.stringify(args.metadata).slice(0, 2000);

    return this.prisma.auditLog.create({
      data: {
        convexId: `local_audit_${randomUUID()}`,
        actorUserId: args.actorUserId,
        convexActorUserId: actor.convexId,
        action: args.action,
        targetUserId: args.targetUserId ?? null,
        convexTargetUserId,
        targetProfileId: args.targetProfileId ?? null,
        convexTargetProfileId,
        metadata,
        correlationId: args.correlationId ?? null,
        requestId: args.requestId ?? null,
        loggedAt: new Date(),
      },
    });
  }

  async list(opts: {
    limit?: number;
    cursor?: string;
    actorUserId?: string;
    action?: string;
    targetUserId?: string;
  }) {
    const limit = Math.min(opts.limit ?? 80, 200);
    const cursorDate = opts.cursor ? new Date(opts.cursor) : null;

    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(opts.actorUserId ? { actorUserId: opts.actorUserId } : {}),
        ...(opts.action ? { action: opts.action } : {}),
        ...(opts.targetUserId ? { targetUserId: opts.targetUserId } : {}),
        ...(cursorDate ? { loggedAt: { lt: cursorDate } } : {}),
      },
      orderBy: { loggedAt: "desc" },
      take: limit + 1,
      include: {
        actor: { include: { profile: { select: { name: true } } } },
        targetUser: { include: { profile: { select: { name: true } } } },
        targetProfile: { select: { name: true, id: true } },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: page.map((log) => ({
        _id: log.id,
        id: log.id,
        action: log.action,
        metadata: log.metadata ?? null,
        createdAt: log.loggedAt.toISOString(),
        actorName: log.actor.profile?.name ?? "Staff",
        actorUserId: log.actorUserId,
        targetName:
          log.targetUser?.profile?.name ?? log.targetProfile?.name ?? null,
        targetUserId: log.targetUserId,
        targetProfileId: log.targetProfileId,
        // When targets were deleted, surface original Convex IDs safely
        convexTargetUserId: log.convexTargetUserId,
        convexTargetProfileId: log.convexTargetProfileId,
        correlationId: log.correlationId,
        requestId: log.requestId,
      })),
      nextCursor: hasMore
        ? page[page.length - 1]?.loggedAt.toISOString() ?? null
        : null,
    };
  }

  async getById(id: string) {
    const log = await this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        actor: { include: { profile: { select: { name: true } } } },
        targetUser: { include: { profile: { select: { name: true } } } },
        targetProfile: { select: { name: true } },
      },
    });
    if (!log) return null;
    return {
      id: log.id,
      action: log.action,
      metadata: log.metadata ?? null,
      createdAt: log.loggedAt.toISOString(),
      actorName: log.actor.profile?.name ?? "Staff",
      actorUserId: log.actorUserId,
      targetName:
        log.targetUser?.profile?.name ?? log.targetProfile?.name ?? null,
      targetUserId: log.targetUserId,
      targetProfileId: log.targetProfileId,
      convexTargetUserId: log.convexTargetUserId,
      convexTargetProfileId: log.convexTargetProfileId,
    };
  }
}

export function adminListLimit(raw: string | undefined) {
  return parseLimit(raw, 50, 100);
}
