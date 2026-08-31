import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Inject } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeEmail } from "../auth/crypto-util";
import {
  isOwnerRole,
  isStaffRole,
  STAFF_PROFILE_COMPLETION_PATCH,
} from "../common/access";
import { MAIL_ADAPTER } from "../auth/auth.service";
import type { MailAdapter } from "../auth/mail.adapter";
import { AuditLogService } from "./audit-log.service";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function generateInviteToken(): string {
  const alphabet =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(48);
  let out = "";
  for (let i = 0; i < 48; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isInviteActive(invite: { status: string; expiresAt: Date }) {
  return invite.status === "pending" && invite.expiresAt.getTime() > Date.now();
}

@Injectable()
export class StaffInvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    @Inject(MAIL_ADAPTER) private readonly mail: MailAdapter
  ) {}

  private async findByToken(token: string) {
    const tokenHash = hashToken(token);
    const byHash = await this.prisma.staffInvite.findUnique({
      where: { tokenHash },
    });
    if (byHash) return byHash;
    // Migrated plaintext tokens remain lookupable
    return this.prisma.staffInvite.findUnique({ where: { token } });
  }

  async list() {
    const invites = await this.prisma.staffInvite.findMany({
      orderBy: { inviteCreatedAt: "desc" },
    });
    const now = Date.now();
    return invites.map((invite) => {
      const status =
        invite.status === "pending" && invite.expiresAt.getTime() <= now
          ? ("expired" as const)
          : invite.status;
      return {
        // UI expects Convex-shaped `_id` for keys and revoke/resend actions.
        _id: invite.id,
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status,
        createdAt: invite.inviteCreatedAt.toISOString(),
        expiresAt: invite.expiresAt.getTime(),
        acceptedAt: invite.acceptedAt?.toISOString() ?? null,
      };
    });
  }

  async getByToken(token: string) {
    const invite = await this.findByToken(token);
    if (!invite) return { valid: false as const, reason: "not_found" as const };
    if (invite.status === "revoked") {
      return { valid: false as const, reason: "revoked" as const };
    }
    if (invite.status === "accepted") {
      return { valid: false as const, reason: "accepted" as const };
    }
    if (
      invite.status === "expired" ||
      invite.expiresAt.getTime() <= Date.now()
    ) {
      return { valid: false as const, reason: "expired" as const };
    }
    return {
      valid: true as const,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  async create(ownerUserId: string, emailRaw: string) {
    const email = normalizeEmail(emailRaw);
    if (!email.includes("@") || email.length < 5) {
      throw new BadRequestException("Enter a valid email address.");
    }

    const existingUser = await this.prisma.user.findFirst({
      where: { emailNormalized: email },
      include: { profile: true },
    });
    if (existingUser?.profile && isStaffRole(existingUser.profile.role)) {
      throw new BadRequestException("This email already has staff access.");
    }

    const pending = await this.prisma.staffInvite.findMany({
      where: { email },
    });
    if (pending.some((i) => isInviteActive(i))) {
      throw new BadRequestException(
        "A pending invite already exists for this email."
      );
    }

    const token = generateInviteToken();
    const tokenHash = hashToken(token);
    const now = new Date();
    const owner = await this.prisma.user.findUniqueOrThrow({
      where: { id: ownerUserId },
    });

    // Store placeholder in token column (unique) — raw token only emailed
    const invite = await this.prisma.staffInvite.create({
      data: {
        convexId: `local_invite_${randomUUID()}`,
        email,
        token: `hash:${tokenHash}`,
        tokenHash,
        role: "admin",
        invitedById: ownerUserId,
        convexInvitedBy: owner.convexId,
        status: "pending",
        inviteCreatedAt: now,
        expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
      },
    });

    await this.mail.send({
      to: email,
      subject: "You're invited to Hel Calafkaaga staff",
      text: `You have been invited as admin.\n\nAccept: /admin/invite?token=${token}\n\nThis invite expires in 7 days.`,
    });

    await this.audit.write({
      actorUserId: ownerUserId,
      action: "create_staff_invite",
      metadata: { email, inviteId: invite.id },
    });

    return { inviteId: invite.id, email };
  }

  async revoke(ownerUserId: string, inviteId: string) {
    const invite = await this.prisma.staffInvite.findUnique({
      where: { id: inviteId },
    });
    if (!invite) throw new NotFoundException("Invite not found.");
    if (invite.status !== "pending") {
      throw new BadRequestException("Only pending invites can be revoked.");
    }
    await this.prisma.staffInvite.update({
      where: { id: inviteId },
      data: { status: "revoked" },
    });
    await this.audit.write({
      actorUserId: ownerUserId,
      action: "revoke_staff_invite",
      metadata: { inviteId },
    });
    return { success: true };
  }

  async accept(userId: string, token: string) {
    const invite = await this.findByToken(token);
    if (!invite) throw new NotFoundException("Invite not found.");
    if (invite.status === "revoked") {
      throw new BadRequestException("This invite was revoked.");
    }
    if (invite.status === "accepted") {
      throw new BadRequestException("This invite was already accepted.");
    }
    if (
      invite.status === "expired" ||
      invite.expiresAt.getTime() <= Date.now()
    ) {
      await this.prisma.staffInvite.update({
        where: { id: invite.id },
        data: { status: "expired" },
      });
      throw new BadRequestException(
        "This invite has expired. Ask the owner for a new one."
      );
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!user.email) {
      throw new BadRequestException(
        "Your account does not have an email address."
      );
    }
    if (normalizeEmail(user.email) !== invite.email) {
      throw new BadRequestException(
        "Sign in with the invited email address to accept."
      );
    }

    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException("Profile not found.");
    if (isOwnerRole(profile.role)) {
      throw new BadRequestException(
        "The owner account cannot accept an admin invite."
      );
    }

    if (!isStaffRole(profile.role)) {
      await this.prisma.profile.update({
        where: { id: profile.id },
        data: {
          role: "admin",
          ...STAFF_PROFILE_COMPLETION_PATCH,
        },
      });
    }

    await this.prisma.staffInvite.update({
      where: { id: invite.id },
      data: {
        status: "accepted",
        acceptedAt: new Date(),
        acceptedByUserId: userId,
        convexAcceptedByUserId: user.convexId,
      },
    });

    await this.audit.write({
      actorUserId: userId,
      action: "accept_staff_invite",
      metadata: { inviteId: invite.id },
    });

    return { success: true };
  }
}
