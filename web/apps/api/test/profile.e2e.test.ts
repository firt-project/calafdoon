/**
 * Phase 5 local HTTP e2e — PostgreSQL only (no Convex / Resend / Stripe).
 * Requires compiled Nest app (decorator metadata): run `npm run build` first.
 * Creates artificial fixtures and cleans them up.
 */
import "reflect-metadata";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
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

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://hel:hel_dev_change_me@127.0.0.1:5432/hel_calafkaaga?schema=public";

describe("Phase 5 profile HTTP e2e", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let agent: ReturnType<typeof request.agent>;
  const email = `phase5.e2e.${randomUUID().slice(0, 8)}@hel.local`;
  const password = "Phase5-E2E-Test-Only-99";
  let userId = "";
  let csrf = "";

  before(async () => {
    assertSafeSyntheticTestDatabase(DATABASE_URL);
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.SESSION_SECRET ??= "hel_dev_session_secret_change_me_32";
    process.env.MAIL_DRIVER = "console";
    process.env.COOKIE_SECURE = "false";
    process.env.LOG_LEVEL = "fatal";

    // Load compiled Nest modules so design:paramtypes exist
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
    const hash = await hashPasswordPreferred(password);
    const convexId = `local_e2e_${randomUUID()}`;
    const user = await prisma.user.create({
      data: {
        convexId,
        email,
        emailNormalized: email,
        name: "Phase5 E2E",
        gender: "male",
        authAccounts: {
          create: {
            convexId: `local_e2e_auth_${randomUUID()}`,
            convexUserId: convexId,
            provider: "password",
            providerAccountId: email,
            passwordHash: hash.hash,
            passwordAlgo: hash.algo,
          },
        },
        profile: {
          create: {
            convexId: `local_e2e_prof_${randomUUID()}`,
            convexUserId: convexId,
            name: "Phase5 E2E",
            gender: "male",
            age: 28,
            height: 175,
            weight: 70,
            country: "Somalia",
            city: "Mogadishu",
            education: "Bachelor",
            occupation: "Engineer",
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
            languagesSpoken: ["Somali", "English"],
            qualities: ["Kind"],
            hobbies: ["Football"],
            questionnaireComplete: false,
            questionnaireStep: 2,
            registrationComplete: true,
            hasPaid: false,
            banned: false,
            approved: false,
            reviewStatus: "incomplete",
            photoVisibility: "everyone",
            financialReadiness: "Ready",
            hasCurrentWife: "No",
            openToSecondWife: "No",
            loveLanguage: "Words of Affirmation",
            spousePrayerImportance: "Important",
          },
        },
        preferences: {
          create: {
            convexId: `local_e2e_pref_${randomUUID()}`,
            convexUserId: convexId,
            preferredGender: "female",
            minAge: 20,
            maxAge: 35,
            minHeight: 150,
            maxHeight: 180,
            preferredCountries: ["Somalia"],
            acceptChildren: "Depends",
            educationLevel: "Bachelor",
            acceptDivorcee: "Depends",
            acceptWidow: "Depends",
            qualities: [],
            hobbies: [],
            partnerHijabLevel: "Always",
          },
        },
      },
    });
    userId = user.id;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule as never],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.use(cookieParser());
    await app.init();
    agent = request.agent(app.getHttpServer());
    void pathToFileURL; // silence unused in some bundlers
  });

  after(async () => {
    if (userId) {
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.profileAuditEvent.deleteMany({ where: { userId } });
      await prisma.authAuditEvent.deleteMany({ where: { userId } });
      await prisma.preference.deleteMany({ where: { userId } });
      await prisma.profile.deleteMany({ where: { userId } });
      await prisma.authAccount.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await app?.close();
    await prisma?.$disconnect();
  });

  it("login + GET /auth/me includes accessState", async () => {
    const login = await agent
      .post("/auth/login")
      .send({ email, password })
      .expect(200);
    assert.ok(login.body.csrfToken);
    assert.equal(login.body.user.hasProfile, true);

    const me = await agent.get("/auth/me").expect(200);
    csrf = me.body.csrfToken as string;
    assert.ok(csrf);
    assert.equal(me.body.user.email, email);
    assert.equal(me.body.accessState.authenticated, true);
    assert.equal(me.body.accessState.questionnaireComplete, false);
    assert.equal(me.body.accessState.nextRoute, "/questionnaire");
  });

  it("GET /profile/me and PATCH /profile/me", async () => {
    const get = await agent.get("/profile/me").expect(200);
    assert.equal(get.body.profile.name, "Phase5 E2E");

    const patch = await agent
      .patch("/profile/me")
      .set("X-CSRF-Token", csrf)
      .send({ bio: "Local e2e bio" })
      .expect(200);
    assert.equal(patch.body.profile.bio, "Local e2e bio");
  });

  it("GET/PUT preferences", async () => {
    const get = await agent.get("/preferences/me").expect(200);
    assert.equal(get.body.preferences.minAge, 20);

    const put = await agent
      .put("/preferences/me")
      .set("X-CSRF-Token", csrf)
      .send({
        preferredGender: "female",
        minAge: 22,
        maxAge: 40,
        minHeight: 155,
        maxHeight: 185,
        preferredCountries: ["Somalia", "Djibouti"],
        acceptChildren: "Yes",
        educationLevel: "Master",
        acceptDivorcee: "Depends",
        acceptWidow: "Depends",
        partnerHijabLevel: "Always",
      })
      .expect(200);
    assert.equal(put.body.preferences.minAge, 22);
    assert.equal(put.body.preferences.educationLevel, "Master");
  });

  it("questionnaire autosave + access-state", async () => {
    const autosave = await agent
      .post("/profile/questionnaire/autosave")
      .set("X-CSRF-Token", csrf)
      .send({
        step: 3,
        data: { city: "Hargeisa", country: "Somalia", age: 29 },
      })
      .expect(200);
    assert.equal(autosave.body.profile.city, "Hargeisa");
    assert.equal(autosave.body.profile.age, 29);

    const access = await agent.get("/profile/access-state").expect(200);
    assert.equal(access.body.nextRoute, "/questionnaire");
    assert.equal(access.body.hasPaid, false);
  });

  it("rejects staff field edits", async () => {
    await agent
      .patch("/profile/me")
      .set("X-CSRF-Token", csrf)
      .send({ hasPaid: true })
      .expect(403);
  });

  it("signed photo upload flow rejects bad MIME", async () => {
    await agent
      .post("/profile/photos/sign-upload")
      .set("X-CSRF-Token", csrf)
      .send({ contentType: "application/pdf", slot: "main" })
      .expect(400);
  });

  it("DELETE /profile/account removes the signed-in user", async () => {
    const res = await agent
      .delete("/profile/account")
      .set("X-CSRF-Token", csrf)
      .send({ password })
      .expect(200);
    assert.equal(res.body.ok, true);
    userId = "";
    await agent.get("/auth/me").expect(401);
  });
});
