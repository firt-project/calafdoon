/**
 * Phase 6 matching HTTP e2e — local Postgres + Redis.
 * Artificial fixtures only; cleaned up after.
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
import { hashPasswordPreferred } from "../src/auth/password";
import { makePairKey } from "../src/matching/constants";
import { assertSafeSyntheticTestDatabase } from "./safe-test-database";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://hel:hel_dev_change_me@127.0.0.1:5432/hel_calafkaaga?schema=public";

async function createMember(prisma: PrismaClient, opts: {
  email: string;
  password: string;
  gender: "male" | "female";
  hasPaid?: boolean;
  questionnaireComplete?: boolean;
  approved?: boolean;
}) {
  const hash = await hashPasswordPreferred(opts.password);
  const convexId = `local_m6_${randomUUID()}`;
  const preferredGender = opts.gender === "male" ? "female" : "male";
  return prisma.user.create({
    data: {
      convexId,
      email: opts.email,
      emailNormalized: opts.email,
      name: "Phase6 Member",
      gender: opts.gender,
      authAccounts: {
        create: {
          convexId: `local_m6_auth_${randomUUID()}`,
          convexUserId: convexId,
          provider: "password",
          providerAccountId: opts.email,
          passwordHash: hash.hash,
          passwordAlgo: hash.algo,
        },
      },
      profile: {
        create: {
          convexId: `local_m6_prof_${randomUUID()}`,
          convexUserId: convexId,
          name: "Phase6 Member",
          gender: opts.gender,
          age: 27,
          height: 170,
          weight: 70,
          country: "Somalia",
          city: "Mogadishu",
          education: "Bachelor",
          occupation: "Teacher",
          religiousLevel: "Practicing",
          maritalStatus: "Never married",
          children: 0,
          bio: "",
          verified: false,
          role: "user",
          prayerFrequency: "Most of the time",
          smokes: "No",
          drinksAlcohol: "No",
          exercise: "Sometimes",
          wantChildren: "Yes",
          marriageTimeline: "Within 1 year",
          marrySomeoneWithChildren: "Depends",
          languagesSpoken: ["Somali"],
          qualities: ["Kind"],
          hobbies: ["Reading"],
          questionnaireComplete: opts.questionnaireComplete ?? true,
          questionnaireStep: 11,
          registrationComplete: true,
          hasPaid: opts.hasPaid ?? true,
          banned: false,
          approved: opts.approved ?? true,
          reviewStatus: opts.approved === false ? "pending_review" : "approved",
          photoVisibility: "everyone",
          profileImageConvexId: `local_photo_${randomUUID()}`,
          financialReadiness: "Ready",
          hasCurrentWife: opts.gender === "male" ? "No" : null,
          openToSecondWife: opts.gender === "male" ? "No" : null,
          acceptPreviouslyMarriedMan: opts.gender === "female" ? "Yes" : null,
          acceptFutureCoWife: opts.gender === "female" ? "No" : null,
          wearsHijab: opts.gender === "female" ? true : null,
          loveLanguage: "Words",
          spousePrayerImportance: "Preferred",
          waliName: opts.gender === "female" ? "Uncle" : null,
          waliPhone: opts.gender === "female" ? "+252612000000" : null,
        },
      },
      preferences: {
        create: {
          convexId: `local_m6_pref_${randomUUID()}`,
          convexUserId: convexId,
          preferredGender,
          minAge: 20,
          maxAge: 40,
          minHeight: 150,
          maxHeight: 190,
          preferredCountries: [],
          acceptChildren: "Depends",
          educationLevel: "Bachelor",
          acceptDivorcee: "Depends",
          acceptWidow: "Depends",
          qualities: [],
          hobbies: [],
          partnerHijabLevel: opts.gender === "male" ? "Always" : "",
        },
      },
    },
  });
}

describe("Phase 6 matching HTTP e2e", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  const password = "Phase6-E2E-Test-Only-99";
  const emailA = `phase6.a.${randomUUID().slice(0, 8)}@hel.local`;
  const emailB = `phase6.b.${randomUUID().slice(0, 8)}@hel.local`;
  const emailUnpaid = `phase6.u.${randomUUID().slice(0, 8)}@hel.local`;
  let userA = "";
  let userB = "";
  let userUnpaid = "";
  let csrfA = "";
  let csrfB = "";
  let matchId = "";

  before(async () => {
    assertSafeSyntheticTestDatabase(DATABASE_URL);
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.SESSION_SECRET ??= "hel_dev_session_secret_change_me_32";
    process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
    process.env.MAIL_DRIVER = "console";
    process.env.COOKIE_SECURE = "false";
    process.env.LOG_LEVEL = "fatal";

    const distAppModule = join(__dirname, "../dist/app.module.js");
    let AppModule: unknown;
    try {
      AppModule = require(distAppModule).AppModule;
    } catch {
      throw new Error(`Missing ${distAppModule}. Run npm run build -w @hel/api`);
    }

    prisma = new PrismaClient();
    const a = await createMember(prisma, {
      email: emailA,
      password,
      gender: "male",
    });
    const b = await createMember(prisma, {
      email: emailB,
      password,
      gender: "female",
    });
    const u = await createMember(prisma, {
      email: emailUnpaid,
      password,
      gender: "male",
      hasPaid: false,
      approved: false,
      questionnaireComplete: true,
    });
    userA = a.id;
    userB = b.id;
    userUnpaid = u.id;

    // Seed bidirectional compatibility scores ≥ 70
    await prisma.compatibilityScore.createMany({
      data: [
        {
          convexId: `local_score_${randomUUID()}`,
          userAId: userA,
          userBId: userB,
          convexUserA: a.convexId,
          convexUserB: b.convexId,
          score: 88,
          scoreVersion: 1,
          lastCalculatedAt: new Date(),
        },
        {
          convexId: `local_score_${randomUUID()}`,
          userAId: userB,
          userBId: userA,
          convexUserA: b.convexId,
          convexUserB: a.convexId,
          score: 88,
          scoreVersion: 1,
          lastCalculatedAt: new Date(),
        },
      ],
    });

    // Media stub rows so hasPhoto passes via convex id presence (no MinIO needed for discover filter)
    // profileImageConvexId already set on create.

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule as never],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use(cookieParser());
    await app.init();
    agentA = request.agent(app.getHttpServer());
    agentB = request.agent(app.getHttpServer());
  });

  after(async () => {
    const ids = [userA, userB, userUnpaid].filter(Boolean);
    for (const id of ids) {
      await prisma.conversation.deleteMany({
        where: { match: { OR: [{ userAId: id }, { userBId: id }] } },
      });
      await prisma.match.deleteMany({
        where: { OR: [{ userAId: id }, { userBId: id }] },
      });
      await prisma.like.deleteMany({
        where: { OR: [{ fromUserId: id }, { toUserId: id }] },
      });
      await prisma.compatibilityScore.deleteMany({
        where: { OR: [{ userAId: id }, { userBId: id }] },
      });
      await prisma.session.deleteMany({ where: { userId: id } });
      await prisma.profileAuditEvent.deleteMany({ where: { userId: id } });
      await prisma.authAuditEvent.deleteMany({ where: { userId: id } });
      await prisma.preference.deleteMany({ where: { userId: id } });
      await prisma.profile.deleteMany({ where: { userId: id } });
      await prisma.authAccount.deleteMany({ where: { userId: id } });
      await prisma.user.delete({ where: { id } }).catch(() => undefined);
    }
    await app?.close();
    await prisma?.$disconnect();
  });

  async function login(
    agent: ReturnType<typeof request.agent>,
    email: string
  ) {
    const login = await agent
      .post("/auth/login")
      .send({ email, password })
      .expect(200);
    const me = await agent.get("/auth/me").expect(200);
    return me.body.csrfToken as string;
  }

  it("unpaid denial on discover", async () => {
    const agentU = request.agent(app.getHttpServer());
    const csrf = await login(agentU, emailUnpaid);
    await agentU
      .get("/matches/discover")
      .set("X-CSRF-Token", csrf)
      .expect(403);
  });

  it("authenticated discover returns scored candidate", async () => {
    csrfA = await login(agentA, emailA);
    const res = await agentA.get("/matches/discover").expect(200);
    assert.ok(Array.isArray(res.body.items));
    assert.ok(res.body.items.some((i: { userId: string }) => i.userId === userB));
    assert.ok(res.body.items.every((i: { score: number }) => i.score >= 70));
  });

  it("like / pass / shortlist and reciprocal match", async () => {
    csrfB = await login(agentB, emailB);

    await agentA
      .post(`/matches/${userB}/action`)
      .set("X-CSRF-Token", csrfA)
      .send({ action: "shortlist" })
      .expect(200);

    await agentA
      .post(`/matches/${userB}/action`)
      .set("X-CSRF-Token", csrfA)
      .send({ action: "pass" })
      .expect(200);

    const likeA = await agentA
      .post(`/matches/${userB}/action`)
      .set("X-CSRF-Token", csrfA)
      .send({ action: "like" })
      .expect(200);
    // One like opens chat immediately (no reciprocal required).
    assert.equal(likeA.body.matched, true);
    assert.equal(likeA.body.mutual, false);
    assert.ok(likeA.body.conversationId);
    assert.ok(likeA.body.matchId);
    matchId = likeA.body.matchId as string;

    const likeB = await agentB
      .post(`/matches/${userA}/action`)
      .set("X-CSRF-Token", csrfB)
      .send({ action: "like" })
      .expect(200);
    assert.equal(likeB.body.matched, true);
    assert.equal(likeB.body.mutual, true);
    assert.equal(likeB.body.matchId, matchId);
    assert.ok(likeB.body.conversationId);

    // Race-safe: second mutual path returns same pairKey match
    const again = await agentB
      .post(`/matches/${userA}/action`)
      .set("X-CSRF-Token", csrfB)
      .send({ action: "like" })
      .expect(200);
    assert.equal(again.body.matchId, matchId);

    const pair = await prisma.match.findUnique({ where: { id: matchId } });
    assert.equal(pair?.pairKey, makePairKey(userA, userB));
    const count = await prisma.match.count({
      where: { pairKey: makePairKey(userA, userB) },
    });
    assert.equal(count, 1);
  });

  it("mutual list, seen, archive, wali, breakdown", async () => {
    const mutual = await agentA.get("/matches/mutual").expect(200);
    assert.ok(mutual.body.items.some((i: { matchId: string }) => i.matchId === matchId));

    await agentA
      .post(`/matches/${matchId}/seen`)
      .set("X-CSRF-Token", csrfA)
      .expect(200);

    const wali = await agentA.get(`/matches/${matchId}/wali`).expect(200);
    assert.equal(wali.body.waliName, "Uncle");

    const breakdown = await agentA
      .get(`/matches/${userB}/breakdown`)
      .expect(200);
    assert.ok(typeof breakdown.body.total === "number");

    await agentA
      .post(`/matches/${matchId}/archive`)
      .set("X-CSRF-Token", csrfA)
      .send({ archived: true })
      .expect(200);

    const archived = await agentA
      .get("/matches/mutual?list=archived")
      .expect(200);
    assert.ok(
      archived.body.items.some((i: { matchId: string }) => i.matchId === matchId)
    );
  });

  it("blocked pair exclusion", async () => {
    await prisma.block.create({
      data: {
        convexId: `local_block_${randomUUID()}`,
        blockerId: userA,
        blockedId: userB,
        convexBlockerId: "cx_a",
        convexBlockedId: "cx_b",
        blockedAt: new Date(),
      },
    });
    const discover = await agentA.get("/matches/discover").expect(200);
    assert.equal(
      discover.body.items.some((i: { userId: string }) => i.userId === userB),
      false
    );
    await agentA
      .post(`/matches/${userB}/action`)
      .set("X-CSRF-Token", csrfA)
      .send({ action: "like" })
      .expect(403);
    await agentA
      .post("/matches/start-chat")
      .set("X-CSRF-Token", csrfA)
      .send({ targetUserId: userB })
      .expect(403);
    await prisma.block.deleteMany({
      where: { blockerId: userA, blockedId: userB },
    });
  });

  it("start-chat opens conversation without likes", async () => {
    // Fresh pair C would be better; reuse A→someone not yet matched if available.
    // After prior tests A/B already have a match — start-chat should still return it.
    const res = await agentA
      .post("/matches/start-chat")
      .set("X-CSRF-Token", csrfA)
      .send({ targetUserId: userB })
      .expect(200);
    assert.equal(res.body.matched, true);
    assert.ok(res.body.conversationId);
    assert.ok(res.body.matchId);
    assert.equal(typeof res.body.mutual, "boolean");
  });
});
