import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Conversation, Match, Profile } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { hasPaidAccess, isStaffRole } from "../common/access";
import {
  interactionLockMessage,
  isInteractionLocked,
} from "../common/review-status";
import { MediaAccessService } from "../media/media-access.service";
import { resolveProfileMainImageUrl, resolveAdditionalImageUrls } from "../media/profile-image-url";
import { assertStoredUpload, assertUploadIntent } from "../media/upload-policy";
import { PrismaService } from "../prisma/prisma.service";
import { canViewerSeePhotos } from "../profile/photo-rules";
import { RedisService } from "../redis/redis.module";
import { NotificationQueueService } from "../queue/notification-queue.service";
import { ChatRealtimeService } from "./chat-realtime.service";
import {
  DEFAULT_MESSAGE_PAGE,
  IMAGE_MESSAGE_PLACEHOLDER,
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGE_PAGE,
  decodeMessageCursor,
  encodeMessageCursor,
  sanitizeMessageBody,
} from "./chat.constants";
import { TypingService } from "./typing.service";
import { bumpUnread, readUnreadCount, zeroUnread } from "./unread";
import { PresenceService } from "../presence/presence.service";

type ConvWithMatch = Conversation & { match: Match };

@Injectable()
export class ConversationService {
  private readonly chatBucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaAccessService,
    private readonly redis: RedisService,
    private readonly typing: TypingService,
    private readonly realtime: ChatRealtimeService,
    private readonly notificationQueue: NotificationQueueService,
    private readonly presence: PresenceService,
    private readonly config: ConfigService
  ) {
    this.chatBucket = this.config.get<string>("S3_BUCKET_CHAT") ?? "hel-chat";
  }

  private async requireProfile(userId: string): Promise<Profile> {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException("Profile required");
    if (isInteractionLocked(profile)) {
      throw new ForbiddenException(interactionLockMessage(profile));
    }
    return profile;
  }

  private participantIds(conv: ConvWithMatch): string[] {
    if (conv.participantUserIds?.length >= 2) {
      return conv.participantUserIds;
    }
    return [conv.match.userAId, conv.match.userBId];
  }

  private assertParticipant(conv: ConvWithMatch, userId: string) {
    if (!this.participantIds(conv).includes(userId)) {
      throw new ForbiddenException("Not authorized");
    }
  }

  private otherUserId(conv: ConvWithMatch, userId: string): string {
    const ids = this.participantIds(conv);
    return ids.find((id) => id !== userId) ?? "";
  }

  private async loadConversation(id: string): Promise<ConvWithMatch> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id },
      include: { match: true },
    });
    if (!conv) throw new NotFoundException("Conversation not found");
    return conv;
  }

  private async isEitherBlocked(a: string, b: string): Promise<boolean> {
    const row = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
      select: { id: true },
    });
    return !!row;
  }

  private async getBlockedIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    const set = new Set<string>();
    for (const r of rows) {
      set.add(r.blockerId === userId ? r.blockedId : r.blockerId);
    }
    return set;
  }

  /** Public member card for chat — never includes email or phone. */
  private async buildPublicPartnerCard(
    viewer: Profile,
    other: Profile,
    otherUserId: string,
    hasActiveMatch: boolean
  ) {
    let imageUrl: string | null = null;
    let additionalImageUrls: string[] = [];
    let photoHidden = false;
    const hasPhoto = !!(
      other.profileImageMediaId || other.profileImageConvexId
    );
    const allowed = canViewerSeePhotos({
      viewerUserId: viewer.userId,
      profileOwnerUserId: otherUserId,
      photoVisibility: other.photoVisibility,
      isStaff: isStaffRole(viewer.role),
      hasActiveMatch,
    });
    if (!allowed) {
      photoHidden = hasPhoto;
    } else if (hasPhoto) {
      imageUrl = await resolveProfileMainImageUrl(
        this.prisma,
        this.media,
        other,
        { userId: viewer.userId, roles: [viewer.role] }
      );
      if (!imageUrl) photoHidden = true;
      additionalImageUrls = await resolveAdditionalImageUrls(
        this.prisma,
        this.media,
        other,
        { userId: viewer.userId, roles: [viewer.role] }
      );
    }

    return {
      userId: otherUserId,
      name: other.name,
      age: other.age,
      gender: other.gender,
      country: other.country,
      city: other.city,
      height: other.height,
      education: other.education,
      occupation: other.occupation,
      religiousLevel: other.religiousLevel,
      prayerFrequency: other.prayerFrequency,
      bio: other.bio || null,
      maritalStatus: other.maritalStatus,
      marriageTimeline: other.marriageTimeline,
      wantChildren: other.wantChildren,
      languagesSpoken: other.languagesSpoken ?? [],
      qualities: other.qualities ?? [],
      hobbies: other.hobbies ?? [],
      imageUrl,
      additionalImageUrls,
      photoHidden,
      verified: other.verified,
      hasPaid: other.hasPaid,
      hasPersonalSupport: !!other.hasPersonalSupport,
      questionnaireComplete: other.questionnaireComplete,
      photoVisibility: other.photoVisibility,
      approved: other.approved,
      reviewStatus: other.reviewStatus,
      isOnline: await this.presence.isOnline(otherUserId),
    };
  }

  private async failClosedRateLimit(bucket: string, userId: string) {
    const online = await this.redis.connect();
    if (!online || !this.redis.client) {
      throw new ServiceUnavailableException(
        "Service temporarily unavailable. Try again later."
      );
    }
    const limits: Record<string, { windowSec: number; max: number }> = {
      "chat.message": { windowSec: 60, max: 60 },
      "chat.image": { windowSec: 60, max: 20 },
      "chat.typing": { windowSec: 60, max: 120 },
      "chat.read": { windowSec: 60, max: 120 },
    };
    const spec = limits[bucket];
    if (!spec) return;
    const key = `rl:${bucket}:user:${userId}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, spec.windowSec);
    if (count > spec.max) {
      throw new HttpException(
        "Too many requests. Try again later.",
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  async listConversations(
    userId: string,
    list: "active" | "new" | "archived" = "active"
  ) {
    const profile = await this.requireProfile(userId);
    const matches = await this.prisma.match.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        ...(list === "archived"
          ? { status: "archived" as const }
          : { status: "active" as const }),
      },
      include: { conversation: true },
    });

    const blocked = await this.getBlockedIds(userId);
    const paid = hasPaidAccess(profile);
    const items = [];

    for (const m of matches) {
      const otherId = m.userAId === userId ? m.userBId : m.userAId;
      if (blocked.has(otherId)) continue;

      const seenMap = (m.seenAtByUser as Record<string, number> | null) ?? {};
      const isNew = m.status === "active" && seenMap[userId] === undefined;
      if (list === "new" && !isNew) continue;

      const other = await this.prisma.profile.findUnique({
        where: { userId: otherId },
      });
      const conversation = m.conversation;
      let lastMessage: string | null = null;
      if (conversation) {
        const last = await this.prisma.message.findFirst({
          where: { conversationId: conversation.id },
          orderBy: [{ messageCreatedAt: "desc" }, { id: "desc" }],
          select: { body: true },
        });
        lastMessage = last?.body ?? null;
      }

      const unreadCount = conversation
        ? readUnreadCount(
            conversation.unreadByUser,
            userId,
            profile.convexUserId
          )
        : 0;

      let profileCard = null;
      if (other) {
        profileCard = await this.buildPublicPartnerCard(
          profile,
          other,
          otherId,
          m.status === "active"
        );
      }

      items.push({
        matchId: m.id,
        conversationId: conversation?.id ?? null,
        convexConversationId: conversation?.convexId ?? null,
        chatUnlocked: paid || m.chatUnlocked,
        status: m.status,
        isNew,
        profile: profileCard,
        lastMessage,
        lastMessageAt: conversation?.lastMessageAt?.toISOString() ?? null,
        unreadCount,
        score: m.score,
      });
    }

    items.sort((a, b) => {
      const at = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
      const bt = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
      return bt - at;
    });
    return { items };
  }

  async getConversation(userId: string, conversationId: string) {
    const profile = await this.requireProfile(userId);
    const conv = await this.loadConversation(conversationId);
    this.assertParticipant(conv, userId);
    const list = await this.listConversations(
      userId,
      conv.match.status === "archived" ? "archived" : "active"
    );
    const item = list.items.find((i) => i.conversationId === conversationId);
    if (!item) {
      // Blocked pairs are hidden from list — still deny detail if blocked
      const otherId = this.otherUserId(conv, userId);
      if (await this.isEitherBlocked(userId, otherId)) {
        throw new ForbiddenException("Not authorized");
      }
      return {
        id: conv.id,
        matchId: conv.matchId,
        status: conv.match.status,
        chatUnlocked: hasPaidAccess(profile) || conv.match.chatUnlocked,
        lastMessageAt: conv.lastMessageAt.toISOString(),
        unreadCount: readUnreadCount(
          conv.unreadByUser,
          userId,
          profile.convexUserId
        ),
        participantUserIds: this.participantIds(conv),
      };
    }
    return item;
  }

  async getPartnerProfile(userId: string, conversationId: string) {
    const viewer = await this.requireProfile(userId);
    const conv = await this.loadConversation(conversationId);
    this.assertParticipant(conv, userId);
    const otherId = this.otherUserId(conv, userId);
    if (!otherId) throw new NotFoundException("Partner not found");
    if (await this.isEitherBlocked(userId, otherId)) {
      throw new ForbiddenException("Not authorized");
    }
    const other = await this.prisma.profile.findUnique({
      where: { userId: otherId },
    });
    if (!other) throw new NotFoundException("Partner not found");
    return {
      profile: await this.buildPublicPartnerCard(
        viewer,
        other,
        otherId,
        conv.match.status === "active"
      ),
      score: conv.match.score,
      matchId: conv.match.id,
      conversationId: conv.id,
    };
  }

  async listMessages(
    userId: string,
    conversationId: string,
    opts?: { cursor?: string; limit?: number }
  ) {
    await this.requireProfile(userId);
    const conv = await this.loadConversation(conversationId);
    this.assertParticipant(conv, userId);

    // Convex: blocked pairs can still read historical messages if they hold the id.
    const limit = Math.min(
      opts?.limit ?? DEFAULT_MESSAGE_PAGE,
      MAX_MESSAGE_PAGE
    );
    const cursor = opts?.cursor ? decodeMessageCursor(opts.cursor) : null;
    if (opts?.cursor && !cursor) {
      throw new BadRequestException("Invalid cursor");
    }

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(cursor
          ? {
              OR: [
                { messageCreatedAt: { gt: cursor.createdAt } },
                {
                  messageCreatedAt: cursor.createdAt,
                  id: { gt: cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ messageCreatedAt: "asc" }, { id: "asc" }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const profile = await this.prisma.profile.findUnique({ where: { userId } });

    const items = [];
    for (const msg of page) {
      let imageUrl: string | null = null;
      if (msg.imageMediaId) {
        try {
          const signed = await this.media.createSignedDownloadUrl(
            msg.imageMediaId,
            {
              userId,
              roles: [profile?.role ?? "user"],
              conversationIds: [conversationId],
            }
          );
          imageUrl = signed.url;
        } catch {
          imageUrl = null;
        }
      }
      items.push({
        id: msg.id,
        convexId: msg.convexId,
        conversationId: msg.conversationId,
        senderId: msg.senderId,
        message: msg.body,
        imageMediaId: msg.imageMediaId,
        imageUrl,
        read: msg.read,
        createdAt: msg.messageCreatedAt.toISOString(),
        idempotencyKey: msg.idempotencyKey,
      });
    }

    const nextCursor =
      hasMore && page.length
        ? encodeMessageCursor(
            page[page.length - 1]!.messageCreatedAt,
            page[page.length - 1]!.id
          )
        : null;

    return { items, nextCursor };
  }

  /**
   * Signed PUT URL for a chat attachment. Creates a `chat_image` media row so
   * sendMessage accepts the id — profile photo uploads must not be reused here.
   */
  async signImageUpload(
    userId: string,
    conversationId: string,
    opts: { contentType: string; sizeBytes?: number }
  ) {
    const profile = await this.requireProfile(userId);
    await this.failClosedRateLimit("chat.image", userId);

    const conv = await this.loadConversation(conversationId);
    this.assertParticipant(conv, userId);

    if (!hasPaidAccess(profile) && !conv.match.chatUnlocked) {
      throw new ForbiddenException("Please complete payment to unlock chat.");
    }
    const otherId = this.otherUserId(conv, userId);
    if (otherId && (await this.isEitherBlocked(userId, otherId))) {
      throw new ForbiddenException("You cannot message this user");
    }

    const { contentType, sizeBytes, maxBytes } = assertUploadIntent({
      purpose: "chat_image",
      contentType: opts.contentType,
      sizeBytes: opts.sizeBytes,
    });

    const ext =
      contentType === "image/png"
        ? "png"
        : contentType === "image/webp"
          ? "webp"
          : "jpg";
    const localStorageId = `local_chat_${randomUUID()}`;
    const objectKey = `${conversationId}/${localStorageId}.${ext}`;

    const senderUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { convexId: true },
    });
    const mediaRow = await this.prisma.mediaObject.create({
      data: {
        convexStorageId: localStorageId,
        purpose: "chat_image",
        bucket: this.chatBucket,
        objectKey,
        contentType,
        sizeBytes: BigInt(sizeBytes),
        ownerUserId: userId,
        convexOwnerUserId: senderUser?.convexId ?? profile.convexUserId,
        migrationStatus: "pending",
        sourceTable: "messages",
      },
    });

    const { uploadUrl, expiresInSeconds } =
      await this.media.createSignedUploadUrl({
        bucket: this.chatBucket,
        objectKey,
        contentType,
        contentLength: sizeBytes,
      });

    return {
      mediaId: mediaRow.id,
      uploadUrl,
      expiresInSeconds,
      contentType,
      maxBytes,
    };
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    input: {
      message?: string;
      imageMediaId?: string;
      idempotencyKey?: string;
    },
    opts?: { socketId?: string }
  ) {
    const profile = await this.requireProfile(userId);
    await this.failClosedRateLimit(
      input.imageMediaId ? "chat.image" : "chat.message",
      userId
    );

    const conv = await this.loadConversation(conversationId);
    this.assertParticipant(conv, userId);

    if (!hasPaidAccess(profile) && !conv.match.chatUnlocked) {
      throw new ForbiddenException("Please complete payment to unlock chat.");
    }

    const otherId = this.otherUserId(conv, userId);
    if (!otherId) throw new ForbiddenException("Not authorized");
    if (await this.isEitherBlocked(userId, otherId)) {
      throw new ForbiddenException("You cannot message this user");
    }

    if (input.idempotencyKey) {
      const existing = await this.prisma.message.findFirst({
        where: {
          conversationId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (existing) {
        return this.toMessageDto(existing, userId, conversationId, profile.role);
      }
    }

    let imageMediaId: string | undefined;
    if (input.imageMediaId) {
      const media = await this.prisma.mediaObject.findUnique({
        where: { id: input.imageMediaId },
      });
      if (!media) throw new BadRequestException("Invalid image");
      if (media.ownerUserId !== userId) {
        throw new ForbiddenException("Invalid file upload");
      }
      if (media.purpose !== "chat_image") {
        throw new BadRequestException("Image must be a chat attachment");
      }
      if (media.migrationStatus === "pending") {
        if (!media.bucket || !media.objectKey) {
          throw new BadRequestException("Upload not ready");
        }
        let head: { sizeBytes: number; contentType: string | null };
        try {
          head = await this.media.headObject(media.bucket, media.objectKey);
        } catch {
          throw new BadRequestException(
            "Image upload did not finish. Please try again."
          );
        }
        const declared =
          media.sizeBytes != null ? Number(media.sizeBytes) : undefined;
        let verifiedType: string;
        try {
          ({ contentType: verifiedType } = assertStoredUpload({
            purpose: "chat_image",
            contentType: head.contentType ?? media.contentType,
            sizeBytes: head.sizeBytes,
            declaredSizeBytes: declared,
          }));
        } catch (err) {
          await this.media.deleteObjectQuietly(media.bucket, media.objectKey);
          await this.prisma.mediaObject
            .update({
              where: { id: media.id },
              data: {
                migrationStatus: "failed",
                failureReason: "upload_validation_failed",
                verifiedReadable: false,
              },
            })
            .catch(() => undefined);
          throw err;
        }
        await this.prisma.mediaObject.update({
          where: { id: media.id },
          data: {
            sizeBytes: BigInt(head.sizeBytes),
            contentType: verifiedType,
            migrationStatus: "verified",
            verifiedReadable: true,
            migratedAt: new Date(),
          },
        });
      }
      imageMediaId = media.id;
    }

    const trimmed = sanitizeMessageBody(input.message ?? "");
    if (!trimmed && !imageMediaId) {
      throw new BadRequestException("Message cannot be empty");
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException("Message is too long");
    }

    const body = trimmed || IMAGE_MESSAGE_PLACEHOLDER;
    const now = new Date();
    const otherUser = await this.prisma.user.findUnique({
      where: { id: otherId },
      select: { convexId: true },
    });
    const senderUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { convexId: true },
    });

    let result: {
      message: {
        id: string;
        convexId: string;
        conversationId: string;
        senderId: string;
        body: string;
        imageMediaId: string | null;
        read: boolean;
        messageCreatedAt: Date;
        idempotencyKey: string | null;
      };
      notification: {
        id: string;
        type: string;
        title: string;
        body: string;
        read: boolean;
        relatedUserId: string | null;
        notificationCreatedAt: Date;
      } | null;
      unreadByUser: Record<string, number>;
    };

    try {
      result = await this.prisma.$transaction(async (tx) => {
        const message = await tx.message.create({
          data: {
            convexId: `local_msg_${randomUUID()}`,
            conversationId,
            convexConversationId: conv.convexId,
            senderId: userId,
            convexSenderId: senderUser?.convexId ?? profile.convexUserId,
            body,
            imageMediaId: imageMediaId ?? null,
            ...(input.idempotencyKey
              ? { idempotencyKey: input.idempotencyKey }
              : {}),
            read: false,
            messageCreatedAt: now,
          },
        });

        const unreadByUser = bumpUnread(
          conv.unreadByUser,
          otherId,
          otherUser?.convexId,
          1
        );

        await tx.conversation.update({
          where: { id: conversationId },
          data: {
            lastMessageAt: now,
            unreadByUser,
          },
        });

        const sourceKey = `message:${message.id}`;
        let notification = null;
        try {
          notification = await tx.notification.create({
            data: {
              convexId: `local_notif_${randomUUID()}`,
              userId: otherId,
              convexUserId: otherUser?.convexId ?? `local_${otherId}`,
              type: "message",
              title: "New Message",
              body: `${profile.name ?? "Someone"} sent you a message.`,
              read: false,
              relatedUserId: userId,
              convexRelatedUserId: senderUser?.convexId ?? profile.convexUserId,
              sourceKey,
              notificationCreatedAt: now,
            },
          });
        } catch (err: unknown) {
          const code =
            err && typeof err === "object" && "code" in err
              ? (err as { code?: string }).code
              : undefined;
          if (code !== "P2002") throw err;
          notification = await tx.notification.findUnique({
            where: { sourceKey },
          });
        }

        return { message, notification, unreadByUser };
      });
    } catch (err: unknown) {
      // Surface Prisma / validation failures without masking status codes Nest already maps.
      throw err;
    }

    const dto = await this.toMessageDto(
      result.message,
      userId,
      conversationId,
      profile.role
    );

    try {
      this.realtime.emitToConversation(
        conversationId,
        "message:new",
        dto,
        opts?.socketId
      );
      // Also fan out on user rooms so recipients get events without an active join.
      this.realtime.emitToUser(otherId, "message:new", dto);
      this.realtime.emitToUser(userId, "message:ack", {
        conversationId,
        message: dto,
        idempotencyKey: input.idempotencyKey ?? null,
      });
      this.realtime.emitToUsers(
        this.participantIds(conv),
        "conversation:updated",
        {
          conversationId,
          lastMessageAt: now.toISOString(),
          lastMessage: body,
        }
      );
      this.realtime.emitToUser(otherId, "unread:update", {
        conversationId,
        unreadCount: readUnreadCount(
          result.unreadByUser,
          otherId,
          otherUser?.convexId
        ),
      });

      if (result.notification) {
        const notifPayload = {
          id: result.notification.id,
          type: result.notification.type,
          title: result.notification.title,
          body: result.notification.body,
          read: result.notification.read,
          relatedUserId: result.notification.relatedUserId,
          createdAt: result.notification.notificationCreatedAt.toISOString(),
        };
        this.realtime.emitToUser(otherId, "notification:new", notifPayload);
        await this.notificationQueue.enqueueEmailStub({
          notificationId: result.notification.id,
          userId: otherId,
          type: "message",
        });
      }
    } catch {
      // Delivery side-effects must not roll back a committed message.
    }

    return dto;
  }

  private async toMessageDto(
    msg: {
      id: string;
      convexId: string;
      conversationId: string;
      senderId: string;
      body: string;
      imageMediaId: string | null;
      read: boolean;
      messageCreatedAt: Date;
      idempotencyKey: string | null;
    },
    viewerId: string,
    conversationId: string,
    role: Profile["role"]
  ) {
    let imageUrl: string | null = null;
    if (msg.imageMediaId) {
      try {
        const signed = await this.media.createSignedDownloadUrl(
          msg.imageMediaId,
          {
            userId: viewerId,
            roles: [role],
            conversationIds: [conversationId],
          }
        );
        imageUrl = signed.url;
      } catch {
        imageUrl = null;
      }
    }
    return {
      id: msg.id,
      convexId: msg.convexId,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      message: msg.body,
      imageMediaId: msg.imageMediaId,
      imageUrl,
      read: msg.read,
      createdAt: msg.messageCreatedAt.toISOString(),
      idempotencyKey: msg.idempotencyKey,
    };
  }

  async markRead(userId: string, conversationId: string) {
    const profile = await this.requireProfile(userId);
    await this.failClosedRateLimit("chat.read", userId);
    const conv = await this.loadConversation(conversationId);
    this.assertParticipant(conv, userId);

    const current = readUnreadCount(
      conv.unreadByUser,
      userId,
      profile.convexUserId
    );
    const nextUnread = zeroUnread(
      conv.unreadByUser,
      userId,
      profile.convexUserId
    );

    await this.prisma.$transaction(async (tx) => {
      if (current > 0 || conv.unreadByUser == null) {
        await tx.conversation.update({
          where: { id: conversationId },
          data: { unreadByUser: nextUnread },
        });
      }
      await tx.message.updateMany({
        where: {
          conversationId,
          senderId: { not: userId },
          read: false,
        },
        data: { read: true },
      });
    });

    this.realtime.emitToUser(userId, "unread:update", {
      conversationId,
      unreadCount: 0,
    });
    this.realtime.emitToConversation(conversationId, "conversation:updated", {
      conversationId,
      messagesReadBy: userId,
    });

    return { ok: true as const, unreadCount: 0 };
  }

  async setTyping(
    userId: string,
    conversationId: string,
    isTyping: boolean
  ) {
    await this.requireProfile(userId);
    await this.failClosedRateLimit("chat.typing", userId);
    const conv = await this.loadConversation(conversationId);
    this.assertParticipant(conv, userId);

    await this.typing.setTyping(conversationId, userId, isTyping);
    const others = this.participantIds(conv).filter((id) => id !== userId);
    this.realtime.emitToUsers(others, "typing:update", {
      conversationId,
      userId,
      isTyping,
    });
    return { ok: true as const };
  }

  async getTyping(userId: string, conversationId: string) {
    await this.requireProfile(userId);
    const conv = await this.loadConversation(conversationId);
    this.assertParticipant(conv, userId);
    const isTyping = await this.typing.isOtherTyping(
      conversationId,
      userId,
      this.participantIds(conv)
    );
    return { isTyping };
  }

  async getMessageImageUrl(
    userId: string,
    conversationId: string,
    messageId: string
  ) {
    const profile = await this.requireProfile(userId);
    const conv = await this.loadConversation(conversationId);
    this.assertParticipant(conv, userId);

    const otherId = this.otherUserId(conv, userId);
    if (await this.isEitherBlocked(userId, otherId)) {
      throw new ForbiddenException("Not authorized");
    }

    const msg = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
    });
    if (!msg?.imageMediaId) {
      throw new NotFoundException("Image not found");
    }

    return this.media.createSignedDownloadUrl(msg.imageMediaId, {
      userId,
      roles: [profile.role],
      conversationIds: [conversationId],
    });
  }

  /** Authorize socket room join — returns participant ids or throws. */
  async assertSocketJoin(userId: string, conversationId: string) {
    const profile = await this.requireProfile(userId);
    const conv = await this.loadConversation(conversationId);
    this.assertParticipant(conv, userId);
    return {
      participantUserIds: this.participantIds(conv),
      banned: profile.banned,
    };
  }
}
