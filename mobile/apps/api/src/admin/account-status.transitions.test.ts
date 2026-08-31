/**
 * Account status restore transitions — requires safe local DATABASE_URL.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPasswordPreferred } from "../auth/password";
import { assertSafeSyntheticTestDatabase } from "../../test/safe-test-database";
import { AccountStatusService } from "./account-status.service";
import { AuditLogService } from "./audit-log.service";
import { MetricsService } from "./metrics.service";
import { resolveDateRange } from "./date-range";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://hel:hel_dev_change_me@127.0.0.1:5432/hel_calafkaaga?schema=public";

async function createMember(
  prisma: PrismaClient,
  opts: {
    reviewStatus: "approved" | "pending_review" | "rejected";
    approved: boolean;
  }
) {
  const email = `status.${randomUUID().slice(0, 8)}@hel.local`;
  const hash = await hashPasswordPreferred("Status-Test-Only-99");
  const convexId = `local_st_${randomUUID()}`;
  return prisma.user.create({
    data: {
      convexId,
      email,
      emailNormalized: email,
      name: "StatusTest",
      gender: "female",
      authAccounts: {
        create: {
          convexId: `local_st_auth_${randomUUID()}`,
          convexUserId: convexId,
          provider: "password",
          providerAccountId: email,
          passwordHash: hash.hash,
          passwordAlgo: hash.algo,
        },
      },
      profile: {
        create: {
          convexId: `local_st_prof_${randomUUID()}`,
          convexUserId: convexId,
          name: "StatusTest",
          gender: "female",
          age: 27,
          height: 165,
          weight: 60,
          country: "Somalia",
          city: "Mogadishu",
          education: "Bachelor",
          occupation: "Teacher",
          religiousLevel: "Practicing",
          maritalStatus: "Never married",
          children: 0,
          bio: "test",
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
          questionnaireComplete: true,
          registrationComplete: true,
          questionnaireStep: 11,
          approved: opts.approved,
          reviewStatus: opts.reviewStatus,
          hasPaid: true,
          banned: false,
          phone: "+252611111111",
        },
      },
    },
    include: { profile: true },
  });
}

describe("account status transitions", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  const ids: string[] = [];
  let adminId = "";
  let status: AccountStatusService;

  before(async () => {
    assertSafeSyntheticTestDatabase(DATABASE_URL);
    // Ensure migration columns exist — soft check.
    try {
      await prisma.$queryRaw`SELECT status_before_ban FROM profiles LIMIT 1`;
    } catch {
      console.warn(
        "[account-status] migration not applied — run prisma migrate deploy"
      );
      throw new Error("account_status_history migration required");
    }

    const audit = new AuditLogService(prisma);
    const metrics = {
      scheduleRebuild: async () => undefined,
    } as unknown as MetricsService;
    status = new AccountStatusService(prisma, audit, metrics);

    const adminEmail = `status.admin.${randomUUID().slice(0, 8)}@hel.local`;
    const hash = await hashPasswordPreferred("Status-Admin-99");
    const convexId = `local_st_admin_${randomUUID()}`;
    const admin = await prisma.user.create({
      data: {
        convexId,
        email: adminEmail,
        emailNormalized: adminEmail,
        name: "Admin Yusuf",
        authAccounts: {
          create: {
            convexId: `local_st_admin_auth_${randomUUID()}`,
            convexUserId: convexId,
            provider: "password",
            providerAccountId: adminEmail,
            passwordHash: hash.hash,
            passwordAlgo: hash.algo,
          },
        },
        profile: {
          create: {
            convexId: `local_st_admin_p_${randomUUID()}`,
            convexUserId: convexId,
            name: "Admin Yusuf",
            gender: "male",
            age: 35,
            height: 180,
            weight: 80,
            country: "Somalia",
            city: "Mogadishu",
            education: "Bachelor",
            occupation: "Admin",
            religiousLevel: "Practicing",
            maritalStatus: "Never married",
            children: 0,
            bio: "admin",
            verified: true,
            role: "admin",
            prayerFrequency: "Always",
            smokes: "No",
            drinksAlcohol: "No",
            exercise: "Sometimes",
            wantChildren: "Yes",
            marriageTimeline: "Within 1 year",
            marrySomeoneWithChildren: "Yes",
            languagesSpoken: ["Somali"],
            qualities: [],
            hobbies: [],
            questionnaireComplete: true,
            registrationComplete: true,
            approved: true,
            reviewStatus: "approved",
            hasPaid: true,
            banned: false,
          },
        },
      },
    });
    adminId = admin.id;
    ids.push(admin.id);
  });

  after(async () => {
    for (const id of ids.reverse()) {
      await prisma.accountStatusHistory.deleteMany({ where: { userId: id } });
      await prisma.accountAppeal.deleteMany({ where: { userId: id } });
      await prisma.auditLog.deleteMany({
        where: { OR: [{ actorUserId: id }, { targetUserId: id }] },
      });
      await prisma.profile.deleteMany({ where: { userId: id } });
      await prisma.authAccount.deleteMany({ where: { userId: id } });
      await prisma.user.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it("Approved → Banned → Unbanned = Approved", async () => {
    const u = await createMember(prisma, {
      reviewStatus: "approved",
      approved: true,
    });
    ids.push(u.id);
    await status.transition({
      actorUserId: adminId,
      profileId: u.profile!.id,
      event: "ban",
      reason: "Community guidelines violation",
    });
    let p = await prisma.profile.findUniqueOrThrow({ where: { id: u.profile!.id } });
    assert.equal(p.banned, true);
    assert.equal(p.reviewStatus, "suspended");
    assert.equal(p.statusBeforeBan, "approved");
    assert.ok(p.bannedAt);

    await status.transition({
      actorUserId: adminId,
      profileId: u.profile!.id,
      event: "unban",
      reason: "Ban removed after review",
    });
    p = await prisma.profile.findUniqueOrThrow({ where: { id: u.profile!.id } });
    assert.equal(p.banned, false);
    assert.equal(p.reviewStatus, "approved");
    assert.equal(p.approved, true);
    assert.ok(p.unbannedAt);

    const hist = await prisma.accountStatusHistory.findMany({
      where: { profileId: u.profile!.id },
      orderBy: { createdAt: "asc" },
    });
    assert.ok(hist.some((h) => h.eventType === "banned"));
    assert.ok(hist.some((h) => h.eventType === "unbanned"));
  });

  it("Pending → Banned → Unbanned = Pending", async () => {
    const u = await createMember(prisma, {
      reviewStatus: "pending_review",
      approved: false,
    });
    ids.push(u.id);
    await status.transition({
      actorUserId: adminId,
      profileId: u.profile!.id,
      event: "ban",
    });
    await status.transition({
      actorUserId: adminId,
      profileId: u.profile!.id,
      event: "unban",
    });
    const p = await prisma.profile.findUniqueOrThrow({
      where: { id: u.profile!.id },
    });
    assert.equal(p.reviewStatus, "pending_review");
    assert.equal(p.approved, false);
  });

  it("Rejected → Banned → Unbanned = Rejected", async () => {
    const u = await createMember(prisma, {
      reviewStatus: "rejected",
      approved: false,
    });
    ids.push(u.id);
    await status.transition({
      actorUserId: adminId,
      profileId: u.profile!.id,
      event: "ban",
    });
    await status.transition({
      actorUserId: adminId,
      profileId: u.profile!.id,
      event: "unban",
    });
    const p = await prisma.profile.findUniqueOrThrow({
      where: { id: u.profile!.id },
    });
    assert.equal(p.reviewStatus, "rejected");
    assert.equal(p.approved, false);
  });

  it("Approved → Paused → Resumed = Approved", async () => {
    const u = await createMember(prisma, {
      reviewStatus: "approved",
      approved: true,
    });
    ids.push(u.id);
    await status.transition({
      actorUserId: adminId,
      profileId: u.profile!.id,
      event: "pause",
      reason: "Temporary hold",
    });
    let p = await prisma.profile.findUniqueOrThrow({ where: { id: u.profile!.id } });
    assert.equal(p.reviewStatus, "paused");
    assert.equal(p.statusBeforePause, "approved");
    assert.ok(p.pausedAt);

    await status.transition({
      actorUserId: adminId,
      profileId: u.profile!.id,
      event: "resume",
    });
    p = await prisma.profile.findUniqueOrThrow({ where: { id: u.profile!.id } });
    assert.equal(p.reviewStatus, "approved");
    assert.equal(p.approved, true);
    assert.ok(p.resumedAt);
  });

  it("Pending → Paused → Resumed = Pending", async () => {
    const u = await createMember(prisma, {
      reviewStatus: "pending_review",
      approved: false,
    });
    ids.push(u.id);
    await status.transition({
      actorUserId: adminId,
      profileId: u.profile!.id,
      event: "pause",
    });
    await status.transition({
      actorUserId: adminId,
      profileId: u.profile!.id,
      event: "resume",
    });
    const p = await prisma.profile.findUniqueOrThrow({
      where: { id: u.profile!.id },
    });
    assert.equal(p.reviewStatus, "pending_review");
    assert.equal(p.approved, false);
  });

  it("date-filter report counts real history events", async () => {
    const u = await createMember(prisma, {
      reviewStatus: "approved",
      approved: true,
    });
    ids.push(u.id);
    await status.transition({
      actorUserId: adminId,
      profileId: u.profile!.id,
      event: "ban",
    });
    const range = resolveDateRange({
      preset: "today",
      timeZone: "UTC",
      now: new Date(),
    });
    const report = await status.reportPeriod(range.from, range.to, "Somalia");
    assert.ok(report.banned >= 1);
    assert.equal(typeof report.registrations, "number");
    assert.equal(report.uploadedVideos, 0);
    assert.equal(report.coinTransactions, 0);
  });
});
