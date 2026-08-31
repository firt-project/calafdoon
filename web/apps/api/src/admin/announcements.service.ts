import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { isStaffRole } from "../common/access";
import { AuditLogService } from "./audit-log.service";
import { AnnouncementQueueService } from "../queue/announcement-queue.service";
import { parseLimit } from "./admin-auth.helpers";

export type AnnouncementAudience = "all" | "paid" | "trial" | "unpaid";

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    @Inject(forwardRef(() => AnnouncementQueueService))
    private readonly queue: AnnouncementQueueService
  ) {}

  async list(opts?: { cursor?: string; limit?: number }) {
    const limit = parseLimit(String(opts?.limit ?? 50), 50, 100);
    const rows = await this.prisma.announcement.findMany({
      where: opts?.cursor ? { id: { lt: opts.cursor } } : {},
      orderBy: { announcementCreatedAt: "desc" },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: page.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        audience: a.audience ?? "all",
        scheduledFor: a.scheduledFor?.toISOString() ?? null,
        sentAt: a.sentAt?.toISOString() ?? null,
        createdAt: a.announcementCreatedAt.toISOString(),
      })),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  async create(
    actorUserId: string,
    opts: {
      title: string;
      body: string;
      audience?: AnnouncementAudience;
      scheduledFor?: number;
    }
  ) {
    const title = opts.title.trim();
    const body = opts.body.trim();
    if (!title || !body) {
      throw new BadRequestException("Title and message are required.");
    }
    if (title.length > 120) throw new BadRequestException("Title is too long.");
    if (body.length > 4000) {
      throw new BadRequestException("Message is too long.");
    }

    const audience = opts.audience ?? "all";
    const now = Date.now();
    const scheduledFor = opts.scheduledFor;
    const sendNow =
      scheduledFor === undefined || scheduledFor <= now + 15_000;

    if (scheduledFor !== undefined && scheduledFor > now + 15_000) {
      const maxAhead = now + 90 * 24 * 60 * 60 * 1000;
      if (scheduledFor > maxAhead) {
        throw new BadRequestException("Schedule must be within 90 days.");
      }
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actorUserId },
    });

    const announcement = await this.prisma.announcement.create({
      data: {
        convexId: `local_ann_${randomUUID()}`,
        title,
        body,
        announcementCreatedAt: new Date(now),
        createdById: actorUserId,
        convexCreatedBy: user.convexId,
        audience,
        scheduledFor: sendNow ? null : new Date(scheduledFor!),
        sentAt: sendNow ? new Date(now) : null,
      },
    });

    if (sendNow) {
      await this.queue.enqueueFanout(announcement.id);
    }

    await this.audit.write({
      actorUserId,
      action: sendNow ? "create_announcement" : "schedule_announcement",
      metadata: {
        title,
        audience,
        scheduledFor: sendNow ? null : scheduledFor ?? null,
        announcementId: announcement.id,
      },
    });

    return { id: announcement.id, scheduled: !sendNow };
  }

  async sendNow(actorUserId: string, announcementId: string) {
    const a = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
    });
    if (!a) throw new NotFoundException("Announcement not found");
    if (a.sentAt) return { alreadySent: true };
    await this.queue.enqueueFanout(announcementId);
    await this.prisma.announcement.update({
      where: { id: announcementId },
      data: { sentAt: new Date(), scheduledFor: null },
    });
    await this.audit.write({
      actorUserId,
      action: "send_announcement",
      metadata: { announcementId },
    });
    return { sent: true };
  }

  async schedule(
    actorUserId: string,
    announcementId: string,
    scheduledFor: number
  ) {
    const a = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
    });
    if (!a) throw new NotFoundException("Announcement not found");
    if (a.sentAt) {
      throw new BadRequestException("Announcement already sent");
    }
    const now = Date.now();
    if (scheduledFor <= now + 15_000) {
      return this.sendNow(actorUserId, announcementId);
    }
    const maxAhead = now + 90 * 24 * 60 * 60 * 1000;
    if (scheduledFor > maxAhead) {
      throw new BadRequestException("Schedule must be within 90 days.");
    }
    await this.prisma.announcement.update({
      where: { id: announcementId },
      data: { scheduledFor: new Date(scheduledFor) },
    });
    await this.audit.write({
      actorUserId,
      action: "schedule_announcement",
      metadata: { announcementId, scheduledFor },
    });
    return { scheduled: true };
  }

  /** Fan-out notifications with sourceKey idempotency. No Resend. */
  async fanOut(announcementId: string) {
    const a = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
    });
    if (!a) return { delivered: 0 };
    const audience = (a.audience ?? "all") as AnnouncementAudience;
    const PAGE = 100;
    let cursor: string | undefined;
    let delivered = 0;
    const now = new Date();

    for (;;) {
      const page = await this.prisma.profile.findMany({
        orderBy: { id: "asc" },
        take: PAGE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: {
          id: true,
          userId: true,
          role: true,
          hasPaid: true,
          trialEndsAt: true,
          user: { select: { convexId: true } },
        },
      });
      if (page.length === 0) break;

      for (const profile of page) {
        if (isStaffRole(profile.role)) continue;
        if (audience === "paid" && !profile.hasPaid) continue;
        if (audience === "unpaid" && profile.hasPaid) continue;
        if (audience === "trial") {
          const inTrial =
            !profile.hasPaid &&
            profile.trialEndsAt &&
            profile.trialEndsAt.getTime() > Date.now();
          if (!inTrial) continue;
        }

        const sourceKey = `announcement:${announcementId}:${profile.userId}`;
        try {
          await this.prisma.notification.create({
            data: {
              convexId: `local_notif_${randomUUID()}`,
              userId: profile.userId,
              convexUserId: profile.user.convexId,
              type: "announcement",
              title: a.title,
              body: a.body,
              read: false,
              sourceKey,
              notificationCreatedAt: now,
            },
          });
          delivered += 1;
        } catch {
          // unique sourceKey → already delivered
        }
      }

      cursor = page[page.length - 1]!.id;
      if (page.length < PAGE) break;
    }

    if (!a.sentAt) {
      await this.prisma.announcement.update({
        where: { id: announcementId },
        data: { sentAt: now },
      });
    }

    return { delivered };
  }

  async deliverDueScheduled() {
    const now = new Date();
    const due = await this.prisma.announcement.findMany({
      where: {
        sentAt: null,
        scheduledFor: { lte: now },
      },
      take: 50,
    });
    let delivered = 0;
    for (const a of due) {
      await this.queue.enqueueFanout(a.id);
      delivered += 1;
    }
    return { delivered };
  }
}
