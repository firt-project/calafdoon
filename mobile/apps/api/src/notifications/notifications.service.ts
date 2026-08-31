import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.module";
import { MediaAccessService } from "../media/media-access.service";
import { resolveProfileMainImageUrl } from "../media/profile-image-url";
import { ChatRealtimeService } from "../chat/chat-realtime.service";
import {
  DEFAULT_NOTIFICATION_PAGE,
  MAX_NOTIFICATION_PAGE,
  decodeNotificationCursor,
  encodeNotificationCursor,
} from "../chat/chat.constants";
import { isStaffRole } from "../common/access";
import { canViewerSeePhotos } from "../profile/photo-rules";

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

  /**
   * M8: avatar URLs use the same photoVisibility rules as profile/match surfaces
   * (`canViewerSeePhotos` + MediaAccessService / H1–H2). Never sign before allow.
   */
  private async relatedAvatarUrls(
    viewerUserId: string,
    viewerRole: "user" | "admin" | "owner",
    relatedUserIds: string[]
  ): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    const unique = [...new Set(relatedUserIds.filter(Boolean))];
    if (unique.length === 0) return out;

    const profiles = await this.prisma.profile.findMany({
      where: { userId: { in: unique } },
      select: {
        userId: true,
        banned: true,
        photoVisibility: true,
        profileImageMediaId: true,
        profileImageConvexId: true,
      },
    });
    const byUser = new Map(profiles.map((p) => [p.userId, p]));

    const matches = await this.prisma.match.findMany({
      where: {
        status: "active",
        OR: [
          { userAId: viewerUserId, userBId: { in: unique } },
          { userBId: viewerUserId, userAId: { in: unique } },
        ],
      },
      select: { userAId: true, userBId: true },
    });
    const matchedPartners = new Set<string>();
    for (const m of matches) {
      matchedPartners.add(m.userAId === viewerUserId ? m.userBId : m.userAId);
    }

    const staff = isStaffRole(viewerRole);
    for (const relatedId of unique) {
      const related = byUser.get(relatedId);
      if (!related || related.banned) {
        out.set(relatedId, null);
        continue;
      }
      const allowed = canViewerSeePhotos({
        viewerUserId,
        profileOwnerUserId: relatedId,
        photoVisibility: related.photoVisibility,
        isStaff: staff,
        hasActiveMatch: matchedPartners.has(relatedId),
      });
      if (!allowed) {
        out.set(relatedId, null);
        continue;
      }
      // Sign only after authorization (same helper as match/chat).
      const url = await resolveProfileMainImageUrl(
        this.prisma,
        this.media,
        related,
        { userId: viewerUserId, roles: [viewerRole] }
      );
      out.set(relatedId, url);
    }
    return out;
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
    const viewerRole = (profile?.role ?? "user") as "user" | "admin" | "owner";

    const avatarByRelated = await this.relatedAvatarUrls(
      userId,
      viewerRole,
      page
        .map((n) => n.relatedUserId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    );

    const items = page.map((n) => ({
      id: n.id,
      convexId: n.convexId,
      type: n.type,
      title: n.title,
      body: n.body,
      read: n.read,
      relatedUserId: n.relatedUserId,
      relatedImageUrl: n.relatedUserId
        ? (avatarByRelated.get(n.relatedUserId) ?? null)
        : null,
      createdAt: n.notificationCreatedAt.toISOString(),
      sourceKey: n.sourceKey,
    }));

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
