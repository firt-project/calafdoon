/**
 * Phase 7 chat/notification HTTP + Socket.IO e2e — local Postgres + Redis + MinIO.
 * Fixture users only; does not delete migrated production-copy rows.
 */
import "reflect-metadata";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import cookieParser from "cookie-parser";
import { io as ioClient, type Socket } from "socket.io-client";
import { hashPasswordPreferred } from "../src/auth/password";
import { RedisIoAdapter } from "../src/chat/redis-io.adapter";
import { assertSafeSyntheticTestDatabase } from "./safe-test-database";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://hel:hel_dev_change_me@127.0.0.1:5432/hel_calafkaaga?schema=public";
const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const password = "Phase7-E2E-Test-Only-99";

function cookieValue(
  setCookie: string[] | undefined,
  name: string
): string | undefined {
  if (!setCookie) return undefined;
  for (const c of setCookie) {
    if (c.startsWith(`${name}=`)) {
      return decodeURIComponent(c.slice(name.length + 1).split(";")[0]!);
    }
  }
  return undefined;
}

async function createMember(
  prisma: PrismaClient,
  opts: { email: string; gender: "male" | "female" }
) {
  const hash = await hashPasswordPreferred(password);
  const convexId = `local_p7_${randomUUID()}`;
  return prisma.user.create({
    data: {
      convexId,
      email: opts.email,
      emailNormalized: opts.email,
      name: "Phase7 Member",
      gender: opts.gender,
      authAccounts: {
        create: {
          convexId: `local_p7_auth_${randomUUID()}`,
          convexUserId: convexId,
          provider: "password",
          providerAccountId: opts.email,
          passwordHash: hash.hash,
          passwordAlgo: hash.algo,
        },
      },
      profile: {
        create: {
          convexId: `local_p7_prof_${randomUUID()}`,
          convexUserId: convexId,
          name: "Phase7 Member",
          gender: opts.gender,
          age: 28,
          height: 170,
          weight: 70,
          country: "Somalia",
          city: "Mogadishu",
          education: "Bachelor",
          occupation: "Engineer",
          religiousLevel: "Practicing",
          maritalStatus: "Never married",
          children: 0,
          bio: "test",
          verified: false,
          role: "user",
          prayerFrequency: "Most of the time",
          spousePrayerImportance: "Preferred",
          smokes: "No",
          drinksAlcohol: "No",
          exercise: "Sometimes",
          wantChildren: "Yes",
          marriageTimeline: "Within 1 year",
          marrySomeoneWithChildren: "Depends",
          livingSituation: "Own home with my wife",
          languagesSpoken: ["Somali"],
          qualities: ["Kind"],
          hobbies: ["Reading"],
          questionnaireComplete: true,
          registrationComplete: true,
          questionnaireStep: 11,
          approved: true,
          reviewStatus: "approved",
          hasPaid: true,
          banned: false,
          profileImageConvexId: `img_${convexId}`,
        },
      },
    },
  });
}

