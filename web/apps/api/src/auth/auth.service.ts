import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthAuditAction, Gender, PasswordAlgo } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { isStaffRole, hasPaidAccess } from "../common/access";
import { PrismaService } from "../prisma/prisma.service";
import {
  AUTH_FAILED_MESSAGE,
  INCORRECT_PASSWORD_MESSAGE,
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
import { escapeHtml } from "../mail/html-escape";
import { MfaService } from "./mfa.service";
import {
  hashPasswordPreferred,
  shouldRehashOnLogin,
  verifyPassword,
} from "./password";
import { SessionService } from "./session.service";
import { computeAccessState } from "../common/access-state";
import { PROFILE_DEFAULTS } from "../profile/questionnaire";
import { isStaffMfaRequired } from "./staff-mfa-policy";

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
  /** True when User.emailVerificationTime is set (M3). */
  emailVerified: boolean;
  /** Live MFA enrollment flag (L4). */
  mfaEnabled: boolean;
  /**
   * True when REQUIRE_STAFF_MFA is on for staff without MFA.
   * Session is restricted to enrollment allowlist routes.
   */
  mfaEnrollmentRequired: boolean;
  /** Member flags the app shell needs (nav, dashboard routing, greeting). */
  profile?: {
    role: "user" | "admin" | "owner";
    banned: boolean;
    hasPaid: boolean;
    paidUntil?: string | null;
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
    @Inject(MAIL_ADAPTER) private readonly mail: MailAdapter,
    /** Optional so existing unit tests keep constructing AuthService with 4 args. */
    @Optional() private readonly mfa?: MfaService
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
    emailVerificationTime?: Date | null;
    mfaEnabled?: boolean;
    profile: {
      role: "user" | "admin" | "owner";
      banned: boolean;
      hasPaid: boolean;
      paidUntil?: Date | null;
    } | null;
  }): AuthUserView {
    const role = user.profile?.role ?? "user";
    const mfaEnabled = user.mfaEnabled === true;
    const mfaEnrollmentRequired =
      isStaffMfaRequired(this.config) && isStaffRole(role) && !mfaEnabled;
    return {
      id: user.id,
      email: user.email,
      emailNormalized: user.emailNormalized,
      role,
      banned: user.profile?.banned ?? false,
      hasProfile: !!user.profile,
      hasPaid: hasPaidAccess(user.profile),
      mustResetPassword: user.mustResetPassword,
      emailVerified: user.emailVerificationTime != null,
      mfaEnabled,
      mfaEnrollmentRequired,
    };
  }

  /** Trusted frontend origin for verification / reset links (no user-controlled host). */
  private appOrigin(): string {
    return (
      this.config.get<string>("APP_URL") ?? "http://127.0.0.1:3001"
    ).replace(/\/$/, "");
  }

  /**
   * Issue a fresh email-verification token (invalidates prior unused ones),
   * store only the hash, and deliver the raw token via email only.
   */
  private async issueEmailVerification(opts: {
    userId: string;
    email: string;
    ip?: string;
    reason: "register" | "resend";
  }): Promise<{ sent: boolean }> {
    const emailNormalized = normalizeEmail(opts.email);
    if (!emailNormalized) {
      return { sent: false };
    }

    const raw = generateToken(32);
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.updateMany({
        where: { userId: opts.userId, usedAt: null },
        data: { usedAt: now },
      });
      await tx.emailVerificationToken.create({
        data: {
          userId: opts.userId,
          email: emailNormalized,
          tokenHash,
          expiresAt,
          ipHash: this.ipHash(opts.ip),
        },
      });
    });

    const verifyUrl = `${this.appOrigin()}/verify-email?token=${encodeURIComponent(raw)}`;
    const safeVerifyUrl = escapeHtml(verifyUrl);
    const text = `Confirm your Hel Calafkaaga email address within 24 hours:\n\n${verifyUrl}\n\nIf you did not create an account, ignore this email.`;
    const html = `<p>Confirm your Hel Calafkaaga email address within 24 hours:</p>
<p><a href="${safeVerifyUrl}">Verify your email</a></p>
<p style="word-break:break-all;color:#666;font-size:12px">${safeVerifyUrl}</p>
<p>If you did not create an account, ignore this email.</p>`;

    try {
      await this.mail.send({
        to: emailNormalized,
        subject: "Verify your Hel Calafkaaga email",
        text,
        html,
      });
      await this.audit(
        opts.reason === "resend"
          ? "email_verification_resend"
          : "email_verification_sent",
        {
          userId: opts.userId,
          metadata: { outcome: "sent" },
          ip: opts.ip,
        }
      );
      return { sent: true };
    } catch (err) {
      await this.audit("email_verification_send_failed", {
        userId: opts.userId,
        metadata: {
          reason: "mail_send_failed",
          detail: err instanceof Error ? err.message.slice(0, 200) : "unknown",
        },
        ip: opts.ip,
      });
      return { sent: false };
    }
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
          paidUntil: true,
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
   * Does NOT grant hasPaid. Leaves email unverified and sends a verification email (M3).
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
            // M3: new registrations start unverified.
            emailVerificationTime: null,
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
            emailVerified: false,
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

    // M3: send verification after account exists. Mail failure does not roll back
    // registration; user can resend from the restricted session.
    await this.issueEmailVerification({
      userId,
      email: emailNormalized,
      ip: opts.ip,
      reason: "register",
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: {
          select: { role: true, banned: true, hasPaid: true, paidUntil: true },
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
  }): Promise<
    | {
        kind: "session";
        user: AuthUserView;
        rawToken: string;
        expiresAt: Date;
      }
    | {
        kind: "mfa_required";
        mfaToken: string;
        expiresAt: Date;
      }
  > {
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

    // L4: staff with MFA enabled must verify TOTP before any session is issued.
    if (isStaffRole(user.profile?.role) && user.mfaEnabled) {
      if (!this.mfa) {
        throw new ServiceUnavailableException(
          "MFA is required but unavailable. Try again later."
        );
      }
      const challenge = await this.mfa.createLoginChallenge(user.id, opts.ip);
      return {
        kind: "mfa_required",
        mfaToken: challenge.mfaToken,
        expiresAt: challenge.expiresAt,
      };
    }

    const session = await this.sessions.createSession({
      userId: user.id,
      ip: opts.ip,
      userAgent: opts.userAgent,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastActiveAt: new Date() },
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
      kind: "session",
      user: this.toView(user),
      rawToken: session.rawToken,
      expiresAt: session.expiresAt,
    };
  }

  /** Complete staff MFA challenge and issue the normal session cookie path. */
  async completeMfaLogin(opts: {
    mfaToken: string;
    code: string;
    ip?: string;
    userAgent?: string;
  }): Promise<{ user: AuthUserView; rawToken: string; expiresAt: Date }> {
    if (!this.mfa) {
      throw new ServiceUnavailableException(
        "MFA is required but unavailable. Try again later."
      );
    }
    const result = await this.mfa.completeLoginChallenge(opts);
    return {
      user: this.toView(result.user),
      rawToken: result.rawToken,
      expiresAt: result.expiresAt,
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
            paidUntil: true,
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
            hasPaid: hasPaidAccess(p),
            paidUntil: p.paidUntil?.toISOString() ?? null,
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

  /**
   * M2: anti-enumeration forgot-password.
   * Always returns the same HTTP body whether the email exists or not.
   * Tokens/mail are only created for known accounts; missing accounts burn
   * equivalent token crypto work so the cheap path is not an instant return.
   */
  async forgotPassword(
    email: string,
    ip?: string
  ): Promise<{ message: string }> {
    const emailNormalized = normalizeEmail(email);
    if (!emailNormalized || !emailNormalized.includes("@")) {
      throw new BadRequestException("Enter a valid email address");
    }

    let matches = await this.findUsersMatchingEmail(emailNormalized);

    // Also resolve password AuthAccount rows (same identity signup checks).
    if (matches.length === 0) {
      const account = await this.prisma.authAccount.findFirst({
        where: {
          provider: "password",
          providerAccountId: {
            equals: emailNormalized,
            mode: "insensitive",
          },
        },
        select: { userId: true },
      });
      if (account) {
        matches = await this.findUsersMatchingEmailByUserId(account.userId);
      }
    }

    const user = pickCanonicalEmailUser(
      matches.map((u) => this.toIdentityCandidate(u))
    );
    const fullUser = user
      ? matches.find((m) => m.id === user.id) ?? null
      : null;

    // Identical audit shape for found and missing (no existence flags / userId).
    await this.audit("password_reset_request", {
      metadata: { requested: true },
      ip,
    });

    if (!fullUser) {
      // Normalize cheap-path timing: same token generate+hash as the found path.
      hashToken(generateToken(32));
      return { message: RESET_GENERIC_MESSAGE };
    }

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

    const appUrl = this.appOrigin();
    const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(raw)}`;
    const safeResetUrl = escapeHtml(resetUrl);
    const to = fullUser.email ?? emailNormalized;
    const text = `Use this link within 15 minutes to reset your Hel Calafkaaga password:\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`;
    const html = `<p>Use this link within 15 minutes to reset your Hel Calafkaaga password:</p>
<p><a href="${safeResetUrl}">Reset your password</a></p>
<p style="word-break:break-all;color:#666;font-size:12px">${safeResetUrl}</p>
<p>If you did not request this, ignore this email.</p>`;

    try {
      await this.mail.send({
        to,
        subject: "Reset your Hel Calafkaaga password",
        text,
        html,
      });
    } catch (err) {
      // Do not surface mail failure to the client — 503 vs 200 would enumerate.
      await this.audit("password_reset_failure", {
        metadata: {
          reason: "mail_send_failed",
          detail: err instanceof Error ? err.message.slice(0, 200) : "unknown",
        },
        ip,
      });
    }

    return { message: RESET_GENERIC_MESSAGE };
  }

  private async findUsersMatchingEmailByUserId(userId: string) {
    const include = {
      profile: {
        select: {
          id: true,
          role: true,
          banned: true,
          hasPaid: true,
          paidUntil: true,
          questionnaireComplete: true,
          registrationComplete: true,
        },
      },
      authAccounts: {
        where: { provider: "password" as const },
      },
    };
    const one = await this.prisma.user.findUnique({
      where: { id: userId },
      include,
    });
    return one ? [one] : [];
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
    await this.prisma.$transaction(async (tx) => {
      await tx.authAccount.update({
        where: { id: account.id },
        data: {
          passwordHash: preferred.hash,
          passwordAlgo: preferred.algo as PasswordAlgo,
        },
      });
      // Clear forced-reset only after the password write succeeds.
      await tx.user.update({
        where: { id: opts.userId },
        data: { mustResetPassword: false },
      });
      await tx.session.updateMany({
        where: { userId: opts.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    await this.audit("password_change", { userId: opts.userId, ip: opts.ip });
    await this.audit("logout_all", {
      userId: opts.userId,
      metadata: { reason: "password_change" },
      ip: opts.ip,
    });
    return { message: "Password changed" };
  }

  async verifyCurrentPassword(userId: string, password: string) {
    const account = await this.prisma.authAccount.findFirst({
      where: { userId, provider: "password" },
    });
    if (!account?.passwordHash) {
      throw new UnauthorizedException(INCORRECT_PASSWORD_MESSAGE);
    }
    const verified = await verifyPassword(
      password,
      account.passwordHash,
      account.passwordAlgo
    );
    if (!verified.ok) {
      throw new UnauthorizedException(INCORRECT_PASSWORD_MESSAGE);
    }
  }

  /**
   * M3: consume a verification token and mark the user's email verified.
   * Generic failures avoid account enumeration for the public endpoint.
   */
  async verifyEmailToken(
    rawToken: string,
    ip?: string
  ): Promise<{ ok: true; emailVerified: true }> {
    const fail = async (reason: string, userId?: string) => {
      await this.audit("email_verification_failure", {
        userId,
        metadata: { reason },
        ip,
      });
      throw new BadRequestException("Invalid or expired verification link");
    };

    if (!rawToken || rawToken.length < 10 || rawToken.length > 512) {
      await fail("malformed");
      // unreachable
      throw new BadRequestException("Invalid or expired verification link");
    }

    const tokenHash = hashToken(rawToken);
    const row = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });
    if (!row || row.usedAt) await fail("missing_or_used", row?.userId);
    if (row!.expiresAt.getTime() <= Date.now()) {
      await fail("expired", row!.userId);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: row!.userId },
    });
    if (!user?.email) await fail("user_missing", row!.userId);

    const currentEmail = normalizeEmail(user!.email!);
    if (!currentEmail || currentEmail !== normalizeEmail(row!.email)) {
      await fail("email_mismatch", row!.userId);
    }

    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.emailVerificationToken.updateMany({
          where: { id: row!.id, usedAt: null },
          data: { usedAt: now },
        });
        if (claimed.count !== 1) {
          throw new BadRequestException("Invalid or expired verification link");
        }
        await tx.user.update({
          where: { id: row!.userId },
          data: { emailVerificationTime: now },
        });
        await tx.authAccount.updateMany({
          where: { userId: row!.userId, provider: "password" },
          data: { emailVerified: true },
        });
        // Invalidate any other outstanding verification tokens for this user.
        await tx.emailVerificationToken.updateMany({
          where: { userId: row!.userId, usedAt: null },
          data: { usedAt: now },
        });
      });
    } catch (err) {
      if (err instanceof BadRequestException) {
        await this.audit("email_verification_failure", {
          userId: row!.userId,
          metadata: { reason: "concurrent_or_replaced" },
          ip,
        });
        throw err;
      }
      throw err;
    }

    await this.audit("email_verification_success", {
      userId: row!.userId,
      metadata: { outcome: "verified" },
      ip,
    });

    return { ok: true, emailVerified: true };
  }

  /**
   * M3: authenticated resend. Safe when already verified; rotates prior tokens.
   */
  async resendEmailVerification(
    userId: string,
    ip?: string
  ): Promise<{ ok: true; sent: boolean; alreadyVerified: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(AUTH_FAILED_MESSAGE);
    }
    if (user.emailVerificationTime != null) {
      return { ok: true, sent: false, alreadyVerified: true };
    }
    if (!user.email) {
      throw new BadRequestException("No email address on this account");
    }

    const { sent } = await this.issueEmailVerification({
      userId,
      email: user.email,
      ip,
      reason: "resend",
    });

    if (!sent) {
      throw new ServiceUnavailableException(
        "Could not send the verification email. Please try again later."
      );
    }

    return { ok: true, sent: true, alreadyVerified: false };
  }
}
