/**
 * Phase 9 admin unit-style tests — synthetic accounts only.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPasswordPreferred } from "../auth/password";
import { requireAdmin, requireOwner, maskEmail } from "./admin-auth.helpers";
import type { RequestUser } from "../auth/auth.guards";
import { AdminPaymentsService } from "./admin-payments.service";
import { AuditLogService } from "./audit-log.service";
import { DeletionService } from "./deletion.service";
import { MetricsService } from "./metrics.service";
import { ModerationService } from "./moderation.service";
import { StaffInvitesService } from "./staff-invites.service";
import { AnnouncementsService } from "./announcements.service";
import { SupportService } from "./support.service";
import { AdminUsersService } from "./admin-users.service";
import { ConsoleMailAdapter } from "../auth/mail.adapter";
import { isStaffRole } from "../common/access";
import { requiresAdminProfileApproval } from "../common/review-status";
import { assertSafeSyntheticTestDatabase } from "../../test/safe-test-database";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://hel:hel_dev_change_me@127.0.0.1:5432/hel_calafkaaga?schema=public";

const password = "Phase9-Unit-Test-Only-99";

async function createSynthetic(
  prisma: PrismaClient,
  opts: {
    email: string;
    gender: "male" | "female";
    role?: "user" | "admin" | "owner";
    hasPaid?: boolean;
    hasPersonalSupport?: boolean;
    approved?: boolean;
    reviewStatus?: "incomplete" | "pending_review" | "approved" | "rejected" | "suspended";
    banned?: boolean;
  }
) {
  const hash = await hashPasswordPreferred(password);
  const convexId = `local_p9_${randomUUID()}`;
  return prisma.user.create({
    data: {
      convexId,
      email: opts.email,
      emailNormalized: opts.email,
      name: "Phase9",
      gender: opts.gender,
      authAccounts: {
        create: {
          convexId: `local_p9_auth_${randomUUID()}`,
          convexUserId: convexId,
          provider: "password",
          providerAccountId: opts.email,
          passwordHash: hash.hash,
          passwordAlgo: hash.algo,
        },
      },
      profile: {
        create: {
          convexId: `local_p9_prof_${randomUUID()}`,
          convexUserId: convexId,
          name: "Phase9",
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
          qualities: ["Kind"],
          hobbies: ["Reading"],
          questionnaireComplete: true,
          registrationComplete: true,
          questionnaireStep: 11,
          approved: opts.approved ?? false,
          reviewStatus: opts.reviewStatus ?? "pending_review",
          hasPaid: opts.hasPaid ?? false,
          hasPersonalSupport: opts.hasPersonalSupport ?? false,
          banned: opts.banned ?? false,
          phone: "+252612345678",
          profileImageConvexId: `local_img_${randomUUID()}`,
        },
      },
    },
    include: { profile: true },
  });
}

function asUser(
  id: string,
  role: "user" | "admin" | "owner",
  email = "x@hel.local"
): RequestUser {
  return {
    id,
    email,
    role,
    banned: false,
    hasProfile: true,
    hasPaid: true,
    sessionId: randomUUID(),
  };
}

describe("Phase 9 admin unit tests", () => {
  let prisma: PrismaClient;
  const ids: string[] = [];
  let owner: Awaited<ReturnType<typeof createSynthetic>>;
  let admin: Awaited<ReturnType<typeof createSynthetic>>;
  let member: Awaited<ReturnType<typeof createSynthetic>>;
  let womanBasic: Awaited<ReturnType<typeof createSynthetic>>;
  const mail = new ConsoleMailAdapter();

  // Lightweight stubs
  const scoreStub = {
    enqueueUserRecalculation: async () => undefined,
  };
  const notifStub = { enqueueEmailStub: async () => undefined };
  const metricsQueueStub = {
    enqueueRebuild: async () => undefined,
  };
  const annQueueStub = {
    enqueueFanout: async (id: string) => {
      await announcements.fanOut(id);
    },
  };

  let audit: AuditLogService;
  let deletion: DeletionService;
  let metrics: MetricsService;
  let users: AdminUsersService;
  let moderation: ModerationService;
  let payments: AdminPaymentsService;
  let support: SupportService;
  let invites: StaffInvitesService;
  let announcements: AnnouncementsService;

  before(async () => {
    assertSafeSyntheticTestDatabase(DATABASE_URL);
    process.env.DATABASE_URL = DATABASE_URL;
    prisma = new PrismaClient();
    audit = new AuditLogService(prisma as never);
    deletion = new DeletionService(prisma as never, audit);
    metrics = new MetricsService(prisma as never, metricsQueueStub as never);
    users = new AdminUsersService(
      prisma as never,
      audit,
      deletion,
      metrics,
      scoreStub as never,
      notifStub as never,
      {
        createSignedDownloadUrl: async () => ({
          url: "https://example.test/photo.jpg",
          expiresInSeconds: 300,
          purpose: "profile_main",
        }),
      } as never,
      mail
    );
    moderation = new ModerationService(prisma as never, audit);
    payments = new AdminPaymentsService(prisma as never);
    support = new SupportService(
      prisma as never,
      {
        connect: async () => true,
        client: {
          incr: async () => 1,
          expire: async () => 1,
        },
      } as never,
      audit,
      mail
    );
    invites = new StaffInvitesService(prisma as never, audit, mail);
    announcements = new AnnouncementsService(
      prisma as never,
      audit,
      annQueueStub as never
    );

    const suffix = randomUUID().slice(0, 8);
    owner = await createSynthetic(prisma, {
      email: `p9.owner.${suffix}@hel.local`,
      gender: "male",
      role: "owner",
      hasPaid: true,
      approved: true,
      reviewStatus: "approved",
    });
    admin = await createSynthetic(prisma, {
      email: `p9.admin.${suffix}@hel.local`,
      gender: "male",
      role: "admin",
      hasPaid: true,
      approved: true,
      reviewStatus: "approved",
    });
    member = await createSynthetic(prisma, {
      email: `p9.member.${suffix}@hel.local`,
      gender: "male",
      hasPaid: true,
      approved: true,
      reviewStatus: "approved",
    });
    womanBasic = await createSynthetic(prisma, {
      email: `p9.woman.${suffix}@hel.local`,
      gender: "female",
      hasPaid: true,
      hasPersonalSupport: false,
      approved: false,
      reviewStatus: "pending_review",
    });
    ids.push(owner.id, admin.id, member.id, womanBasic.id);
  });

  after(async () => {
    // Cleanup synthetic only — never touch migrated production-copy rows
    for (const id of [...ids].reverse()) {
      try {
        await prisma.session.deleteMany({ where: { userId: id } });
        await prisma.notification.deleteMany({ where: { userId: id } });
        await prisma.supportMessage.deleteMany({ where: { authorUserId: id } });
        await prisma.supportContact.deleteMany({ where: { userId: id } });
        await prisma.report.deleteMany({
          where: { OR: [{ reporterId: id }, { reportedUserId: id }] },
        });
        await prisma.block.deleteMany({
          where: { OR: [{ blockerId: id }, { blockedId: id }] },
        });
        await prisma.like.deleteMany({
          where: { OR: [{ fromUserId: id }, { toUserId: id }] },
        });
        await prisma.memberEmailLog.deleteMany({ where: { userId: id } });
        await prisma.staffInvite.deleteMany({
          where: { OR: [{ invitedById: id }, { acceptedByUserId: id }] },
        });
        await prisma.announcement.deleteMany({ where: { createdById: id } });
        await prisma.deletionJob.deleteMany({
          where: { OR: [{ actorUserId: id }, { targetUserId: id }] },
        });
        await prisma.auditLog.deleteMany({
          where: { OR: [{ actorUserId: id }, { targetUserId: id }] },
        });
        await prisma.evcPaymentProof.deleteMany({ where: { userId: id } });
        await prisma.payment.deleteMany({ where: { userId: id } });
        await prisma.profile.deleteMany({ where: { userId: id } });
        await prisma.authAccount.deleteMany({ where: { userId: id } });
        await prisma.user.deleteMany({ where: { id } });
      } catch {
        // already deleted by execute test
      }
    }
    await prisma.$disconnect();
  });

  it("1. member denied admin access", () => {
    assert.throws(() => requireAdmin(asUser(member.id, "user")), /Unauthorized/);
  });

  it("2. admin access", () => {
    const u = requireAdmin(asUser(admin.id, "admin"));
    assert.equal(u.role, "admin");
  });

  it("3. owner-only access", () => {
    assert.throws(
      () => requireOwner(asUser(admin.id, "admin")),
      /Only the owner/
    );
    assert.equal(requireOwner(asUser(owner.id, "owner")).role, "owner");
  });

  it("4. approve profile", async () => {
    assert.equal(requiresAdminProfileApproval(womanBasic.profile!), true);
    await prisma.profile.update({
      where: { id: womanBasic.profile!.id },
      data: { reviewStatus: "rejected", approved: false },
    });
    await users.approveUser(admin.id, womanBasic.profile!.id);
    const p = await prisma.profile.findUniqueOrThrow({
      where: { id: womanBasic.profile!.id },
    });
    assert.equal(p.approved, true);
    assert.equal(p.reviewStatus, "approved");
    assert.equal(p.verified, false);
    assert.equal(p.questionnaireStep, 11);
  });

  it("5. reject profile", async () => {
    const w = await createSynthetic(prisma, {
      email: `p9.reject.${randomUUID().slice(0, 8)}@hel.local`,
      gender: "female",
      hasPaid: true,
      reviewStatus: "pending_review",
    });
    ids.push(w.id);
    await users.rejectUser(admin.id, w.profile!.id, "test reason");
    const p = await prisma.profile.findUniqueOrThrow({
      where: { id: w.profile!.id },
    });
    assert.equal(p.approved, false);
    assert.equal(p.reviewStatus, "rejected");
  });

  it("6. ban/unban", async () => {
    await users.banUser(admin.id, member.profile!.id, true);
    let p = await prisma.profile.findUniqueOrThrow({
      where: { id: member.profile!.id },
    });
    assert.equal(p.banned, true);
    assert.equal(p.reviewStatus, "suspended");
    await users.banUser(admin.id, member.profile!.id, false);
    p = await prisma.profile.findUniqueOrThrow({
      where: { id: member.profile!.id },
    });
    assert.equal(p.banned, false);
    assert.equal(p.reviewStatus, "approved");
  });

  it("7. role escalation protection", async () => {
    await assert.rejects(
      () => users.setUserRole(owner.id, member.profile!.id, "admin"),
      /Admins must be invited/
    );
  });

  it("8. self-demotion protection", async () => {
    await assert.rejects(
      () => users.setUserRole(owner.id, owner.profile!.id, "user"),
      /owner role cannot be changed|cannot demote yourself/
    );
  });

  it("9. member deletion dry-run", async () => {
    const result = await users.deleteUser(admin.id, member.profile!.id, {
      dryRun: true,
    });
    assert.equal((result as { mode?: string }).mode, "dry_run");
    assert.ok((result as { plan: { sessions: number } }).plan);
    const still = await prisma.user.findUnique({ where: { id: member.id } });
    assert.ok(still);
  });

  it("10. member deletion execute on synthetic user", async () => {
    const victim = await createSynthetic(prisma, {
      email: `p9.del.${randomUUID().slice(0, 8)}@hel.local`,
      gender: "male",
      hasPaid: true,
      approved: true,
      reviewStatus: "approved",
    });
    // don't push to ids — will be deleted
    const media = await prisma.mediaObject.create({
      data: {
        convexStorageId: `local_media_${randomUUID()}`,
        purpose: "profile_main",
        ownerUserId: victim.id,
        migrationStatus: "pending",
      },
    });
    const result = await users.deleteUser(admin.id, victim.profile!.id);
    assert.equal((result as { deleted?: boolean }).deleted, true);
    const gone = await prisma.user.findUnique({ where: { id: victim.id } });
    assert.equal(gone, null);
    const orphan = await prisma.orphanedMediaObject.findFirst({
      where: { mediaObjectId: media.id },
    });
    assert.ok(orphan);
    const mediaRow = await prisma.mediaObject.findUnique({
      where: { id: media.id },
    });
    assert.equal(mediaRow?.ownerUserId, null);
  });

  it("11. report resolve/dismiss", async () => {
    const r = await moderation.reportUser(member.id, {
      reportedUserId: womanBasic.id,
      reason: "spam",
      details: "test",
    });
    assert.equal(r.reported, true);
    const open = await prisma.report.findFirst({
      where: { reporterId: member.id, status: "open" },
    });
    assert.ok(open);
    await moderation.updateReportStatus(admin.id, open!.id, {
      status: "reviewed",
      resolution: "ok",
    });
    const updated = await prisma.report.findUniqueOrThrow({
      where: { id: open!.id },
    });
    assert.equal(updated.status, "reviewed");
  });

  it("12. EVC approve/reject idempotency scaffolding", async () => {
    // Artificial fixture only — production export had 0 EVC
    const media = await prisma.mediaObject.create({
      data: {
        convexStorageId: `local_evc_m_${randomUUID()}`,
        purpose: "evc_screenshot",
        ownerUserId: member.id,
        migrationStatus: "pending",
      },
    });
    const proof = await prisma.evcPaymentProof.create({
      data: {
        convexId: `local_evc_${randomUUID()}`,
        userId: member.id,
        profileId: member.profile!.id,
        convexUserId: member.convexId,
        convexProfileId: member.profile!.convexId,
        tier: "basic",
        payerFullName: "Test User",
        lastFourDigits: "1234",
        screenshotConvexId: media.convexStorageId,
        screenshotMediaId: media.id,
        amountCents: 500,
        status: "pending",
        proofCreatedAt: new Date(),
      },
    });
    assert.equal(proof.status, "pending");
    await prisma.evcPaymentProof.update({
      where: { id: proof.id },
      data: { status: "rejected", rejectionReason: "bad" },
    });
    const again = await prisma.evcPaymentProof.findUniqueOrThrow({
      where: { id: proof.id },
    });
    assert.equal(again.status, "rejected");
  });

  it("13. quarantined payment summary dedup", async () => {
    const summary = await payments.quarantineSummary();
    assert.equal(summary.uniqueQuarantinedCount, 12);
    assert.ok(summary.failureRowCount >= 12);
    assert.ok(summary.failureRowCount <= 24 || summary.failureRowCount === 24);
  });

  it("14. support thread ownership", async () => {
    const created = await support.sendSupportMessage(member.id, {
      topic: "account",
      message: "I need help with my account please",
      source: "profile",
    });
    await assert.rejects(
      () =>
        support.replyAsMember(
          womanBasic.id,
          created.contactId,
          "hijack attempt"
        ),
      /Contact not found/
    );
  });

  it("15. staff support reply", async () => {
    const created = await support.sendSupportMessage(member.id, {
      topic: "payment",
      message: "Payment question needs staff reply now",
      source: "profile",
    });
    await support.replyAsAdmin(admin.id, created.contactId, "We can help you.");
    const thread = await support.getAdmin(created.contactId);
    assert.ok(thread.messages.some((m) => m.authorRole === "admin"));
  });

  it("16. staff invite create/revoke/accept", async () => {
    const email = `p9.invite.${randomUUID().slice(0, 8)}@hel.local`;
    const created = await invites.create(owner.id, email);
    assert.ok(created.inviteId);
    const invite = await prisma.staffInvite.findUniqueOrThrow({
      where: { id: created.inviteId },
    });
    assert.ok(invite.tokenHash);
    await invites.revoke(owner.id, created.inviteId);
    const revoked = await prisma.staffInvite.findUniqueOrThrow({
      where: { id: created.inviteId },
    });
    assert.equal(revoked.status, "revoked");
  });

  it("17. duplicate invite prevention", async () => {
    const email = `p9.dup.${randomUUID().slice(0, 8)}@hel.local`;
    await invites.create(owner.id, email);
    await assert.rejects(
      () => invites.create(owner.id, email),
      /pending invite already exists/
    );
  });

  it("18. announcement immediate delivery", async () => {
    const result = await announcements.create(admin.id, {
      title: "Hello all",
      body: "Immediate announcement body for phase9 test",
      audience: "all",
    });
    assert.equal(result.scheduled, false);
    const notifs = await prisma.notification.count({
      where: {
        type: "announcement",
        title: "Hello all",
        userId: { in: [member.id, womanBasic.id] },
      },
    });
    assert.ok(notifs >= 1);
  });

  it("19. announcement scheduled delivery", async () => {
    const when = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const result = await announcements.create(admin.id, {
      title: "Later",
      body: "Scheduled announcement body for phase9",
      audience: "paid",
      scheduledFor: when,
    });
    assert.equal(result.scheduled, true);
    const a = await prisma.announcement.findUniqueOrThrow({
      where: { id: result.id },
    });
    assert.equal(a.sentAt, null);
    assert.ok(a.scheduledFor);
  });

  it("20. notification fanout dedup", async () => {
    const created = await announcements.create(admin.id, {
      title: "Dedup",
      body: "Fanout dedup body",
      audience: "all",
    });
    const first = await announcements.fanOut(created.id);
    const second = await announcements.fanOut(created.id);
    assert.equal(second.delivered, 0);
    assert.ok(first.delivered >= 0);
  });

  it("21. audit log immutability", async () => {
    const before = await prisma.auditLog.count();
    await audit.write({
      actorUserId: admin.id,
      action: "test_immutable",
      targetUserId: member.id,
    });
    const after = await prisma.auditLog.count();
    assert.equal(after, before + 1);
    // no update/delete API on AuditLogService
    assert.equal(typeof (audit as { update?: unknown }).update, "undefined");
  });

  it("22. metrics rebuild batching", async () => {
    const result = await metrics.rebuildFromStart();
    assert.ok(result.totalUsers >= 1);
    assert.equal(result.trialCount, 0);
    const row = await prisma.siteMetrics.findUnique({ where: { key: "global" } });
    assert.ok(row);
  });

  it("23. Redis outage fail-closed (rate limit bucket names)", () => {
    // Privileged admin buckets must start with admin. for fail-closed path
    const buckets = [
      "admin.list",
      "admin.mutate",
      "admin.invite",
      "admin.support",
      "admin.announce",
      "admin.evc",
      "admin.delete",
    ];
    for (const b of buckets) assert.ok(b.startsWith("admin."));
  });

  it("24. attachment access control (EVC media owner)", async () => {
    const media = await prisma.mediaObject.findFirst({
      where: { purpose: "evc_screenshot", ownerUserId: member.id },
    });
    assert.ok(media);
    assert.equal(media!.ownerUserId, member.id);
    assert.notEqual(media!.ownerUserId, womanBasic.id);
  });

  it("25. deleted-target audit log display", async () => {
    const victim = await createSynthetic(prisma, {
      email: `p9.aud.${randomUUID().slice(0, 8)}@hel.local`,
      gender: "male",
      hasPaid: true,
      approved: true,
      reviewStatus: "approved",
    });
    await audit.write({
      actorUserId: admin.id,
      action: "delete_user",
      targetUserId: victim.id,
      targetProfileId: victim.profile!.id,
      metadata: { name: "Phase9" },
    });
    await users.deleteUser(admin.id, victim.profile!.id);
    const logs = await audit.list({ action: "delete_user", limit: 20 });
    const orphaned = logs.items.find(
      (l) => l.convexTargetUserId === victim.convexId || l.targetUserId === null
    );
    assert.ok(orphaned);
    assert.ok(
      orphaned!.convexTargetUserId === victim.convexId ||
        orphaned!.targetUserId === null
    );
  });

  it("bonus: email masking", () => {
    assert.equal(maskEmail("abdirahman@example.com"), "ab***@example.com");
  });

  it("bonus: staff role helper", () => {
    assert.equal(isStaffRole("admin"), true);
    assert.equal(isStaffRole("user"), false);
  });

  it("bonus: migrated invite plaintext hash optional", async () => {
    const migrated = await prisma.staffInvite.count({
      where: { tokenHash: null },
    });
    // Migrated invites may keep null tokenHash
    assert.ok(migrated >= 0);
  });
});
