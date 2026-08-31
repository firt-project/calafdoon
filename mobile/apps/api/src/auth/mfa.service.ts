import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthAuditAction } from "@prisma/client";
import { randomUUID } from "node:crypto";
import * as QRCode from "qrcode";
import { isStaffRole } from "../common/access";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanDisableTarget } from "../admin/admin-auth.helpers";
import { hashToken } from "./crypto-util";
import {
  encryptMfaSecret,
  decryptMfaSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
} from "./mfa-crypto";
import {
  generateTotpSecret,
  totpOtpauthUrl,
  verifyTotpCode,
  randomChallengeToken,
} from "./mfa-totp";
import { SessionService } from "./session.service";
import { verifyPassword } from "./password";
import { isStaffMfaRequired } from "./staff-mfa-policy";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sessions: SessionService
  ) {}

  private sessionSecret(): string {
    const s =
      this.config.get<string>("SESSION_SECRET") ??
      this.config.get<string>("AUTH_SECRET");
    if (!s || s.length < 16) {
      throw new Error("SESSION_SECRET required for MFA");
    }
    return s;
  }

  private async audit(
    action: AuthAuditAction,
    opts: { userId?: string | null; metadata?: Record<string, unknown>; ip?: string }
  ) {
    await this.prisma.authAuditEvent.create({
      data: {
        action,
        userId: opts.userId ?? null,
        metadata: (opts.metadata ?? undefined) as object | undefined,
        ipHash: this.sessions.hashIp(opts.ip),
      },
    });
  }

  async status(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { profile: { select: { role: true } } },
    });
    const role = user.profile?.role ?? "user";
    const remaining = await this.prisma.mfaRecoveryCode.count({
      where: { userId, usedAt: null },
    });
    const required = isStaffMfaRequired(this.config) && isStaffRole(role);
    return {
      eligible: isStaffRole(role),
      required,
      enabled: user.mfaEnabled,
      enabledAt: user.mfaEnabledAt?.toISOString() ?? null,
      pendingEnrollment: Boolean(user.mfaPendingSecretEncrypted),
      recoveryCodesRemaining: remaining,
    };
  }

  async enrollStart(userId: string, ip?: string) {
    const user = await this.requireStaff(userId);
    if (user.mfaEnabled) {
      throw new BadRequestException("MFA is already enabled");
    }
    const secret = generateTotpSecret();
    const enc = encryptMfaSecret(secret, this.sessionSecret());
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaPendingSecretEncrypted: enc },
    });
    const email = user.emailNormalized ?? user.email ?? "staff";
    const otpauthUrl = totpOtpauthUrl(secret, email);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240,
    });
    await this.audit("mfa_enroll_start", { userId, ip });
    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  async enrollCancel(userId: string, ip?: string) {
    await this.requireStaff(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaPendingSecretEncrypted: null },
    });
    await this.audit("mfa_enroll_cancel", { userId, ip });
    return { ok: true as const };
  }

  async enrollConfirm(userId: string, code: string, ip?: string) {
    const user = await this.requireStaff(userId);
    if (user.mfaEnabled) {
      throw new BadRequestException("MFA is already enabled");
    }
    if (!user.mfaPendingSecretEncrypted) {
      throw new BadRequestException("Start MFA enrollment first");
    }
    const secret = decryptMfaSecret(
      user.mfaPendingSecretEncrypted,
      this.sessionSecret()
    );
    const verified = verifyTotpCode(secret, code);
    if (!verified.ok) {
      await this.audit("mfa_login_failure", {
        userId,
        metadata: { reason: "enroll_bad_code" },
        ip,
      });
      throw new UnauthorizedException("Invalid authenticator code");
    }

    const recovery = generateRecoveryCodes(10);
    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({
        data: recovery.map((c) => ({
          id: randomUUID(),
          userId,
          codeHash: hashRecoveryCode(c),
        })),
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: true,
          mfaSecretEncrypted: encryptMfaSecret(secret, this.sessionSecret()),
          mfaPendingSecretEncrypted: null,
          mfaEnabledAt: new Date(),
          mfaLastStep: verified.step,
        },
      });
    });

    await this.audit("mfa_enroll_confirm", { userId, ip });
    return { ok: true as const, recoveryCodes: recovery };
  }

  async disable(
    userId: string,
    opts: { password: string; code: string; ip?: string }
  ) {
    const user = await this.requireStaff(userId);
    if (isStaffMfaRequired(this.config)) {
      throw new ForbiddenException(
        "MFA is required for staff accounts. Ask an owner to reset MFA if you lost your device."
      );
    }
    if (!user.mfaEnabled || !user.mfaSecretEncrypted) {
      throw new BadRequestException("MFA is not enabled");
    }
    await this.assertPassword(userId, opts.password);
    await this.assertTotpOrRecovery(userId, opts.code, opts.ip, {
      allowRecovery: true,
      consumeRecovery: true,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaLoginChallenge.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: false,
          mfaSecretEncrypted: null,
          mfaPendingSecretEncrypted: null,
          mfaEnabledAt: null,
          mfaLastStep: null,
        },
      });
    });
    await this.audit("mfa_disable", { userId, ip: opts.ip });
    return { ok: true as const };
  }

  async regenerateRecoveryCodes(
    userId: string,
    opts: { code: string; ip?: string }
  ) {
    const user = await this.requireStaff(userId);
    if (!user.mfaEnabled) {
      throw new BadRequestException("MFA is not enabled");
    }
    await this.assertTotpOrRecovery(userId, opts.code, opts.ip, {
      allowRecovery: false,
      consumeRecovery: false,
    });
    const recovery = generateRecoveryCodes(10);
    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({
        data: recovery.map((c) => ({
          id: randomUUID(),
          userId,
          codeHash: hashRecoveryCode(c),
        })),
      });
    });
    await this.audit("mfa_recovery_regen", { userId, ip: opts.ip });
    return { ok: true as const, recoveryCodes: recovery };
  }

  async createLoginChallenge(userId: string, ip?: string) {
    const raw = randomChallengeToken();
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    await this.prisma.mfaLoginChallenge.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        ipHash: this.sessions.hashIp(ip),
      },
    });
    await this.audit("mfa_login_challenge", { userId, ip });
    return { mfaToken: raw, expiresAt };
  }

  async completeLoginChallenge(opts: {
    mfaToken: string;
    code: string;
    ip?: string;
    userAgent?: string;
  }) {
    const tokenHash = hashToken(opts.mfaToken);
    const challenge = await this.prisma.mfaLoginChallenge.findUnique({
      where: { tokenHash },
    });
    const fail = async (reason: string, userId?: string) => {
      await this.audit("mfa_login_failure", {
        userId,
        metadata: { reason },
        ip: opts.ip,
      });
      throw new UnauthorizedException("Invalid or expired MFA code");
    };

    if (!challenge || challenge.consumedAt) await fail("missing_or_used");
    if (challenge!.expiresAt.getTime() <= Date.now()) {
      await fail("expired", challenge!.userId);
    }

    const userId = challenge!.userId;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: {
          select: { role: true, banned: true, hasPaid: true },
        },
      },
    });
    if (!user?.mfaEnabled || !user.mfaSecretEncrypted) {
      await fail("mfa_not_enabled", userId);
    }
    if (user!.profile?.banned) await fail("banned", userId);

    const via = await this.assertTotpOrRecovery(userId, opts.code, opts.ip, {
      allowRecovery: true,
      consumeRecovery: true,
    });

    await this.prisma.mfaLoginChallenge.update({
      where: { id: challenge!.id },
      data: { consumedAt: new Date() },
    });

    const session = await this.sessions.createSession({
      userId,
      ip: opts.ip,
      userAgent: opts.userAgent,
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date(), lastActiveAt: new Date() },
    });
    await this.audit("mfa_login_success", {
      userId,
      metadata: { via },
      ip: opts.ip,
    });
    await this.audit("login_success", {
      userId,
      metadata: { mfa: true, sessionId: session.sessionId },
      ip: opts.ip,
    });

    return {
      user: {
        id: user!.id,
        email: user!.email,
        emailNormalized: user!.emailNormalized,
        mustResetPassword: user!.mustResetPassword,
        emailVerificationTime: user!.emailVerificationTime,
        profile: user!.profile,
      },
      rawToken: session.rawToken,
      expiresAt: session.expiresAt,
    };
  }

  async adminResetMfa(opts: {
    actorUserId: string;
    actorRole: string;
    targetUserId: string;
    ip?: string;
  }) {
    const target = await this.prisma.user.findUnique({
      where: { id: opts.targetUserId },
      include: { profile: { select: { role: true } } },
    });
    if (!target) throw new BadRequestException("User not found");
    const targetRole = target.profile?.role ?? "user";
    assertCanDisableTarget({
      actorUserId: opts.actorUserId,
      actorRole: opts.actorRole,
      targetUserId: opts.targetUserId,
      targetRole,
    });
    if (!isStaffRole(targetRole)) {
      throw new ForbiddenException("MFA reset applies to staff accounts only");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({
        where: { userId: opts.targetUserId },
      });
      await tx.mfaLoginChallenge.deleteMany({
        where: { userId: opts.targetUserId },
      });
      await tx.user.update({
        where: { id: opts.targetUserId },
        data: {
          mfaEnabled: false,
          mfaSecretEncrypted: null,
          mfaPendingSecretEncrypted: null,
          mfaEnabledAt: null,
          mfaLastStep: null,
        },
      });
    });
    await this.audit("mfa_admin_reset", {
      userId: opts.actorUserId,
      metadata: { targetUserId: opts.targetUserId },
      ip: opts.ip,
    });
    return { ok: true as const };
  }

  private async requireStaff(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: { select: { role: true } } },
    });
    if (!user || !isStaffRole(user.profile?.role)) {
      throw new ForbiddenException("MFA is only available for staff accounts");
    }
    return user;
  }

  private async assertPassword(userId: string, password: string) {
    const account = await this.prisma.authAccount.findFirst({
      where: { userId, provider: "password" },
    });
    if (!account?.passwordHash) {
      throw new UnauthorizedException("Invalid password");
    }
    const verified = await verifyPassword(
      password,
      account.passwordHash,
      account.passwordAlgo
    );
    if (!verified.ok) {
      throw new UnauthorizedException("Invalid password");
    }
  }

  private async assertTotpOrRecovery(
    userId: string,
    code: string,
    ip: string | undefined,
    opts: { allowRecovery: boolean; consumeRecovery: boolean }
  ): Promise<"totp" | "recovery"> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!user.mfaSecretEncrypted) {
      throw new UnauthorizedException("Invalid authenticator code");
    }
    const secret = decryptMfaSecret(
      user.mfaSecretEncrypted,
      this.sessionSecret()
    );
    const cleaned = code.replace(/\s+/g, "");
    if (/^\d{6}$/.test(cleaned)) {
      const verified = verifyTotpCode(secret, cleaned);
      if (!verified.ok) {
        throw new UnauthorizedException("Invalid authenticator code");
      }
      if (user.mfaLastStep != null && verified.step === user.mfaLastStep) {
        throw new UnauthorizedException("Invalid authenticator code");
      }
      await this.prisma.user.update({
        where: { id: userId },
        data: { mfaLastStep: verified.step },
      });
      return "totp";
    }

    if (!opts.allowRecovery) {
      throw new UnauthorizedException("Invalid authenticator code");
    }

    const codeHash = hashRecoveryCode(cleaned);
    const row = await this.prisma.mfaRecoveryCode.findFirst({
      where: { userId, codeHash, usedAt: null },
    });
    if (!row) {
      throw new UnauthorizedException("Invalid authenticator code");
    }
    if (opts.consumeRecovery) {
      await this.prisma.mfaRecoveryCode.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      await this.audit("mfa_recovery_used", { userId, ip });
    }
    return "recovery";
  }
}
