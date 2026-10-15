import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";

type FirebaseMessaging = import("firebase-admin/messaging").Messaging;

const BATCH = 500;

export type PushKind = "message" | "like" | "match" | "announcement";
const KIND_FIELD = {
  message: "pushMessages",
  like: "pushLikes",
  match: "pushMatches",
  announcement: "pushAnnouncements",
} as const;
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

/**
 * FCM push delivery (Android directly, iOS via APNs key uploaded to Firebase).
 * Enabled only when FIREBASE_SERVICE_ACCOUNT_JSON is set (raw JSON or base64).
 * Never throws — push is best-effort next to the in-app notification row.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private messaging: FirebaseMessaging | null | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  private async getMessaging(): Promise<FirebaseMessaging | null> {
    if (this.messaging !== undefined) return this.messaging;
    const raw = this.config.get<string>("FIREBASE_SERVICE_ACCOUNT_JSON")?.trim();
    if (!raw) {
      this.logger.warn("FIREBASE_SERVICE_ACCOUNT_JSON not set — push disabled");
      return (this.messaging = null);
    }
    try {
      const json = raw.startsWith("{")
        ? raw
        : Buffer.from(raw, "base64").toString("utf8");
      const { initializeApp, getApps, getApp, cert } = await import(
        "firebase-admin/app"
      );
      const { getMessaging } = await import("firebase-admin/messaging");
      const app =
        getApps().length > 0
          ? getApp()
          : initializeApp({ credential: cert(JSON.parse(json)) });
      this.messaging = getMessaging(app);
    } catch (err) {
      this.logger.error(
        `Firebase init failed: ${err instanceof Error ? err.message : "unknown"}`
      );
      this.messaging = null;
    }
    return this.messaging;
  }

  async register(userId: string, token: string, platform: string) {
    await this.prisma.devicePushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
  }

  async unregister(userId: string, token: string) {
    await this.prisma.devicePushToken.deleteMany({ where: { userId, token } });
  }

  /** Drop users who turned this kind off, or muted this conversation. */
  private async allowedUsers(
    userIds: string[],
    kind: PushKind | undefined,
    conversationId: string | undefined
  ): Promise<string[]> {
    let allowed = userIds;
    if (kind) {
      const field = KIND_FIELD[kind];
      const off = await this.prisma.notificationPreference.findMany({
        where: { userId: { in: allowed }, [field]: false },
        select: { userId: true },
      });
      const offSet = new Set(off.map((o) => o.userId));
      allowed = allowed.filter((id) => !offSet.has(id));
    }
    if (conversationId && allowed.length) {
      const muted = await this.prisma.conversationMute.findMany({
        where: { conversationId, userId: { in: allowed } },
        select: { userId: true },
      });
      const mutedSet = new Set(muted.map((m) => m.userId));
      allowed = allowed.filter((id) => !mutedSet.has(id));
    }
    return allowed;
  }

  async sendToUsers(
    userIds: string[],
    msg: {
      title: string;
      body: string;
      data?: Record<string, string>;
      kind?: PushKind;
      conversationId?: string;
    }
  ): Promise<number> {
    try {
      if (userIds.length === 0) return 0;
      const messaging = await this.getMessaging();
      if (!messaging) return 0;
      const allowed = await this.allowedUsers(
        userIds,
        msg.kind,
        msg.conversationId
      );
      if (allowed.length === 0) return 0;
      const rows = await this.prisma.devicePushToken.findMany({
        where: { userId: { in: allowed } },
        select: { token: true },
      });
      let sent = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const tokens = rows.slice(i, i + BATCH).map((r) => r.token);
        const res = await messaging.sendEachForMulticast({
          tokens,
          notification: {
            title: msg.title,
            body: msg.body.slice(0, 300),
          },
          data: msg.data,
          android: {
            priority: "high",
            notification: { channelId: "default" },
          },
          apns: { payload: { aps: { sound: "default" } } },
        });
        sent += res.successCount;
        const dead: string[] = [];
        res.responses.forEach((r, idx) => {
          if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) {
            dead.push(tokens[idx]!);
          }
        });
        if (dead.length) {
          await this.prisma.devicePushToken.deleteMany({
            where: { token: { in: dead } },
          });
        }
      }
      return sent;
    } catch (err) {
      this.logger.warn(
        `Push send failed: ${err instanceof Error ? err.message : "unknown"}`
      );
      return 0;
    }
  }
}
