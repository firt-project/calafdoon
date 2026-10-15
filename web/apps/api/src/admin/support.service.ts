import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Inject } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.module";
import { MAIL_ADAPTER } from "../auth/auth.service";
import type { MailAdapter } from "../auth/mail.adapter";
import { AuditLogService } from "./audit-log.service";
import { maskEmail, parseLimit } from "./admin-auth.helpers";
import { PushService } from "../push/push.service";

const TOPIC_SUBJECTS: Record<string, string> = {
  photo_upload: "Can't upload profile photo",
  account: "Account help",
  payment: "Payment help",
  other: "Member support",
  contact_form: "Website contact form",
};

/** Answered / closed contacts are removed after this window. */
const CONTACT_RETENTION_MS = 30 * 60 * 1000;
const PURGE_INTERVAL_MS = 60_000;

@Injectable()
export class SupportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SupportService.name);
  private purgeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditLogService,
    @Inject(MAIL_ADAPTER) private readonly mail: MailAdapter,
    @Optional() private readonly push?: PushService
  ) {}

  onModuleInit() {
    void this.purgeExpiredContacts();
    this.purgeTimer = setInterval(() => {
      void this.purgeExpiredContacts();
    }, PURGE_INTERVAL_MS);
    this.purgeTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.purgeTimer) {
      clearInterval(this.purgeTimer);
      this.purgeTimer = null;
    }
  }

  /** Delete reviewed/closed contacts older than 30 minutes (messages first). */
  async purgeExpiredContacts(): Promise<number> {
    const cutoff = new Date(Date.now() - CONTACT_RETENTION_MS);
    const expired = await this.prisma.supportContact.findMany({
      where: {
        status: { in: ["reviewed", "closed"] },
        OR: [
          { reviewedAt: { lte: cutoff } },
          {
            reviewedAt: null,
            contactCreatedAt: { lte: cutoff },
          },
        ],
      },
      select: { id: true },
      take: 200,
    });
    if (!expired.length) return 0;
    const ids = expired.map((c) => c.id);
    await this.prisma.supportMessage.deleteMany({
      where: { contactId: { in: ids } },
    });
    const result = await this.prisma.supportContact.deleteMany({
      where: { id: { in: ids } },
    });
    if (result.count > 0) {
      this.logger.log(`Purged ${result.count} expired support contacts`);
    }
    return result.count;
  }

  private async rateLimitMember(userId: string) {
    const online = await this.redis.connect();
    if (!online || !this.redis.client) {
      throw new ServiceUnavailableException(
        "Service temporarily unavailable. Try again later."
      );
    }
    const key = `rl:admin.support:user:${userId}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, 3600);
    if (count > 5) {
      throw new BadRequestException(
        "Too many messages. Please try again later or use WhatsApp."
      );
    }
  }

  private async loadThread(contactId: string, contact: {
    message: string;
    source: string;
    userId: string | null;
    contactCreatedAt: Date;
  }) {
    const rows = await this.prisma.supportMessage.findMany({
      where: { contactId },
      orderBy: { messageCreatedAt: "asc" },
    });
    if (rows.length > 0) {
      return rows.map((row) => ({
        id: row.id,
        authorRole: row.authorRole,
        authorUserId: row.authorUserId,
        body: row.body,
        createdAt: row.messageCreatedAt.toISOString(),
      }));
    }
    return [
      {
        id: `legacy:${contactId}`,
        authorRole:
          contact.source === "contact_page" ? ("visitor" as const) : ("member" as const),
        authorUserId: contact.userId,
        body: contact.message,
        createdAt: contact.contactCreatedAt.toISOString(),
      },
    ];
  }

  async sendSupportMessage(
    userId: string,
    opts: {
      topic: "photo_upload" | "account" | "payment" | "other";
      message: string;
      source: "profile" | "questionnaire" | "contact_page" | "other";
    }
  ) {
    await this.rateLimitMember(userId);
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });
    if (!profile) throw new ForbiddenException("Profile not found");
    const message = opts.message.trim();
    if (message.length < 10) {
      throw new BadRequestException(
        "Please write a bit more detail (at least 10 characters)."
      );
    }
    if (message.length > 2000) throw new BadRequestException("Message is too long.");

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const now = new Date();
    const convexId = `local_support_${randomUUID()}`;
    const contact = await this.prisma.supportContact.create({
      data: {
        convexId,
        userId,
        convexUserId: user.convexId,
        name: profile.name,
        email: user.email,
        phone: profile.phone,
        topic: opts.topic,
        subject: TOPIC_SUBJECTS[opts.topic],
        message,
        source: opts.source,
        status: "open",
        contactCreatedAt: now,
      },
    });
    await this.prisma.supportMessage.create({
      data: {
        convexId: `local_sm_${randomUUID()}`,
        contactId: contact.id,
        convexContactId: convexId,
        authorUserId: userId,
        convexAuthorUserId: user.convexId,
        authorRole: "member",
        body: message,
        messageCreatedAt: now,
      },
    });
    return { contactId: contact.id };
  }

  async sendPublicContact(opts: {
    name: string;
    email: string;
    subject: string;
    message: string;
    companyWebsite?: string;
  }) {
    // Honeypot — bots that fill hidden fields are silently accepted.
    if (opts.companyWebsite?.trim()) {
      return { ok: true, contactId: null as string | null };
    }
    const name = opts.name.trim();
    const email = opts.email.trim().toLowerCase();
    const subject = opts.subject.trim();
    const message = opts.message.trim();
    if (name.length < 2) throw new BadRequestException("Please enter your name.");
    if (!email.includes("@")) throw new BadRequestException("Please enter a valid email.");
    if (subject.length < 3) throw new BadRequestException("Please enter a subject.");
    if (message.length < 10) {
      throw new BadRequestException(
        "Please write a bit more detail (at least 10 characters)."
      );
    }
    if (message.length > 2000) throw new BadRequestException("Message is too long.");

    const now = new Date();
    const convexId = `local_support_public_${randomUUID()}`;
    const contact = await this.prisma.supportContact.create({
      data: {
        convexId,
        userId: null,
        convexUserId: null,
        name,
        email,
        phone: null,
        topic: "contact_form",
        subject,
        message,
        source: "contact_page",
        status: "open",
        contactCreatedAt: now,
      },
    });
    await this.prisma.supportMessage.create({
      data: {
        convexId: `local_sm_${randomUUID()}`,
        contactId: contact.id,
        convexContactId: convexId,
        authorUserId: null,
        convexAuthorUserId: null,
        authorRole: "visitor",
        body: message,
        messageCreatedAt: now,
      },
    });
    return { ok: true, contactId: contact.id };
  }

  async replyAsMember(userId: string, contactId: string, messageRaw: string) {
    await this.rateLimitMember(userId);
    const contact = await this.prisma.supportContact.findUnique({
      where: { id: contactId },
    });
    if (!contact || contact.userId !== userId) {
      throw new NotFoundException("Contact not found");
    }
    if (contact.status === "closed") {
      throw new BadRequestException(
        "This conversation is closed. Start a new message."
      );
    }
    const message = messageRaw.trim();
    if (message.length < 2) throw new BadRequestException("Please write a message.");
    if (message.length > 2000) throw new BadRequestException("Message is too long.");

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const now = new Date();
    await this.prisma.supportMessage.create({
      data: {
        convexId: `local_sm_${randomUUID()}`,
        contactId,
        convexContactId: contact.convexId,
        authorUserId: userId,
        convexAuthorUserId: user.convexId,
        authorRole: "member",
        body: message,
        messageCreatedAt: now,
      },
    });
    await this.prisma.supportContact.update({
      where: { id: contactId },
      data: { status: "open", message },
    });
    return { ok: true };
  }

  /** Staff starts a support thread with any member (stays visible about a day). */
  async startAsAdmin(
    adminId: string,
    memberUserId: string,
    opts: { message: string; subject?: string }
  ) {
    const message = opts.message.trim();
    if (message.length < 2) throw new BadRequestException("Please write a message.");
    if (message.length > 2000) throw new BadRequestException("Message is too long.");
    const subject = (opts.subject?.trim() || "Message from support").slice(0, 120);

    const member = await this.prisma.user.findUnique({
      where: { id: memberUserId },
      include: { profile: { select: { name: true, phone: true, role: true } } },
    });
    if (!member || !member.profile) throw new NotFoundException("Member not found");
    if (member.profile.role !== "user") {
      throw new BadRequestException("You can only message members here.");
    }
    const admin = await this.prisma.user.findUniqueOrThrow({ where: { id: adminId } });

    const now = new Date();
    const convexId = `local_support_${randomUUID()}`;
    const contact = await this.prisma.supportContact.create({
      data: {
        convexId,
        userId: memberUserId,
        convexUserId: member.convexId,
        name: member.profile.name,
        email: member.email,
        phone: member.profile.phone,
        topic: "other",
        subject,
        message,
        source: "other",
        status: "reviewed",
        contactCreatedAt: now,
        // Purge runs 30 min after reviewedAt; push it out so the member has a day to read it.
        reviewedAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        reviewedById: adminId,
      },
    });
    await this.prisma.supportMessage.create({
      data: {
        convexId: `local_sm_${randomUUID()}`,
        contactId: contact.id,
        convexContactId: convexId,
        authorUserId: adminId,
        convexAuthorUserId: admin.convexId,
        authorRole: "admin",
        body: message,
        messageCreatedAt: now,
      },
    });
    await this.prisma.notification.create({
      data: {
        convexId: `local_notif_${randomUUID()}`,
        userId: memberUserId,
        convexUserId: member.convexId,
        type: "announcement",
        title: "Message from support",
        body: message.slice(0, 200),
        read: false,
        notificationCreatedAt: now,
      },
    });
    void this.push?.sendToUsers([memberUserId], {
      title: "Message from support",
      body: message,
      data: { type: "announcement", route: "/settings/support" },
      kind: "announcement",
    });
    if (member.email) {
      await this.mail
        .send({
          to: member.email,
          subject: "Message from Hel Calafkaaga support",
          text: `${message}\n\nOpen the app and go to Settings → Support to reply.`,
        })
        .catch(() => undefined);
    }
    await this.audit.write({
      actorUserId: adminId,
      action: "support_contact_started",
      targetUserId: memberUserId,
      metadata: { contactId: contact.id },
    });
    return { ok: true as const, contactId: contact.id };
  }

  async replyAsAdmin(adminId: string, contactId: string, messageRaw: string) {
    const contact = await this.prisma.supportContact.findUnique({
      where: { id: contactId },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    if (!contact.userId && !contact.email) {
      throw new BadRequestException(
        "This contact left no email or member account, so they cannot be reached."
      );
    }
    const message = messageRaw.trim();
    if (message.length < 2) throw new BadRequestException("Please write a reply.");
    if (message.length > 2000) throw new BadRequestException("Message is too long.");

    const admin = await this.prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    const now = new Date();
    await this.prisma.supportMessage.create({
      data: {
        convexId: `local_sm_${randomUUID()}`,
        contactId,
        convexContactId: contact.convexId,
        authorUserId: adminId,
        convexAuthorUserId: admin.convexId,
        authorRole: "admin",
        body: message,
        messageCreatedAt: now,
      },
    });

    const nextStatus =
      contact.status === "closed" ? ("closed" as const) : ("reviewed" as const);
    await this.prisma.supportContact.update({
      where: { id: contactId },
      data: {
        status: nextStatus,
        message,
        reviewedAt: new Date(),
        reviewedById: adminId,
      },
    });

    if (!contact.userId) {
      // Website visitor without an account: answer by email only.
      await this.mail.send({
        to: contact.email!,
        subject: `Re: ${contact.subject}`,
        text: message,
      });
      await this.audit.write({
        actorUserId: adminId,
        action: "support_contact_reply",
        metadata: { contactId, viaEmail: true },
      });
      return { ok: true, status: nextStatus, purgeInMinutes: 30 };
    }

    const member = await this.prisma.user.findUniqueOrThrow({
      where: { id: contact.userId },
    });
    await this.prisma.notification.create({
      data: {
        convexId: `local_notif_${randomUUID()}`,
        userId: contact.userId,
        convexUserId: member.convexId,
        type: "announcement",
        title: "Support reply",
        body: message.slice(0, 200),
        read: false,
        notificationCreatedAt: now,
      },
    });
    if (member.email) {
      await this.mail.send({
        to: member.email,
        subject: "Support reply from Web",
        text: `${message}\n\nThis conversation will be removed automatically after 30 minutes.\nOpen the app: /profile`,
      });
    }
    await this.audit.write({
      actorUserId: adminId,
      action: "support_contact_reply",
      targetUserId: contact.userId,
      metadata: { contactId, autoReviewed: true },
    });
    return { ok: true, status: nextStatus, purgeInMinutes: 30 };
  }

  async listMine(userId: string) {
    await this.purgeExpiredContacts();
    const contacts = await this.prisma.supportContact.findMany({
      where: { userId },
      orderBy: { contactCreatedAt: "desc" },
      take: 10,
    });
    return Promise.all(
      contacts.map(async (c) => {
        const thread = await this.loadThread(c.id, c);
        return {
          id: c.id,
          _id: c.id,
          topic: c.topic,
          subject: c.subject,
          status: c.status,
          createdAt: c.contactCreatedAt.toISOString(),
          thread,
          messages: thread,
        };
      })
    );
  }

  async getMine(userId: string, contactId: string) {
    const contact = await this.prisma.supportContact.findUnique({
      where: { id: contactId },
    });
    if (!contact || contact.userId !== userId) {
      throw new NotFoundException("Contact not found");
    }
    return {
      ...contact,
      email: maskEmail(contact.email),
      messages: await this.loadThread(contact.id, contact),
    };
  }

  async listAdmin(opts: {
    status?: "open" | "reviewed" | "closed";
    cursor?: string;
    limit?: number;
  }) {
    await this.purgeExpiredContacts();
    const limit = parseLimit(String(opts.limit ?? 50), 50, 100);
    const rows = await this.prisma.supportContact.findMany({
      where: {
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.cursor ? { id: { lt: opts.cursor } } : {}),
      },
      orderBy: { contactCreatedAt: "desc" },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: await Promise.all(
        page.map(async (c) => {
          const profile = c.userId
            ? await this.prisma.profile.findUnique({
                where: { userId: c.userId },
                select: { id: true, phone: true },
              })
            : null;
          const thread = await this.loadThread(c.id, c);
          return {
            _id: c.id,
            id: c.id,
            name: c.name,
            email: maskEmail(c.email),
            phone: profile?.phone ?? c.phone ?? null,
            topic: c.topic,
            subject: c.subject,
            status: c.status,
            source: c.source,
            profileId: profile?.id ?? null,
            createdAt: c.contactCreatedAt.getTime(),
            canReply: !!c.userId,
            thread: thread.map((m) => ({
              ...m,
              createdAt:
                typeof m.createdAt === "string"
                  ? Date.parse(m.createdAt) || 0
                  : m.createdAt,
            })),
          };
        })
      ),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  async getAdmin(contactId: string) {
    const contact = await this.prisma.supportContact.findUnique({
      where: { id: contactId },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    return {
      ...contact,
      email: maskEmail(contact.email),
      canReply: !!contact.userId,
      messages: await this.loadThread(contact.id, contact),
    };
  }

  async updateStatus(
    adminId: string,
    contactId: string,
    status: "open" | "reviewed" | "closed"
  ) {
    const contact = await this.prisma.supportContact.findUnique({
      where: { id: contactId },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    await this.prisma.supportContact.update({
      where: { id: contactId },
      data: {
        status,
        reviewedAt:
          status === "open" ? null : contact.reviewedAt ?? new Date(),
        reviewedById: status === "open" ? null : adminId,
        adminNotes: null,
      },
    });
    await this.audit.write({
      actorUserId: adminId,
      action: `support_contact_${status}`,
      targetUserId: contact.userId,
      metadata: { contactId },
    });
    return { ok: true, purgeInMinutes: status === "open" ? null : 30 };
  }
}
