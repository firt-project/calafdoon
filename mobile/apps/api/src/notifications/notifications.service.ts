import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.module";
import { MediaAccessService } from "../media/media-access.service";
import { ChatRealtimeService } from "../chat/chat-realtime.service";
import {
  DEFAULT_NOTIFICATION_PAGE,
  MAX_NOTIFICATION_PAGE,
  decodeNotificationCursor,
  encodeNotificationCursor,
} from "../chat/chat.constants";

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly media: MediaAccessService,
    private readonly realtime: ChatRealtimeService
  ) {}

  private async softRateLimit(userId: string) {
    const online = await this.redis.connect();
    if (!online || !this.redis.client) return;
    const key = `rl:notifications.poll:user:${userId}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, 60);
    if (count > 120) {
      throw new ForbiddenException("Too many requests. Try again later.");
    }
  }

  async list(
    userId: string,
    opts?: { cursor?: string; limit?: number }
  ) {
    await this.softRateLimit(userId);
    const limit = Math.min(
      opts?.limit ?? DEFAULT_NOTIFICATION_PAGE,
      MAX_NOTIFICATION_PAGE
    );
    const cursor = opts?.cursor
      ? decodeNotificationCursor(opts.cursor)
      : null;

    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(cursor
          ? {
              OR: [
                { notificationCreatedAt: { lt: cursor.createdAt } },
                {
                  notificationCreatedAt: cursor.createdAt,
                  id: { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ notificationCreatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const profile = await this.prisma.profile.findUnique({ where: { userId } });

    const items = [];
    for (const n of page) {
      let relatedImageUrl: string | null = null;
      if (n.relatedUserId) {
        const related = await this.prisma.profile.findUnique({
          where: { userId: n.relatedUserId },
          select: { profileImageMediaId: true },
        });
        if (related?.profileImageMediaId) {
          try {
            const signed = await this.media.createSignedDownloadUrl(
              related.profileImageMediaId,
              {
                userId,
                roles: [profile?.role ?? "user"],
                privatePhotoPeerIds: [n.relatedUserId],
              }
            );
            relatedImageUrl = signed.url;
          } catch {
            relatedImageUrl = null;
          }
        }
      }
      items.push({
        id: n.id,
        convexId: n.convexId,
        type: n.type,
        title: n.title,
        body: n.body,
        read: n.read,
        relatedUserId: n.relatedUserId,
        relatedImageUrl,
        createdAt: n.notificationCreatedAt.toISOString(),
        sourceKey: n.sourceKey,
      });
    }

    const nextCursor =
      hasMore && page.length
        ? encodeNotificationCursor(
            page[page.length - 1]!.notificationCreatedAt,
            page[page.length - 1]!.id
          )
        : null;

    return { items, nextCursor };
  }

  async unreadCount(userId: string) {
    await this.softRateLimit(userId);
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }

  async markOneRead(userId: string, notificationId: string) {
    const n = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!n || n.userId !== userId) {
      // Convex silently no-ops for missing/foreign — keep same
      return { ok: true as const };
    }
    if (!n.read) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { read: true },
      });
    }
    const unreadCount = await this.unreadCount(userId);
    this.realtime.emitToUser(userId, "unread:update", {
      notificationUnreadCount: unreadCount,
    });
    return { ok: true as const, unreadCount };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    this.realtime.emitToUser(userId, "unread:update", {
      notificationUnreadCount: 0,
    });
    return { ok: true as const, unreadCount: 0 };
  }

  async markByFilter(
    userId: string,
    opts?: {
      types?: Array<
        "like" | "match" | "message" | "announcement" | "approval" | "payment"
      >;
      relatedUserId?: string;
    }
  ) {
    const unread = await this.prisma.notification.findMany({
      where: { userId, read: false },
      select: { id: true, type: true, relatedUserId: true },
    });
    const ids = unread
      .filter((n) => {
        if (opts?.types && !opts.types.includes(n.type)) return false;
        if (opts?.relatedUserId && n.relatedUserId !== opts.relatedUserId) {
          return false;
        }
        return true;
      })
      .map((n) => n.id);
    if (ids.length) {
      await this.prisma.notification.updateMany({
        where: { id: { in: ids } },
        data: { read: true },
      });
    }
    const unreadCount = await this.unreadCount(userId);
    this.realtime.emitToUser(userId, "unread:update", {
      notificationUnreadCount: unreadCount,
    });
    return { ok: true as const, unreadCount };
  }

  async getOwnOrThrow(userId: string, notificationId: string) {
    const n = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!n || n.userId !== userId) {
      throw new NotFoundException("Notification not found");
    }
    return n;
  }
}
