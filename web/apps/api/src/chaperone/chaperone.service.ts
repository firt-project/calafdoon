import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { ChatRealtimeService } from "../chat/chat-realtime.service";
import { PushService } from "../push/push.service";
import { signGuardianToken, verifyGuardianToken } from "./guardian-token";

export const RELATIONSHIPS = ["father", "mother", "brother", "sister", "uncle", "aunt", "imam", "other"] as const;
const LINK_VALID_DAYS = 30;
const GUARDIAN_MESSAGE_LIMIT = 300;

type Participant = { userId: string; name: string };

@Injectable()
export class ChaperoneService {
  private readonly logger = new Logger(ChaperoneService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly realtime?: ChatRealtimeService,
    @Optional() private readonly push?: PushService
  ) {}

  private secret(): string {
    return (
      this.config.get<string>("SESSION_SECRET") ??
      this.config.get<string>("AUTH_SECRET") ??
      "dev-only-guardian-secret"
    );
  }

  private baseUrl(): string {
    return (this.config.get<string>("APP_URL") ?? "https://www.helcalafkaaga.com").replace(/\/$/, "");
  }

  private async loadConversation(userId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { match: { select: { status: true, userAId: true, userBId: true } } },
    });
    if (!conv || !conv.participantUserIds.includes(userId)) {
      throw new NotFoundException("Conversation not found");
    }
    return conv;
  }

  private otherOf(conv: { participantUserIds: string[] }, userId: string): string {
    const other = conv.participantUserIds.find((id) => id !== userId);
    if (!other) throw new NotFoundException("Conversation not found");
    return other;
  }

  private async names(userIds: string[]): Promise<Map<string, string>> {
    const rows = await this.prisma.profile.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, name: true },
    });
    return new Map(rows.map((r) => [r.userId, (r.name ?? "Member").split(" ")[0] ?? "Member"]));
  }

  /** Expire anything past its date so status is always truthful. */
  private async expireOld(conversationId: string) {
    await this.prisma.chatChaperone.updateMany({
      where: { conversationId, status: "active", expiresAt: { lt: new Date() } },
      data: { status: "revoked" },
    });
  }

  private notify(userId: string, title: string, body: string, conversationId: string, relatedUserId?: string) {
    void (async () => {
      try {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { convexId: true } });
        await this.prisma.notification.create({
          data: {
            convexId: `local_notif_${randomUUID()}`,
            userId,
            convexUserId: user?.convexId ?? `local_${userId}`,
            type: "message",
            title,
            body,
            read: false,
            relatedUserId: relatedUserId ?? null,
            notificationCreatedAt: new Date(),
          },
        });
        void this.push?.sendToUsers([userId], {
          title,
          body,
          data: { type: "message", route: `/messages/${conversationId}` },
          kind: "message",
        });
      } catch (err) {
        this.logger.warn(`chaperone notify failed: ${err instanceof Error ? err.name : "unknown"}`);
      }
    })();
  }

  private emit(conv: { participantUserIds: string[] }, conversationId: string) {
    try {
      this.realtime?.emitToUsers(conv.participantUserIds, "chaperone:updated", { conversationId });
    } catch {
      /* realtime is best-effort */
    }
  }

  // ───────────────────────── members ─────────────────────────

  async list(userId: string, conversationId: string) {
    const conv = await this.loadConversation(userId, conversationId);
    await this.expireOld(conversationId);
    const rows = await this.prisma.chatChaperone.findMany({
      where: { conversationId, status: { in: ["pending", "active"] } },
      orderBy: { createdAt: "asc" },
    });
    const names = await this.names(conv.participantUserIds);
    return {
      items: rows.map((r) => ({
        id: r.id,
        status: r.status,
        guardianName: r.guardianName,
        relationship: r.relationship,
        invitedByMe: r.invitedById === userId,
        invitedByName: names.get(r.invitedById) ?? "A member",
        expiresAt: r.expiresAt?.toISOString() ?? null,
        viewCount: r.viewCount,
        lastViewedAt: r.lastViewedAt?.toISOString() ?? null,
        // Only the member who invited the guardian can get the link, and only once both agreed.
        link:
          r.status === "active" && r.invitedById === userId
            ? `${this.baseUrl()}/guardian/${signGuardianToken(this.secret(), r.id)}`
            : null,
      })),
    };
  }

  async invite(
    userId: string,
    conversationId: string,
    input: { guardianName: string; relationship: string }
  ) {
    const conv = await this.loadConversation(userId, conversationId);
    if (conv.match.status !== "active") {
      throw new ForbiddenException("This match is no longer active.");
    }
    const otherId = this.otherOf(conv, userId);
    const blocked = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: otherId },
          { blockerId: otherId, blockedId: userId },
        ],
      },
      select: { id: true },
    });
    if (blocked) throw new ForbiddenException("You cannot add a guardian to this chat.");

    const guardianName = input.guardianName.trim().replace(/\s+/g, " ");
    if (guardianName.length < 2 || guardianName.length > 60) {
      throw new BadRequestException("Enter your guardian's name.");
    }
    if (!(RELATIONSHIPS as readonly string[]).includes(input.relationship)) {
      throw new BadRequestException("Choose how this person is related to you.");
    }
    await this.expireOld(conversationId);
    try {
      const row = await this.prisma.chatChaperone.create({
        data: {
          conversationId,
          invitedById: userId,
          guardianName,
          relationship: input.relationship,
          status: "pending",
        },
      });
      const names = await this.names([userId]);
      this.notify(
        otherId,
        "Guardian request",
        `${names.get(userId) ?? "Your match"} would like to add their guardian (${guardianName}) to follow your chat. You can accept or decline.`,
        conversationId,
        userId
      );
      this.emit(conv, conversationId);
      return { id: row.id, status: row.status };
    } catch (err) {
      if ((err as { code?: string })?.code === "P2002") {
        throw new ConflictException("You already have a guardian on this chat. Remove them first.");
      }
      throw err;
    }
  }

  /** The other member accepts or declines. The inviter can never accept their own request. */
  async respond(userId: string, conversationId: string, chaperoneId: string, accept: boolean) {
    const conv = await this.loadConversation(userId, conversationId);
    const row = await this.prisma.chatChaperone.findFirst({
      where: { id: chaperoneId, conversationId },
    });
    if (!row) throw new NotFoundException("Request not found");
    if (row.invitedById === userId) {
      throw new ForbiddenException("The other member has to answer this request.");
    }
    if (row.status !== "pending") throw new ConflictException("This request was already answered.");
    const now = new Date();
    await this.prisma.chatChaperone.update({
      where: { id: row.id },
      data: accept
        ? {
            status: "active",
            acceptedAt: now,
            expiresAt: new Date(now.getTime() + LINK_VALID_DAYS * 24 * 60 * 60 * 1000),
          }
        : { status: "declined" },
    });
    const names = await this.names([userId]);
    this.notify(
      row.invitedById,
      accept ? "Guardian request accepted" : "Guardian request declined",
      accept
        ? `${names.get(userId) ?? "Your match"} agreed. Open the chat to share the link with ${row.guardianName}.`
        : `${names.get(userId) ?? "Your match"} preferred not to add a guardian to this chat.`,
      conversationId,
      userId
    );
    this.emit(conv, conversationId);
    return { ok: true as const, status: accept ? "active" : "declined" };
  }

  /** Either member can end it at any time; the link stops working immediately. */
  async revoke(userId: string, conversationId: string, chaperoneId: string) {
    const conv = await this.loadConversation(userId, conversationId);
    const res = await this.prisma.chatChaperone.updateMany({
      where: { id: chaperoneId, conversationId, status: { in: ["pending", "active"] } },
      data: { status: "revoked" },
    });
    if (res.count === 0) throw new NotFoundException("Guardian not found");
    const otherId = this.otherOf(conv, userId);
    const names = await this.names([userId]);
    this.notify(otherId, "Guardian removed", `${names.get(userId) ?? "Your match"} ended guardian access to this chat.`, conversationId, userId);
    this.emit(conv, conversationId);
    return { ok: true as const };
  }

  // ───────────────────────── guardian (public, read-only) ─────────────────────────

  async guardianView(token: string) {
    const id = verifyGuardianToken(this.secret(), token);
    if (!id) throw new NotFoundException("This link is not valid.");
    const row = await this.prisma.chatChaperone.findUnique({ where: { id } });
    if (
      !row ||
      row.status !== "active" ||
      !row.expiresAt ||
      row.expiresAt.getTime() < Date.now()
    ) {
      throw new NotFoundException("This link is not valid or has ended.");
    }
    const conv = await this.prisma.conversation.findUnique({
      where: { id: row.conversationId },
      select: { participantUserIds: true },
    });
    if (!conv) throw new NotFoundException("This link is not valid.");
    const names = await this.names(conv.participantUserIds);
    const messages = await this.prisma.message.findMany({
      where: { conversationId: row.conversationId, deletedAt: null },
      orderBy: { messageCreatedAt: "desc" },
      take: GUARDIAN_MESSAGE_LIMIT,
      select: { id: true, senderId: true, body: true, imageMediaId: true, messageCreatedAt: true },
    });
    await this.prisma.chatChaperone.update({
      where: { id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });
    const inviterName = names.get(row.invitedById) ?? "Member";
    const otherName = names.get(this.otherOf(conv, row.invitedById)) ?? "Member";
    return {
      guardianName: row.guardianName,
      invitedByName: inviterName,
      otherName,
      expiresAt: row.expiresAt.toISOString(),
      // Text only: photos are never shown to a guardian.
      messages: messages
        .filter((m) => m.body.trim() || m.imageMediaId)
        .reverse()
        .map((m) => ({
          id: m.id,
          from: names.get(m.senderId) ?? "Member",
          fromInviter: m.senderId === row.invitedById,
          text: m.imageMediaId && !m.body.trim() ? "[photo not shown]" : m.body,
          at: m.messageCreatedAt.toISOString(),
        })),
    };
  }
}
