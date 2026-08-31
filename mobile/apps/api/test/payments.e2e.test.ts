/**
 * Phase 8 payments HTTP e2e — fake Stripe + local Postgres/Redis/MinIO.
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
import {
  FakeStripeGateway,
  STRIPE_GATEWAY,
} from "../src/payments/stripe.gateway";
import { assertSafeSyntheticTestDatabase } from "./safe-test-database";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const password = "Phase8-E2E-Test-Only-99";

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
  }
) {
  const hash = await hashPasswordPreferred(password);
  const convexId = `local_p8_${randomUUID()}`;
  return prisma.user.create({
    data: {
      convexId,
      email: opts.email,
      emailNormalized: opts.email,
      name: "Phase8",
      gender: opts.gender,
      authAccounts: {
        create: {
          convexId: `local_p8_auth_${randomUUID()}`,
          convexUserId: convexId,
          provider: "password",
          providerAccountId: opts.email,
          passwordHash: hash.hash,
          passwordAlgo: hash.algo,
        },
      },
      profile: {
        create: {
          convexId: `local_p8_prof_${randomUUID()}`,
          convexUserId: convexId,
          name: "Phase8",
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
          approved: opts.hasPaid ? true : false,
          reviewStatus: opts.hasPaid ? "approved" : "incomplete",
          hasPaid: opts.hasPaid ?? false,
          banned: false,
        },
      },
    },
  });
}

describe("Phase 8 payments e2e", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fakeStripe: FakeStripeGateway;
  let agent: ReturnType<typeof request.agent>;
  let adminAgent: ReturnType<typeof request.agent>;
  let csrf = "";
  let adminCsrf = "";
  let userId = "";
  let adminId = "";
  const email = `phase8.${randomUUID().slice(0, 8)}@hel.local`;
  const adminEmail = `phase8.admin.${randomUUID().slice(0, 8)}@hel.local`;
  const quarantinedBefore = { count: 0 };

  before(async () => {
    assertSafeSyntheticTestDatabase(DATABASE_URL);
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
    process.env.SESSION_SECRET ??= "hel_dev_session_secret_change_me_32";
    process.env.MAIL_DRIVER = "console";
    process.env.STRIPE_GATEWAY = "fake";
    process.env.COOKIE_SECURE = "false";
    process.env.LOG_LEVEL = "fatal";
    process.env.S3_ENDPOINT ??= "http://127.0.0.1:9000";
    process.env.S3_ACCESS_KEY_ID ??= "helminio";
    process.env.S3_SECRET_ACCESS_KEY ??= "hel_minio_dev_change_me";

    const distAppModule = join(__dirname, "../dist/app.module.js");
    const AppModule = require(distAppModule).AppModule;
    fakeStripe = new FakeStripeGateway();

    prisma = new PrismaClient();
    quarantinedBefore.count = await prisma.migrationFailure.count({
      where: { tableName: "payments", reasonCode: "missing_user" },
    });

    const user = await createMember(prisma, { email, gender: "male" });
    const admin = await createMember(prisma, {
      email: adminEmail,
      gender: "male",
      role: "admin",
      hasPaid: true,
    });
    userId = user.id;
    adminId = admin.id;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule as never],
    })
      .overrideProvider(STRIPE_GATEWAY)
      .useValue(fakeStripe)
      .compile();

    app = moduleRef.createNestApplication({
      logger: ["error", "warn"],
      rawBody: true,
    });
    app.use(cookieParser());
    await app.init();
    agent = request.agent(app.getHttpServer());
    adminAgent = request.agent(app.getHttpServer());

    const login = await agent
      .post("/auth/login")
      .send({ email, password })
      .expect(200);
    csrf = login.body.csrfToken;
    const adminLogin = await adminAgent
      .post("/auth/login")
      .send({ email: adminEmail, password })
      .expect(200);
    adminCsrf = adminLogin.body.csrfToken;
  });

  after(async () => {
    const ids = [userId, adminId].filter(Boolean);
    for (const id of ids) {
      await prisma.mailDelivery.deleteMany({ where: { userId: id } });
      await prisma.notification.deleteMany({ where: { userId: id } });
      await prisma.payment.deleteMany({ where: { userId: id } });
      await prisma.evcPaymentProof.deleteMany({ where: { userId: id } });
      await prisma.auditLog.deleteMany({
        where: { OR: [{ actorUserId: id }, { targetUserId: id }] },
      });
      await prisma.profileAuditEvent.deleteMany({ where: { userId: id } });
      await prisma.mediaObject.deleteMany({ where: { ownerUserId: id } });
      await prisma.session.deleteMany({ where: { userId: id } });
      await prisma.authAuditEvent.deleteMany({ where: { userId: id } }).catch(() => undefined);
      await prisma.profile.deleteMany({ where: { userId: id } });
      await prisma.authAccount.deleteMany({ where: { userId: id } });
      await prisma.user.delete({ where: { id } }).catch(() => undefined);
    }
    await app?.close();
    await prisma?.$disconnect();
  });

  it("creates registration checkout with mocked Stripe", async () => {
    const res = await agent
      .post("/payments/stripe/registration-checkout")
      .set("X-CSRF-Token", csrf)
      .send({ tier: "basic" })
      .expect(200);
    assert.ok(res.body.url);
    assert.ok(res.body.sessionId.startsWith("cs_test_fake_"));
    assert.equal(res.body.amount, 500);
    const pending = await prisma.payment.findUnique({
      where: { stripeSessionId: res.body.sessionId },
    });
    assert.equal(pending?.status, "pending");
  });

  it("rejects invalid webhook signature", async () => {
    await agent
      .post("/webhooks/stripe")
      .set("stripe-signature", "invalid")
      .send({ id: "evt_bad" })
      .expect(400);
  });

  it("fulfills valid webhook and is idempotent on duplicate", async () => {
    const checkout = await agent
      .post("/payments/stripe/registration-checkout")
      .set("X-CSRF-Token", csrf)
      .send({ tier: "basic" })
      .expect(200);
    const session = fakeStripe.markPaid(checkout.body.sessionId);
    const body = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: "checkout.session.completed",
      data: { object: session },
    });

    const first = await agent
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "t=1,v1=valid_test_sig")
      .send(body);
    if (first.status !== 200) {
      assert.fail(`webhook failed ${first.status}: ${JSON.stringify(first.body)}`);
    }
    assert.equal(first.body.received, true);

    const profile = await prisma.profile.findUniqueOrThrow({
      where: { userId },
    });
    assert.equal(profile.hasPaid, true);
    assert.equal(profile.genderLocked, true);
    assert.equal(profile.approved, true);

    const dup = await agent
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "t=1,v1=valid_test_sig")
      .send(body)
      .expect(200);
    assert.equal(dup.body.duplicate, true);

    const payments = await prisma.payment.count({
      where: { userId, status: "completed" },
    });
    assert.ok(payments >= 1);
  });

  it("payment status endpoint returns access fields", async () => {
    const res = await agent.get("/payments/status").expect(200);
    assert.equal(typeof res.body.hasPaid, "boolean");
    assert.ok(res.body.nextRoute);
    assert.equal(typeof res.body.premiumStatus, "boolean");
  });

  it("verify-session fallback grants when paid", async () => {
    // Reset paid for a fresh session path using woman fixture is heavy —
    // use upgrade path: mark user unpaid temporarily if already paid from prior test.
    await prisma.profile.update({
      where: { userId },
      data: {
        hasPaid: false,
        hasPersonalSupport: false,
        genderLocked: false,
        approved: false,
        reviewStatus: "incomplete",
      },
    });
    const checkout = await agent
      .post("/payments/stripe/registration-checkout")
      .set("X-CSRF-Token", csrf)
      .send({ tier: "premium" })
      .expect(200);
    fakeStripe.markPaid(checkout.body.sessionId);
    const verified = await agent
      .post("/payments/stripe/verify-session")
      .set("X-CSRF-Token", csrf)
      .send({ sessionId: checkout.body.sessionId })
      .expect(200);
    assert.equal(verified.body.success, true);
    assert.equal(verified.body.isPremium, true);
    const again = await agent
      .post("/payments/stripe/verify-session")
      .set("X-CSRF-Token", csrf)
      .send({ sessionId: checkout.body.sessionId })
      .expect(200);
    assert.equal(again.body.alreadyCompleted, true);
  });

  it("EVC sign-upload, submit, staff approve", async () => {
    await prisma.profile.update({
      where: { userId },
      data: {
        hasPaid: false,
        hasPersonalSupport: false,
        genderLocked: false,
      },
    });
    const signed = await agent
      .post("/payments/evc/proof/sign-upload")
      .set("X-CSRF-Token", csrf)
      .send({ contentType: "image/jpeg", sizeBytes: 1024 })
      .expect(200);
    assert.ok(signed.body.mediaId);
    assert.ok(signed.body.uploadUrl);

    // Mark media uploaded without real MinIO put (head may fail) — update status
    await prisma.mediaObject.update({
      where: { id: signed.body.mediaId },
      data: {
        migrationStatus: "uploaded",
        verifiedReadable: true,
        bucket: "hel-evc",
        objectKey: `${userId}/${signed.body.mediaId}.jpg`,
      },
    });

    // Bypass head check by stubbing: put empty object if minio up, else skip submit head
    // Submit may fail head — create proof via service path by putting object best-effort
    try {
      await fetch(signed.body.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      });
    } catch {
      // ignore
    }

    const submitted = await agent
      .post("/payments/evc/proof/submit")
      .set("X-CSRF-Token", csrf)
      .send({
        tier: "basic",
        payerFullName: "Test Payer Name",
        lastFourDigits: "1234",
        mediaId: signed.body.mediaId,
      });
    if (submitted.status !== 200) {
      assert.fail(
        `evc submit ${submitted.status}: ${JSON.stringify(submitted.body)}`
      );
    }

    const proofId = submitted.body.proofId as string;
    const dup = await agent
      .post("/payments/evc/proof/submit")
      .set("X-CSRF-Token", csrf)
      .send({
        tier: "basic",
        payerFullName: "Test Payer Name",
        lastFourDigits: "1234",
        mediaId: signed.body.mediaId,
      })
      .expect(400);
    assert.match(String(dup.body.message), /already have a payment proof/i);

    await adminAgent
      .post(`/payments/evc/admin/${proofId}/approve`)
      .set("X-CSRF-Token", adminCsrf)
      .send({})
      .expect(200);

    const profile = await prisma.profile.findUniqueOrThrow({
      where: { userId },
    });
    assert.equal(profile.hasPaid, true);

    const notif = await prisma.notification.findFirst({
      where: { userId, type: "payment" },
      orderBy: { notificationCreatedAt: "desc" },
    });
    assert.ok(notif);
  });

  it("does not modify quarantined missing_user payment failures", async () => {
    const after = await prisma.migrationFailure.count({
      where: { tableName: "payments", reasonCode: "missing_user" },
    });
    assert.equal(after, quarantinedBefore.count);
  });
});