describe("Phase 7 chat e2e", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let baseUrl: string;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let agentOut: ReturnType<typeof request.agent>;
  let csrfA = "";
  let csrfB = "";
  let tokenA = "";
  let tokenB = "";
  let tokenOut = "";
  let userA = "";
  let userB = "";
  let userOut = "";
  let conversationId = "";
  let matchId = "";
  const emailA = `phase7.a.${randomUUID().slice(0, 8)}@hel.local`;
  const emailB = `phase7.b.${randomUUID().slice(0, 8)}@hel.local`;
  const emailOut = `phase7.o.${randomUUID().slice(0, 8)}@hel.local`;

  before(async () => {
    assertSafeSyntheticTestDatabase(DATABASE_URL);
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.REDIS_URL = REDIS_URL;
    process.env.SESSION_SECRET ??= "hel_dev_session_secret_change_me_32";
    process.env.MAIL_DRIVER = "console";
    process.env.COOKIE_SECURE = "false";
    process.env.LOG_LEVEL = "fatal";
    process.env.S3_ENDPOINT ??= "http://127.0.0.1:9000";
    process.env.S3_ACCESS_KEY_ID ??= "helminio";
    process.env.S3_SECRET_ACCESS_KEY ??= "hel_minio_dev_change_me";

    const distAppModule = join(__dirname, "../dist/app.module.js");
    let AppModule: unknown;
    try {
      AppModule = require(distAppModule).AppModule;
    } catch {
      throw new Error(`Missing ${distAppModule}. Run npm run build -w @hel/api`);
    }

    prisma = new PrismaClient();
    const a = await createMember(prisma, { email: emailA, gender: "male" });
    const b = await createMember(prisma, { email: emailB, gender: "female" });
    const o = await createMember(prisma, { email: emailOut, gender: "male" });
    userA = a.id;
    userB = b.id;
    userOut = o.id;

    matchId = randomUUID();
    conversationId = randomUUID();
    await prisma.match.create({
      data: {
        id: matchId,
        convexId: `local_p7_match_${randomUUID()}`,
        pairKey:
          userA < userB ? `${userA}:${userB}` : `${userB}:${userA}`,
        userAId: userA,
        userBId: userB,
        convexUserA: a.convexId,
        convexUserB: b.convexId,
        score: 90,
        status: "active",
        chatUnlocked: true,
      },
    });
    await prisma.conversation.create({
      data: {
        id: conversationId,
        convexId: `local_p7_conv_${randomUUID()}`,
        matchId,
        convexMatchId: `local_p7_match`,
        participantConvexIds: [a.convexId, b.convexId],
        participantUserIds: [userA, userB],
        lastMessageAt: new Date(),
        unreadByUser: { [userA]: 0, [userB]: 0 },
      },
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule as never],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use(cookieParser());
    const adapter = new RedisIoAdapter(app, REDIS_URL);
    await adapter.connectToRedis();
    app.useWebSocketAdapter(adapter);
    await app.init();
    await app.listen(0);
    const addr = app.getHttpServer().address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    agentA = request.agent(app.getHttpServer());
    agentB = request.agent(app.getHttpServer());
    agentOut = request.agent(app.getHttpServer());

    async function login(
      agent: ReturnType<typeof request.agent>,
      email: string
    ) {
      const res = await agent
        .post("/auth/login")
        .send({ email, password })
        .expect(200);
      const token = cookieValue(
        res.headers["set-cookie"] as string[] | undefined,
        "hel_session"
      );
      assert.ok(token);
      return { csrf: res.body.csrfToken as string, token };
    }

    ({ csrf: csrfA, token: tokenA } = await login(agentA, emailA));
    ({ csrf: csrfB, token: tokenB } = await login(agentB, emailB));
    ({ token: tokenOut } = await login(agentOut, emailOut));
  });

  after(async () => {
    const ids = [userA, userB, userOut].filter(Boolean);
    for (const id of ids) {
      await prisma.message.deleteMany({
        where: { conversationId },
      }).catch(() => undefined);
      await prisma.notification.deleteMany({ where: { userId: id } });
      await prisma.block.deleteMany({
        where: { OR: [{ blockerId: id }, { blockedId: id }] },
      });
      await prisma.session.deleteMany({ where: { userId: id } });
      await prisma.authAuditEvent.deleteMany({ where: { userId: id } }).catch(() => undefined);
      await prisma.profile.deleteMany({ where: { userId: id } });
      await prisma.authAccount.deleteMany({ where: { userId: id } });
      await prisma.user.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.conversation.deleteMany({ where: { id: conversationId } });
    await prisma.match.deleteMany({ where: { id: matchId } });
    await app?.close();
    await prisma?.$disconnect();
  });

  it("lists conversations for participant", async () => {
    const res = await agentA.get("/conversations").expect(200);
    assert.ok(Array.isArray(res.body.items));
    assert.ok(
      res.body.items.some(
        (c: { conversationId: string }) => c.conversationId === conversationId
      )
    );
  });

  it("lists migrated messages without destroying them", async () => {
    const migratedCount = await prisma.message.count({
      where: { convexId: { not: { startsWith: "local_" } } },
    });
    assert.ok(migratedCount >= 68);
  });

  it("sends text message and updates lastMessageAt + unread", async () => {
    const before = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    const res = await agentA
      .post(`/conversations/${conversationId}/messages`)
      .set("X-CSRF-Token", csrfA)
      .send({ message: "Assalamu alaikum phase7" });
    if (res.status !== 200) {
      assert.fail(`send failed ${res.status}: ${JSON.stringify(res.body)}`);
    }
    assert.equal(res.body.message, "Assalamu alaikum phase7");
    assert.equal(res.body.senderId, userA);
    const after = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    assert.ok(after.lastMessageAt >= before.lastMessageAt);
    const unread = after.unreadByUser as Record<string, number>;
    assert.ok((unread[userB] ?? 0) >= 1);
  });

  it("message idempotency returns same row", async () => {
    const key = `idem_${randomUUID()}`;
    const first = await agentA
      .post(`/conversations/${conversationId}/messages`)
      .set("X-CSRF-Token", csrfA)
      .send({ message: "retry-me", idempotencyKey: key })
      .expect(200);
    const second = await agentA
      .post(`/conversations/${conversationId}/messages`)
      .set("X-CSRF-Token", csrfA)
      .send({ message: "retry-me-again", idempotencyKey: key })
      .expect(200);
    assert.equal(first.body.id, second.body.id);
    assert.equal(second.body.message, "retry-me");
  });

  it("mark-read is idempotent and zeroes unread", async () => {
    await agentB
      .post(`/conversations/${conversationId}/read`)
      .set("X-CSRF-Token", csrfB)
      .send({})
      .expect(200);
    const again = await agentB
      .post(`/conversations/${conversationId}/read`)
      .set("X-CSRF-Token", csrfB)
      .send({})
      .expect(200);
    assert.equal(again.body.unreadCount, 0);
  });

  it("typing start via Redis TTL", async () => {
    await agentA
      .post(`/conversations/${conversationId}/typing`)
      .set("X-CSRF-Token", csrfA)
      .send({ isTyping: true })
      .expect(200);
    const status = await agentB
      .get(`/conversations/${conversationId}/typing`)
      .expect(200);
    assert.equal(status.body.isTyping, true);
  });

  it("socket join allowed for participant and denied for outsider", async () => {
    const allowed = await new Promise<{ ok: boolean }>((resolve, reject) => {
      const socket: Socket = ioClient(baseUrl, {
        transports: ["websocket"],
        auth: { token: tokenA },
      });
      socket.on("connect", () => {
        socket
          .timeout(5000)
          .emit(
            "conversation:join",
            { conversationId },
            (err: Error | null, ack: { ok: boolean }) => {
              socket.close();
              if (err) reject(err);
              else resolve(ack);
            }
          );
      });
      socket.on("connect_error", reject);
      setTimeout(() => reject(new Error("socket timeout")), 10000);
    });
    assert.equal(allowed.ok, true);

    const denied = await new Promise<{ ok: boolean }>((resolve, reject) => {
      const socket: Socket = ioClient(baseUrl, {
        transports: ["websocket"],
        auth: { token: tokenOut },
      });
      socket.on("connect", () => {
        socket
          .timeout(5000)
          .emit(
            "conversation:join",
            { conversationId },
            (err: Error | null, ack: { ok: boolean }) => {
              socket.close();
              if (err) reject(err);
              else resolve(ack);
            }
          );
      });
      socket.on("connect_error", reject);
      setTimeout(() => reject(new Error("socket timeout")), 10000);
    });
    assert.equal(denied.ok, false);
  });

  it("socket delivers message:new and notification:new", async () => {
    const events = await new Promise<{
      message?: unknown;
      notification?: unknown;
    }>((resolve, reject) => {
      const out: { message?: unknown; notification?: unknown } = {};
      const socket: Socket = ioClient(baseUrl, {
        transports: ["websocket"],
        auth: { token: tokenB },
      });
      const finish = () => {
        if (out.message && out.notification) {
          socket.close();
          resolve(out);
        }
      };
      socket.on("connect", () => {
        // user:{id} room is joined on connect; conversation join is best-effort.
        socket.emit("conversation:join", { conversationId }, () => {
          void agentA
            .post(`/conversations/${conversationId}/messages`)
            .set("X-CSRF-Token", csrfA)
            .send({ message: `socket-event-${randomUUID().slice(0, 8)}` })
            .then((res) => {
              if (res.status !== 200) {
                socket.close();
                reject(
                  new Error(
                    `send for socket event failed: ${res.status} ${JSON.stringify(res.body)}`
                  )
                );
              }
            });
        });
      });
      socket.on("message:new", (payload) => {
        out.message = payload;
        finish();
      });
      socket.on("notification:new", (payload) => {
        out.notification = payload;
        finish();
      });
      socket.on("connect_error", reject);
      setTimeout(() => {
        socket.close();
        resolve(out);
      }, 12000);
    });
    assert.ok(events.message, "expected message:new");
    assert.ok(events.notification, "expected notification:new");
  });

  it("blocked pair cannot send", async () => {
    await prisma.block.create({
      data: {
        convexId: `local_p7_block_${randomUUID()}`,
        blockerId: userB,
        blockedId: userA,
        convexBlockerId: "cx_b",
        convexBlockedId: "cx_a",
        blockedAt: new Date(),
      },
    });
    await agentA
      .post(`/conversations/${conversationId}/messages`)
      .set("X-CSRF-Token", csrfA)
      .send({ message: "should fail" })
      .expect(403);
    await prisma.block.deleteMany({
      where: { blockerId: userB, blockedId: userA },
    });
  });

  it("notification list + unread count", async () => {
    const list = await agentB.get("/notifications").expect(200);
    assert.ok(Array.isArray(list.body.items));
    const unread = await agentB.get("/notifications/unread-count").expect(200);
    assert.equal(typeof unread.body.count, "number");
  });

  it("migrated notifications remain readable in DB", async () => {
    const count = await prisma.notification.count();
    assert.ok(count >= 1410);
    const types = await prisma.notification.groupBy({
      by: ["type"],
      _count: true,
    });
    const typeNames = new Set(types.map((t) => t.type));
    for (const t of [
      "like",
      "match",
      "message",
      "announcement",
      "approval",
      "payment",
    ] as const) {
      assert.ok(typeNames.has(t), `missing type ${t}`);
    }
  });

  it("pagination is stable for messages", async () => {
    for (let i = 0; i < 3; i++) {
      await agentA
        .post(`/conversations/${conversationId}/messages`)
        .set("X-CSRF-Token", csrfA)
        .send({ message: `page-${i}` })
        .expect(200);
    }
    const page1 = await agentA
      .get(`/conversations/${conversationId}/messages`)
      .query({ limit: 2 })
      .expect(200);
    assert.equal(page1.body.items.length, 2);
    assert.ok(page1.body.nextCursor);
    const page2 = await agentA
      .get(`/conversations/${conversationId}/messages`)
      .query({ limit: 2, cursor: page1.body.nextCursor })
      .expect(200);
    assert.ok(page2.body.items.length >= 1);
    assert.notEqual(page1.body.items[0].id, page2.body.items[0].id);
  });

  it("signed image URL access for linked chat media", async () => {
    const mediaId = randomUUID();
    await prisma.mediaObject.create({
      data: {
        id: mediaId,
        convexStorageId: `local_p7_media_${randomUUID()}`,
        purpose: "chat_image",
        bucket: "hel-chat",
        objectKey: `${mediaId}.jpg`,
        contentType: "image/jpeg",
        ownerUserId: userA,
        migrationStatus: "uploaded",
        verifiedReadable: true,
      },
    });
    const msg = await prisma.message.create({
      data: {
        convexId: `local_p7_imgmsg_${randomUUID()}`,
        conversationId,
        convexConversationId: "local",
        senderId: userA,
        convexSenderId: "cx",
        body: "📷 Image",
        imageMediaId: mediaId,
        read: false,
        messageCreatedAt: new Date(),
      },
    });
    const res = await agentB
      .get(
        `/conversations/${conversationId}/messages/${msg.id}/image-url`
      )
      .expect(200);
    assert.ok(typeof res.body.url === "string");
    assert.ok(res.body.url.includes("X-Amz") || res.body.url.includes("hel-chat"));
    assert.equal(typeof res.body.expiresInSeconds, "number");

    await agentOut
      .get(
        `/conversations/${conversationId}/messages/${msg.id}/image-url`
      )
      .expect(403);
  });
});
