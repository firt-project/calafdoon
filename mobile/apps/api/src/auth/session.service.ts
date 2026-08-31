import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import {
  generateToken,
  hashToken,
  hmacSha256Hex,
  sha256Hex,
} from "./crypto-util";

export const SESSION_IDLE_MS = 3 * 60 * 60 * 1000; // 3 hours
export const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const SESSION_TOUCH_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  private hashSecret(): string {
    return (
      this.config.get<string>("SESSION_SECRET") ??
      this.config.get<string>("AUTH_SECRET") ??
      "dev-only-change-me-session-secret"
    );
  }

  hashIp(ip: string | undefined): string | null {
    if (!ip) return null;
    return hmacSha256Hex(this.hashSecret(), `ip:${ip}`);
  }

  hashUserAgent(ua: string | undefined): string | null {
    if (!ua) return null;
    return sha256Hex(`ua:${ua}`);
  }

  async createSession(opts: {
    userId: string;
    ip?: string;
    userAgent?: string;
  }): Promise<{ rawToken: string; sessionId: string; expiresAt: Date }> {
    const rawToken = generateToken(32);
    const tokenHash = hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_IDLE_MS);
    const absoluteExpiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_MS);

    const session = await this.prisma.session.create({
      data: {
        userId: opts.userId,
        tokenHash,
        lastSeenAt: now,
        expiresAt,
        absoluteExpiresAt,
        ipHash: this.hashIp(opts.ip),
        userAgentHash: this.hashUserAgent(opts.userAgent),
      },
    });

    return { rawToken, sessionId: session.id, expiresAt };
  }

  async findValidSession(rawToken: string) {
    const tokenHash = hashToken(rawToken);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            profile: {
              select: {
                id: true,
                role: true,
                banned: true,
                hasPaid: true,
                reviewStatus: true,
                name: true,
              },
            },
            authAccounts: {
              where: { provider: "password" },
              take: 1,
              select: { id: true, passwordAlgo: true },
            },
          },
        },
      },
    });
    if (!session || session.revokedAt) return null;
    const now = Date.now();
    if (session.expiresAt.getTime() <= now) return null;
    if (session.absoluteExpiresAt.getTime() <= now) return null;
    return session;
  }

  async touchSession(sessionId: string, currentExpiresAt: Date, lastSeenAt: Date) {
    const now = Date.now();
    if (now - lastSeenAt.getTime() < SESSION_TOUCH_THROTTLE_MS) {
      return currentExpiresAt;
    }
    const absolute = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { absoluteExpiresAt: true },
    });
    if (!absolute) return currentExpiresAt;
    const nextIdle = new Date(now + SESSION_IDLE_MS);
    const expiresAt =
      nextIdle.getTime() > absolute.absoluteExpiresAt.getTime()
        ? absolute.absoluteExpiresAt
        : nextIdle;
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { lastSeenAt: new Date(now), expiresAt },
    });
    return expiresAt;
  }

  async revokeSession(sessionId: string) {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
