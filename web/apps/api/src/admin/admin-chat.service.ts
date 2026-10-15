import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import { MediaAccessService } from "../media/media-access.service";
import { PrismaService } from "../prisma/prisma.service";
import { parseLimit } from "./admin-auth.helpers";

export type StaffCtx = { userId: string; role: "admin" | "owner" };

type MemberCard = {
  userId: string;
  name: string;
  profileId: string | null;
  imageUrl: string | null;
  gender: string | null;
};

@Injectable()
export class AdminChatService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly media?: MediaAccessService
  ) {}

  private async sign(mediaId: string | null | undefined, staff?: StaffCtx) {
    if (!mediaId || !staff || !this.media) return null;
    try {
      const r = await this.media.createSignedDownloadUrl(mediaId, {
        userId: staff.userId,
        roles: [staff.role],
      });
      return r.url;
    } catch {
      return null;
    }
  }

  private async resolveMember(
    userId: string,
    cache: Map<string, MemberCard>,
    staff?: StaffCtx
  ) {
    const cached = cache.get(userId);
    if (cached) return cached;
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: {
        id: true,
        name: true,
        gender: true,
        profileImageMediaId: true,
      },
    });
    const info: MemberCard = {
      userId,
      name: profile?.name ?? "Unknown",
      profileId: profile?.id ?? null,
      imageUrl: await this.sign(profile?.profileImageMediaId, staff),
      gender: profile?.gender ?? null,
    };
    cache.set(userId, info);
    return info;
  }

  async listConversations(limitRaw?: number, search?: string, staff?: StaffCtx) {
    const limit = Math.min(Math.max(limitRaw ?? 40, 1), 80);
    const q = search?.trim();
    const conversations = await this.prisma.conversation.findMany({
      where: q
        ? {
            match: {
              OR: [
                { userA: { profile: { name: { contains: q, mode: "insensitive" } } } },
                { userB: { profile: { name: { contains: q, mode: "insensitive" } } } },
                { userA: { email: { contains: q, mode: "insensitive" } } },
                { userB: { email: { contains: q, mode: "insensitive" } } },
              ],
            },
          }
        : undefined,
      orderBy: { lastMessageAt: "desc" },
      take: limit,
      include: {
        match: { select: { userAId: true, userBId: true } },
      },
    });

    const cache = new Map<string, MemberCard>();
    const rows = [];
    for (const conversation of conversations) {
      const userA = conversation.match.userAId;
      const userB = conversation.match.userBId;
      const [memberA, memberB] = await Promise.all([
        this.resolveMember(userA, cache, staff),
        this.resolveMember(userB, cache, staff),
      ]);
      const last = await this.prisma.message.findFirst({
        where: { conversationId: conversation.id },
        orderBy: { messageCreatedAt: "desc" },
      });
      rows.push({
        conversationId: conversation.id,
        lastMessageAt: conversation.lastMessageAt.getTime(),
        lastMessage: last
          ? {
              body:
                last.body?.trim() ||
                (last.imageMediaId || last.imageConvexId ? "[Image]" : ""),
              hasImage: Boolean(last.imageMediaId || last.imageConvexId),
              senderId: last.senderId,
              createdAt: last.messageCreatedAt.getTime(),
            }
          : null,
        memberA,
        memberB,
      });
    }
    return rows;
  }

  async getThread(conversationId: string, limitRaw?: number, staff?: StaffCtx) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        match: { select: { userAId: true, userBId: true } },
      },
    });
    if (!conversation) throw new NotFoundException("Conversation not found");

    const limit = Math.min(Math.max(limitRaw ?? 500, 1), 1000);
    const newestFirst = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { messageCreatedAt: "desc" },
      take: limit,
    });
    const truncated = newestFirst.length >= limit;
    const messagesAsc = [...newestFirst].reverse();
    const cache = new Map<string, MemberCard>();
    const [memberA, memberB] = await Promise.all([
      this.resolveMember(conversation.match.userAId, cache, staff),
      this.resolveMember(conversation.match.userBId, cache, staff),
    ]);
    const messages = await Promise.all(
      messagesAsc.map(async (m) => ({
        _id: m.id,
        id: m.id,
        body: m.body,
        hasImage: Boolean(m.imageMediaId || m.imageConvexId),
        imageUrl: await this.sign(m.imageMediaId, staff),
        senderId: m.senderId,
        createdAt: m.messageCreatedAt.getTime(),
        read: m.read,
        deleted: Boolean(m.deletedAt),
      }))
    );

    return {
      conversationId: conversation.id,
      truncated,
      memberA,
      memberB,
      messages,
    };
  }

  /** The match conversation between two members (for jumping from a report). */
  async findBetween(a: string, b: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        OR: [
          { match: { userAId: a, userBId: b } },
          { match: { userAId: b, userBId: a } },
        ],
      },
      select: { id: true },
    });
    return { conversationId: conversation?.id ?? null };
  }
}
