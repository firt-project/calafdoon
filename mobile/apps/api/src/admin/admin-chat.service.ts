import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { parseLimit } from "./admin-auth.helpers";

type MemberCard = {
  userId: string;
  name: string;
  profileId: string | null;
  imageUrl: string | null;
  gender: string | null;
};

@Injectable()
export class AdminChatService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveMember(userId: string, cache: Map<string, MemberCard>) {
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
      imageUrl: null,
      gender: profile?.gender ?? null,
    };
    cache.set(userId, info);
    return info;
  }

  async listConversations(limitRaw?: number) {
    const limit = Math.min(Math.max(limitRaw ?? 40, 1), 80);
    const conversations = await this.prisma.conversation.findMany({
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
        this.resolveMember(userA, cache),
        this.resolveMember(userB, cache),
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

  async getThread(conversationId: string, limitRaw?: number) {
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
      this.resolveMember(conversation.match.userAId, cache),
      this.resolveMember(conversation.match.userBId, cache),
    ]);

    return {
      conversationId: conversation.id,
      truncated,
      memberA,
      memberB,
      messages: messagesAsc.map((m) => ({
        _id: m.id,
        id: m.id,
        body: m.body,
        hasImage: Boolean(m.imageMediaId || m.imageConvexId),
        senderId: m.senderId,
        createdAt: m.messageCreatedAt.getTime(),
        read: m.read,
      })),
    };
  }
}
