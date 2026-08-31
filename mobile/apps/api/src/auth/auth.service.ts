import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthAuditAction, Gender, PasswordAlgo } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import {
  AUTH_FAILED_MESSAGE,
  REGISTER_FAILED_MESSAGE,
  RESET_GENERIC_MESSAGE,
  generateToken,
  hashToken,
  hmacSha256Hex,
  normalizeEmail,
} from "./crypto-util";
import {
  emailIdentityScore,
  emailMatchWhere,
  pickCanonicalEmailUser,
  type EmailIdentityCandidate,
} from "./email-identity";
import type { MailAdapter } from "./mail.adapter";
import {
  hashPasswordPreferred,
  shouldRehashOnLogin,
  verifyPassword,
} from "./password";
import { SessionService } from "./session.service";
import { computeAccessState } from "../common/access-state";
import { PROFILE_DEFAULTS } from "../profile/questionnaire";

export const MAIL_ADAPTER = "MAIL_ADAPTER";

export type AuthUserView = {
  id: string;
  email: string | null;
  emailNormalized: string | null;
  role: "user" | "admin" | "owner";
  banned: boolean;
  hasProfile: boolean;
  hasPaid: boolean;
  mustResetPassword: boolean;
  /** Member flags the app shell needs (nav, dashboard routing, greeting). */
  profile?: {
    role: "user" | "admin" | "owner";
    banned: boolean;
    hasPaid: boolean;
    name: string | null;
    gender: string | null;
    questionnaireComplete: boolean;
    registrationComplete: boolean | null;
    approved: boolean;
    reviewStatus: string | null;
    hasPersonalSupport: boolean;
  } | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
    @Inject(MAIL_ADAPTER) private readonly mail: MailAdapter
  ) {}

  private ipHash(ip?: string): string | null {
    if (!ip) return null;
    const secret =
      this.config.get<string>("SESSION_SECRET") ??
      "dev-only-change-me-session-secret";
    return hmacSha256Hex(secret, `ip:${ip}`);
  }

  async audit(
    action: AuthAuditAction,
    opts: { userId?: string | null; metadata?: Record<string, unknown>; ip?: string }
  ) {
    await this.prisma.authAuditEvent.create({
      data: {
        action,
        userId: opts.userId ?? null,
        metadata: (opts.metadata ?? undefined) as object | undefined,
        ipHash: this.ipHash(opts.ip),
      },
    });
  }

  private toView(user: {
    id: string;
    email: string | null;
    emailNormalized: string | null;
    mustResetPassword: boolean;
    profile: {
      role: "user" | "admin" | "owner";
      banned: boolean;
      hasPaid: boolean;
    } | null;
  }): AuthUserView {
    return {
      id: user.id,
      email: user.email,
      emailNormalized: user.emailNormalized,
      role: user.profile?.role ?? "user",
      banned: user.profile?.banned ?? false,
      hasProfile: !!user.profile,
      hasPaid: user.profile?.hasPaid ?? false,
      mustResetPassword: user.mustResetPassword,
    };
  }

  /**
   * Public check for register UI — inverted Convex `isEmailRegistered`.
   * Explicit availability is intentional for UX; register itself stays anti-enumeration.
   */
  async checkEmailRegistered(email: string): Promise<{ available: boolean }> {
    const emailNormalized = normalizeEmail(email);
    if (!emailNormalized) return { available: false };

    const taken = await this.isEmailTaken(emailNormalized);
    return { available: !taken };
  }

  private async isEmailTaken(emailNormalized: string): Promise<boolean> {
    const existingUser = await this.prisma.user.findFirst({
      where: emailMatchWhere(emailNormalized),
      select: { id: true },
    });
    if (existingUser) return true;

    const existingAccount = await this.prisma.authAccount.findFirst({
      where: {
        provider: "password",
        providerAccountId: {
          equals: emailNormalized,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });
    return existingAccount !== null;
  }

  /** All users that claim this email (case-insensitive / normalized). */
  private async findUsersMatchingEmail(emailNormalized: string) {
    const where = emailMatchWhere(emailNormalized);
    const include = {
      profile: {
        select: {
          id: true,
          role: true,
          banned: true,
          hasPaid: true,
          questionnaireComplete: true,
          registrationComplete: true,
        },
      },
      authAccounts: {
        where: { provider: "password" as const },
      },
    };

    // Production always has findMany; unit mocks may only stub findFirst.
    if (typeof this.prisma.user.findMany === "function") {
      return this.prisma.user.findMany({
        where,
        include,
        orderBy: { createdAt: "asc" },
      });
    }

    const one = await this.prisma.user.findFirst({ where, include });
    return one ? [one] : [];
  }

  private toIdentityCandidate(
    user: Awaited<ReturnType<AuthService["findUsersMatchingEmail"]>>[number]
  ): EmailIdentityCandidate {
    return {
      id: user.id,
      createdAt: user.createdAt ?? new Date(0),
      email: user.email,
      emailNormalized: user.emailNormalized,
      profile: user.profile,
      authAccountCount: user.authAccounts?.length ?? 0,
    };
  }

  /** Ensure survivor rows always store a single normalized email. */
  private async normalizeStoredEmail(userId: string, emailNormalized: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { email: emailNormalized, emailNormalized },
    });
    await this.prisma.authAccount.updateMany({
      where: { userId, provider: "password" },
      data: { providerAccountId: emailNormalized },
    });
  }

  /**
   * Local registration matching Convex signup defaults.
   * Creates User + password AuthAccount + Profile + Preferences, then a session.
   * Does NOT grant hasPaid. Does NOT require email verification.
   */
  async register(opts: {
    email: string;
    password: string;
    ip?: string;
    userAgent?: string;
  }): Promise<{ user: AuthUserView; rawToken: string; expiresAt: Date }> {
    const emailNormalized = normalizeEmail(opts.email);
    if (!emailNormalized) {
      throw new BadRequestException("Invalid request body");
    }
    if (opts.password.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters");
    }

    if (await this.isEmailTaken(emailNormalized)) {
      await this.audit("register_failed", {
        metadata: { reason: "email_taken" },
        ip: opts.ip,
      });
      throw new ForbiddenException(REGISTER_FAILED_MESSAGE);
    }

    const preferred = await hashPasswordPreferred(opts.password);
    const convexId = `local_reg_${randomUUID()}`;
    const gender: Gender = "male";
    const preferredGender: Gender = "female";

    let userId: string;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            convexId,
            email: emailNormalized,
            emailNormalized,
            name: "User",
            gender,
          },
        });

        await tx.authAccount.create({
          data: {
            convexId: `local_auth_${randomUUID()}`,
            userId: user.id,
            convexUserId: convexId,
            provider: "password",
            providerAccountId: emailNormalized,
            passwordHash: preferred.hash,
            passwordAlgo: preferred.algo as PasswordAlgo,
          },
        });

        await tx.profile.create({
          data: {
            convexId: `local_profile_${user.id}`,
            userId: user.id,
            convexUserId: convexId,
            name: "User",
            gender,
            age: 0,
            height: 170,
            weight: 70,
            country: "",
            city: "",
            education: "",
            occupation: "",
            religiousLevel: "",
            maritalStatus: "",
            children: 0,
            bio: "",
            verified: false,
            role: "user",
            prayerFrequency: "",
            spousePrayerImportance: PROFILE_DEFAULTS.spousePrayerImportance,
            smokes: "",
            drinksAlcohol: "",
            exercise: "",
            wantChildren: "",
            marriageTimeline: "",
            marrySomeoneWithChildren: "",
            languagesSpoken: [],
            qualities: [],
            hobbies: [],
            questionnaireComplete: false,
            questionnaireStep: 0,
            registrationComplete: false,
            hasPaid: false,
            banned: false,
            approved: false,
            reviewStatus: "incomplete",
            photoVisibility: "everyone",
          },
        });

        await tx.preference.create({
          data: {
            convexId: `local_pref_${user.id}`,
            userId: user.id,
            convexUserId: convexId,
            preferredGender,
            minAge: 18,
            maxAge: 60,
            minHeight: 150,
            maxHeight: 210,
            minWeight: 45,
            maxWeight: 150,
            preferredCountries: [],
            acceptChildren: "",
            educationLevel: "Bachelor",
            acceptDivorcee: "Depends",
            acceptWidow: "Depends",
            qualities: [],
            hobbies: [],
            partnerBeard: "",
            partnerHijabLevel: "",
          },
        });

        return user;
      });
      userId = created.id;
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as { code?: string }).code
          : undefined;
      await this.audit("register_failed", {
        metadata: { reason: code === "P2002" ? "email_taken" : "create_failed" },
        ip: opts.ip,
      });
      throw new ForbiddenException(REGISTER_FAILED_MESSAGE);
    }

    const session = await this.sessions.createSession({
      userId,
      ip: opts.ip,
      userAgent: opts.userAgent,
    });

    await this.audit("register_success", {
      userId,
      metadata: { sessionId: session.sessionId },
      ip: opts.ip,
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: {
          select: { role: true, banned: true, hasPaid: true },
        },
      },
    });
    if (!user) throw new ForbiddenException(REGISTER_FAILED_MESSAGE);

    return {
      user: this.toView(user),
      rawToken: session.rawToken,
      expiresAt: session.expiresAt,
    };
  }

  async login(opts: {
    email: string;
    password: string;
    ip?: string;
    userAgent?: string;
  }): Promise<{ user: AuthUserView; rawToken: string; expiresAt: Date }> {
    const emailNormalized = normalizeEmail(opts.email);
    const matches = emailNormalized
      ? await this.findUsersMatchingEmail(emailNormalized)
      : [];

    const fail = async (reason: string, userId?: string) => {
      await this.audit("login_failure", {
        userId,
        metadata: { reason, duplicateCount: matches.length },
        ip: opts.ip,
      });
      throw new UnauthorizedException(AUTH_FAILED_MESSAGE);
    };

    if (matches.length === 0) await fail("unknown_email");

    // Prefer the canonical account; if its password fails, try other duplicates
    // so the member can still sign in, then we normalize onto that survivor.
    const canonicalId = pickCanonicalEmailUser(
      matches.map((u) => this.toIdentityCandidate(u))
    )?.id;
    const ordered = [...matches].sort((a, b) => {
      if (a.id === canonicalId) return -1;
      if (b.id === canonicalId) return 1;
      return (
        emailIdentityScore(this.toIdentityCandidate(b)) -
        emailIdentityScore(this.toIdentityCandidate(a))
      );
    });

    let user = ordered[0]!;
    let account = user.authAccounts[0];
    let verifiedOk = false;

    for (const candidate of ordered) {
      if (candidate.profile?.banned) continue;
      for (const acc of candidate.authAccounts) {
        if (!acc.passwordHash) continue;
        const verified = await verifyPassword(
          opts.password,
          acc.passwordHash,
          acc.passwordAlgo
        );
        if (verified.ok) {
          user = candidate;
          account = acc;
          verifiedOk = true;
          break;
        }
      }
      if (verifiedOk) break;
    }

    if (!verifiedOk) {
      if (ordered.every((u) => u.profile?.banned)) {
        await fail("banned", ordered[0]?.id);
      }
      await fail("bad_password", ordered[0]?.id);
    }

    if (user.profile?.banned) await fail("banned", user.id);
    if (!account?.passwordHash) await fail("missing_account", user.id);

    // Rehash-on-login (Argon2id) only after successful verification
    if (shouldRehashOnLogin(account.passwordAlgo)) {
      try {
        const preferred = await hashPasswordPreferred(opts.password);
        await this.prisma.authAccount.update({
          where: { id: account.id },
          data: {
            passwordHash: preferred.hash,
            passwordAlgo: preferred.algo as PasswordAlgo,
          },
        });
        await this.audit("rehash_success", {
          userId: user.id,
          metadata: { from: account.passwordAlgo, to: preferred.algo },
          ip: opts.ip,
        });
      } catch {
        await this.audit("rehash_failure", {
          userId: user.id,
          metadata: { from: account.passwordAlgo },
          ip: opts.ip,
        });
        // Login still succeeds — keep old hash
      }
    }

    // Collapse identity onto one normalized email for this survivor.
    if (
      emailNormalized &&
      (user.email !== emailNormalized ||
        user.emailNormalized !== emailNormalized)
    ) {
      try {
        await this.normalizeStoredEmail(user.id, emailNormalized);
      } catch {
        // Unique conflict with a duplicate row — login still OK; purge script cleans.
      }
    }

    const session = await this.sessions.createSession({
      userId: user.id,
      ip: opts.ip,
      userAgent: opts.userAgent,
    });

    await this.audit("login_success", {
      userId: user.id,
      metadata: {
        sessionId: session.sessionId,
        ...(matches.length > 1
          ? { duplicateEmailAccounts: matches.length }
          : {}),
      },
      ip: opts.ip,
    });

    return {
      user: this.toView(user),
      rawToken: session.rawToken,
      expiresAt: session.expiresAt,
    };
  }

  async me(userId: string): Promise<AuthUserView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: {
          select: {
            role: true,
            banned: true,
            hasPaid: true,
            name: true,
            gender: true,
            questionnaireComplete: true,
            registrationComplete: true,
            approved: true,
            reviewStatus: true,
            hasPersonalSupport: true,
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException(AUTH_FAILED_MESSAGE);
    if (user.profile?.banned) {
      throw new ForbiddenException("Unable to access this account");
    }
    const p = user.profile;
    return {
      ...this.toView(user),
      profile: p
        ? {
            role: p.role,
            banned: p.banned,
            hasPaid: p.hasPaid,
            name: p.name ?? null,
            gender: p.gender ?? null,
            questionnaireComplete: p.questionnaireComplete ?? false,
            registrationComplete: p.registrationComplete,
            approved: p.approved,
            reviewStatus: p.reviewStatus ?? null,
            hasPersonalSupport: p.hasPersonalSupport ?? false,
          }
        : null,
    };
  }

  async accessState(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });
    return computeAccessState({
      authenticated: true,
      profile: profile ?? null,
    });
  }

  async logout(sessionId: string, userId: string, ip?: string) {
    await this.sessions.revokeSession(sessionId);
    await this.audit("logout", { userId, metadata: { sessionId }, ip });
  }

  async logoutAll(userId: string, ip?: string) {
    await this.sessions.revokeAllForUser(userId);
    await this.audit("logout_all", { userId, ip });
  }

  async forgotPassword(email: string, ip?: string): Promise<{ message: string }> {
    const emailNormalized = normalizeEmail(email);
    const matches = emailNormalized
      ? await this.findUsersMatchingEmail(emailNormalized)
      : [];
    const user = pickCanonicalEmailUser(
      matches.map((u) => this.toIdentityCandidate(u))
    );
    const fullUser = user
      ? matches.find((m) => m.id === user.id) ?? null
      : null;

    await this.audit("password_reset_request", {
      userId: fullUser?.id,
      metadata: { requested: true, duplicateCount: matches.length },
      ip,
    });

    if (fullUser) {
      const raw = generateToken(32);
      const tokenHash = hashToken(raw);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await this.prisma.passwordResetToken.create({
        data: {
          userId: fullUser.id,
          tokenHash,
          expiresAt,
          ipHash: this.ipHash(ip),
        },
      });

      const appUrl =
        this.config.get<string>("APP_URL") ?? "http://127.0.0.1:3001";
      const resetUrl = `${appUrl}/reset-password?token=${raw}`;
      await this.mail.send({
        to: fullUser.email ?? emailNormalized,
        subject: "Reset your Hel Calafkaaga password",
        text: `Use this link within 15 minutes to reset your password:\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
      });
    }

    return { message: RESET_GENERIC_MESSAGE };
  }

  async resetPassword(opts: {
    token: string;
    newPassword: string;
    ip?: string;
  }): Promise<{ message: string }> {
    const tokenHash = hashToken(opts.token);
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    const fail = async (reason: string) => {
      await this.audit("password_reset_failure", {
        userId: row?.userId,
        metadata: { reason },
        ip: opts.ip,
      });
      throw new UnauthorizedException("Invalid or expired reset token");
    };

    if (!row || row.usedAt) await fail("missing_or_used");
    if (row!.expiresAt.getTime() <= Date.now()) await fail("expired");
    if (opts.newPassword.length < 8) {
      throw new UnauthorizedException("Password must be at least 8 characters");
    }

    const preferred = await hashPasswordPreferred(opts.newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: row!.id },
        data: { usedAt: new Date() },
      });
      await tx.authAccount.updateMany({
        where: { userId: row!.userId, provider: "password" },
        data: {
          passwordHash: preferred.hash,
          passwordAlgo: preferred.algo as PasswordAlgo,
        },
      });
      await tx.user.update({
        where: { id: row!.userId },
        data: { mustResetPassword: false },
      });
      await tx.session.updateMany({
        where: { userId: row!.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.audit("password_reset_success", {
      userId: row!.userId,
      ip: opts.ip,
    });
    await this.audit("session_revoked", {
      userId: row!.userId,
      metadata: { reason: "password_reset" },
      ip: opts.ip,
    });

    return { message: "Password updated" };
  }

  async changePassword(opts: {
    userId: string;
    currentPassword: string;
    newPassword: string;
    ip?: string;
  }) {
    const account = await this.prisma.authAccount.findFirst({
      where: { userId: opts.userId, provider: "password" },
    });
    if (!account?.passwordHash) {
      throw new UnauthorizedException(AUTH_FAILED_MESSAGE);
    }
    const verified = await verifyPassword(
      opts.currentPassword,
      account.passwordHash,
      account.passwordAlgo
    );
    if (!verified.ok) {
      throw new UnauthorizedException(AUTH_FAILED_MESSAGE);
    }
    if (opts.newPassword.length < 8) {
      throw new UnauthorizedException("Password must be at least 8 characters");
    }
    const preferred = await hashPasswordPreferred(opts.newPassword);
    await this.prisma.authAccount.update({
      where: { id: account.id },
      data: {
        passwordHash: preferred.hash,
        passwordAlgo: preferred.algo as PasswordAlgo,
      },
    });
    await this.sessions.revokeAllForUser(opts.userId);
    await this.audit("password_change", { userId: opts.userId, ip: opts.ip });
    await this.audit("logout_all", {
      userId: opts.userId,
      metadata: { reason: "password_change" },
      ip: opts.ip,
    });
    return { message: "Password changed" };
  }

  async assertPassword(userId: string, password: string): Promise<void> {
    const account = await this.prisma.authAccount.findFirst({
      where: { userId, provider: "password" },
    });
    if (!account?.passwordHash) {
      throw new UnauthorizedException(AUTH_FAILED_MESSAGE);
    }
    const verified = await verifyPassword(
      password,
      account.passwordHash,
      account.passwordAlgo
    );
    if (!verified.ok) {
      throw new UnauthorizedException(AUTH_FAILED_MESSAGE);
    }
  }
}
