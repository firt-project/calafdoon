/**
 * Phase 9 admin HTTP e2e — synthetic accounts only.
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
import { assertSafeSyntheticTestDatabase } from "./safe-test-database";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const password = "Phase9-E2E-Test-Only-99";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://hel:hel_dev_change_me@127.0.0.1:5432/hel_calafkaaga?schema=public";

async function createMember(
  prisma: PrismaClient,
  opts: {
    email: string;
    gender: "male" | "female";
    role?: "user" | "admin" | "owner";
    hasPaid?: boolean;
    reviewStatus?: "incomplete" | "pending_review" | "approved" | "rejected";
    approved?: boolean;
  }
) {
  const hash = await hashPasswordPreferred(password);
  const convexId = `local_p9e_${randomUUID()}`;
  return prisma.user.create({
    data: {
      convexId,
      email: opts.email,
      emailNormalized: opts.email,
      name: "Phase9E2E",
      gender: opts.gender,
      authAccounts: {
        create: {
          convexId: `local_p9e_auth_${randomUUID()}`,
          convexUserId: convexId,
          provider: "password",
          providerAccountId: opts.email,
          passwordHash: hash.hash,
          passwordAlgo: hash.algo,
        },
      },
      profile: {
        create: {
          convexId: `local_p9e_prof_${randomUUID()}`,
          convexUserId: convexId,
          name: "Phase9E2E",
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
          role: opts.role ?? "user",
          prayerFrequency: "Most of the time",
          smokes: "No",
          drinksAlcohol: "No",
          exercise: "Sometimes",
          wantChildren: "Yes",
          marriageTimeline: "Within 1 year",
          marrySomeoneWithChildren: "Depends",
          languagesSpoken: ["Somali"],
          qualities: [],
          hobbies: [],
          questionnaireComplete: true,
          registrationComplete: true,
          questionnaireStep: 11,
          approved: opts.approved ?? !!opts.hasPaid,
          reviewStatus:
            opts.reviewStatus ?? (opts.hasPaid ? "approved" : "incomplete"),
          hasPaid: opts.hasPaid ?? false,
          banned: false,
          phone: "+252611111111",
          profileImageConvexId: `local_img_${randomUUID()}`,
        },
      },
    },
    include: { profile: true },
  });
}

describe("Phase 9 admin e2e", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let memberAgent: ReturnType<typeof request.agent>;
  let adminAgent: ReturnType<typeof request.agent>;
  let ownerAgent: ReturnType<typeof request.agent>;
  let memberCsrf = "";
  let adminCsrf = "";
  let ownerCsrf = "";
  let memberId = "";
  let adminId = "";
  let ownerId = "";
  let womanProfileId = "";
  let womanId = "";
  const suffix = randomUUID().slice(0, 8);
  const memberEmail = `p9e.member.${suffix}@hel.local`;
  const adminEmail = `p9e.admin.${suffix}@hel.local`;
  const ownerEmail = `p9e.owner.${suffix}@hel.local`;
  const womanEmail = `p9e.woman.${suffix}@hel.local`;
  const cleanupIds: string[] = [];

  before(async () => {
    assertSafeSyntheticTestDatabase(DATABASE_URL);
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
    process.env.SESSION_SECRET ??= "hel_dev_session_secret_change_me_32";
    process.env.MAIL_DRIVER = "console";
    process.env.STRIPE_GATEWAY = "fake";
    process.env.COOKIE_SECURE = "false";
    process.env.LOG_LEVEL = "fatal";

    const distAppModule = join(__dirname, "../dist/app.module.js");
    const AppModule = require(distAppModule).AppModule;
    prisma = new PrismaClient();

    const member = await createMember(prisma, {
      email: memberEmail,
      gender: "male",
      hasPaid: true,
    });
    const admin = await createMember(prisma, {
      email: adminEmail,
      gender: "male",
      role: "admin",
      hasPaid: true,
    });
    const owner = await createMember(prisma, {
      email: ownerEmail,
      gender: "male",
      role: "owner",
      hasPaid: true,
    });
    const woman = await createMember(prisma, {
      email: womanEmail,
      gender: "female",
      hasPaid: true,
      approved: false,
      reviewStatus: "rejected",
    });
    memberId = member.id;
    adminId = admin.id;
    ownerId = owner.id;
    womanId = woman.id;
    womanProfileId = woman.profile!.id;
    cleanupIds.push(memberId, adminId, ownerId, womanId);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule as never],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.use(cookieParser());
    await app.init();

    memberAgent = request.agent(app.getHttpServer());
    adminAgent = request.agent(app.getHttpServer());
    ownerAgent = request.agent(app.getHttpServer());

    async function login(
      agent: ReturnType<typeof request.agent>,
      email: string
    ) {
      const res = await agent
        .post("/auth/login")
        .send({ email, password })
        .expect(200);
      const csrf =
        (res.headers["set-cookie"] as string[] | undefined)
          ?.find((c) => c.startsWith("hel_csrf="))
          ?.split(";")[0]
          ?.split("=")[1] ?? "";
      return csrf;
    }

    memberCsrf = await login(memberAgent, memberEmail);
    adminCsrf = await login(adminAgent, adminEmail);
    ownerCsrf = await login(ownerAgent, ownerEmail);
  });

  after(async () => {
    await app?.close();
    for (const id of cleanupIds) {
      try {
        await prisma.session.deleteMany({ where: { userId: id } });
        await prisma.notification.deleteMany({ where: { userId: id } });
        await prisma.supportMessage.deleteMany({
          where: { OR: [{ authorUserId: id }] },
        });
        await prisma.supportContact.deleteMany({ where: { userId: id } });
        await prisma.report.deleteMany({
          where: { OR: [{ reporterId: id }, { reportedUserId: id }] },
        });
        await prisma.block.deleteMany({
          where: { OR: [{ blockerId: id }, { blockedId: id }] },
        });
        await prisma.staffInvite.deleteMany({
          where: { invitedById: id },
        });
        await prisma.announcement.deleteMany({ where: { createdById: id } });
        await prisma.deletionJob.deleteMany({
          where: { OR: [{ actorUserId: id }, { targetUserId: id }] },
        });
        await prisma.auditLog.deleteMany({
          where: { OR: [{ actorUserId: id }, { targetUserId: id }] },
        });
        await prisma.orphanedMediaObject.deleteMany({});
        await prisma.evcPaymentProof.deleteMany({ where: { userId: id } });
        await prisma.payment.deleteMany({ where: { userId: id } });
        await prisma.profile.deleteMany({ where: { userId: id } });
        await prisma.authAccount.deleteMany({ where: { userId: id } });
        await prisma.user.deleteMany({ where: { id } });
      } catch {
        /* deleted */
      }
    }
    await prisma.$disconnect();
  });

  it("member denied admin stats", async () => {
    await memberAgent.get("/admin/stats").expect(403);
  });

  it("admin login and stats", async () => {
    const res = await adminAgent.get("/admin/stats").expect(200);
    assert.ok(res.body);
  });

  it("approve/reject/ban/unban", async () => {
    await adminAgent
      .post(`/admin/users/${womanProfileId}/approve`)
      .set("x-csrf-token", adminCsrf)
      .expect(201);
    let p = await prisma.profile.findUniqueOrThrow({
      where: { id: womanProfileId },
    });
    assert.equal(p.approved, true);

    await adminAgent
      .post(`/admin/users/${womanProfileId}/reject`)
      .set("x-csrf-token", adminCsrf)
      .send({ reason: "photo" })
      .expect(201);

    const memberProfile = await prisma.profile.findUniqueOrThrow({
      where: { userId: memberId },
    });
    await adminAgent
      .post(`/admin/users/${memberProfile.id}/ban`)
      .set("x-csrf-token", adminCsrf)
      .expect(201);
    await adminAgent
      .post(`/admin/users/${memberProfile.id}/unban`)
      .set("x-csrf-token", adminCsrf)
      .expect(201);
  });

  it("report workflow", async () => {
    await memberAgent
      .post("/moderation/report")
      .set("x-csrf-token", memberCsrf)
      .send({ userId: womanId, reason: "spam", details: "e2e" })
      .expect(201);
    const list = await adminAgent.get("/admin/reports?status=open").expect(200);
    assert.ok(list.body.items.length >= 1);
    const reportId = list.body.items[0].id;
    await adminAgent
      .post(`/admin/reports/${reportId}/dismiss`)
      .set("x-csrf-token", adminCsrf)
      .send({ resolution: "ok" })
      .expect(201);
  });

  it("payment list and quarantine summary", async () => {
    const list = await adminAgent.get("/admin/payments?limit=50").expect(200);
    assert.ok(Array.isArray(list.body.items));
    const q = await adminAgent
      .get("/admin/payments/quarantine-summary")
      .expect(200);
    assert.equal(q.body.uniqueQuarantinedCount, 12);
  });

  it("support member thread and staff reply", async () => {
    const created = await memberAgent
      .post("/support")
      .set("x-csrf-token", memberCsrf)
      .send({
        topic: "account",
        message: "E2E support message needs enough chars",
        source: "profile",
      })
      .expect(201);
    await adminAgent
      .post(`/admin/support/${created.body.contactId}/reply`)
      .set("x-csrf-token", adminCsrf)
      .send({ message: "Staff reply here" })
      .expect(201);
  });

  it("staff invite flow", async () => {
    const email = `p9e.invite.${suffix}@hel.local`;
    const created = await ownerAgent
      .post("/admin/staff-invites")
      .set("x-csrf-token", ownerCsrf)
      .send({ email })
      .expect(201);
    assert.ok(created.body.inviteId);
    await ownerAgent
      .post(`/admin/staff-invites/${created.body.inviteId}/revoke`)
      .set("x-csrf-token", ownerCsrf)
      .expect(201);
  });

  it("announcement create/send/schedule", async () => {
    const created = await adminAgent
      .post("/admin/announcements")
      .set("x-csrf-token", adminCsrf)
      .send({
        title: "E2E Ann",
        body: "Hello from e2e announcements",
        audience: "all",
      })
      .expect(201);
    assert.equal(created.body.scheduled, false);

    const scheduled = await adminAgent
      .post("/admin/announcements")
      .set("x-csrf-token", adminCsrf)
      .send({
        title: "E2E Later",
        body: "Scheduled e2e body",
        audience: "paid",
        scheduledFor: Date.now() + 86400000 * 3,
      })
      .expect(201);
    assert.equal(scheduled.body.scheduled, true);
  });

  it("audit log list", async () => {
    const res = await adminAgent.get("/admin/audit-logs?limit=20").expect(200);
    assert.ok(Array.isArray(res.body.items));
  });

  it("synthetic member deletion dry-run and execute", async () => {
    const victim = await createMember(prisma, {
      email: `p9e.del.${suffix}@hel.local`,
      gender: "male",
      hasPaid: true,
    });
    const dry = await adminAgent
      .delete(`/admin/users/${victim.profile!.id}?dryRun=true`)
      .set("x-csrf-token", adminCsrf)
      .expect(200);
    assert.equal(dry.body.mode, "dry_run");

    await adminAgent
      .delete(`/admin/users/${victim.profile!.id}`)
      .set("x-csrf-token", adminCsrf)
      .expect(200);
    const gone = await prisma.user.findUnique({ where: { id: victim.id } });
    assert.equal(gone, null);
  });

  it("metrics rebuild owner-only", async () => {
    await adminAgent
      .post("/admin/site-metrics/rebuild")
      .set("x-csrf-token", adminCsrf)
      .expect(403);
    await ownerAgent
      .post("/admin/site-metrics/rebuild")
      .set("x-csrf-token", ownerCsrf)
      .expect(201);
  });
});
