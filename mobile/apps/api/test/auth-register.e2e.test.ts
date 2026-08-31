/**
 * Phase 11 auth registration HTTP e2e — PostgreSQL only.
 * Requires compiled Nest app: `npm run build -w @hel/api`.
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
import { assertSafeSyntheticTestDatabase } from "./safe-test-database";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://hel:hel_dev_change_me@127.0.0.1:5432/hel_calafkaaga?schema=public";

describe("Phase 11 auth register HTTP e2e", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const email = `phase11.reg.${randomUUID().slice(0, 8)}@hel.local`;
  const password = "Phase11-Reg-E2E-Test-99";
  let userId = "";

  before(async () => {
    assertSafeSyntheticTestDatabase(DATABASE_URL);
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.SESSION_SECRET ??= "hel_dev_session_secret_change_me_32";
    process.env.MAIL_DRIVER = "console";
    process.env.COOKIE_SECURE = "false";
    process.env.LOG_LEVEL = "fatal";
    // Rate limiter fail-closed without Redis — point at local Redis if present,
    // otherwise e2e may 503. Override via REDIS_URL in env.
    process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

    const distAppModule = join(__dirname, "../dist/app.module.js");
    let AppModule: unknown;
    try {
      AppModule = require(distAppModule).AppModule;
    } catch {
      throw new Error(
        `Missing ${distAppModule}. Run: npm run build -w @hel/api`
      );
    }

    prisma = new PrismaClient();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule as never],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  after(async () => {
    if (userId) {
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.authAuditEvent.deleteMany({ where: { userId } });
      await prisma.preference.deleteMany({ where: { userId } });
      await prisma.profile.deleteMany({ where: { userId } });
      await prisma.authAccount.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.authAuditEvent.deleteMany({
      where: {
        action: { in: ["register_failed", "register_success"] },
        userId: null,
      },
    });
    await app?.close();
    await prisma?.$disconnect();
  });

  it("check-email reports available then unavailable after register", async () => {
    const free = await request(app.getHttpServer())
      .post("/auth/register/check-email")
      .send({ email })
      .expect(200);
    assert.equal(free.body.available, true);

    const reg = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email, password })
      .expect(200);

    assert.ok(reg.body.user?.id);
    assert.equal(reg.body.user.hasPaid, false);
    assert.equal(reg.body.user.hasProfile, true);
    assert.ok(reg.body.csrfToken);
    userId = reg.body.user.id;

    const cookies = reg.headers["set-cookie"];
    assert.ok(cookies);

    const taken = await request(app.getHttpServer())
      .post("/auth/register/check-email")
      .send({ email })
      .expect(200);
    assert.equal(taken.body.available, false);

    const profile = await prisma.profile.findUnique({ where: { userId } });
    assert.ok(profile);
    assert.equal(profile!.hasPaid, false);
    assert.equal(profile!.registrationComplete, false);
    assert.equal(profile!.reviewStatus, "incomplete");

    const pref = await prisma.preference.findUnique({ where: { userId } });
    assert.ok(pref);
    assert.equal(pref!.preferredGender, "female");
  });

  it("duplicate register returns generic failure", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email, password: "Another-Pass-99" })
      .expect(403);
    assert.match(String(res.body.message ?? ""), /Unable to create account/i);
  });

  it("short password is rejected", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        email: `phase11.short.${randomUUID().slice(0, 8)}@hel.local`,
        password: "short",
      })
      .expect(400);
    assert.match(
      String(res.body.message ?? ""),
      /at least 8 characters|Invalid request body/i
    );
  });
});
