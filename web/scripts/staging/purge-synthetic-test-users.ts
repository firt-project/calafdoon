/**
 * Remove synthetic test/fixture users (@hel.local, local_* convex ids, phase smoke emails).
 *
 * Safe for production: real migrated members do not use @hel.local or local_* ids.
 *
 * Usage:
 *   DATABASE_URL=… npx tsx scripts/staging/purge-synthetic-test-users.ts          # dry-run
 *   CONFIRM_PURGE_SYNTHETIC=1 DATABASE_URL=… npx tsx … --execute
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const apiRequire = createRequire(path.join(ROOT, "package.json"));
const { PrismaClient } = apiRequire("@prisma/client") as {
  PrismaClient: new () => import("@prisma/client").PrismaClient;
};

const execute = process.argv.includes("--execute");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

/** Staging allowlist — kept when --keep-staging-allowlist is passed. */
const STAGING_ALLOWLIST = new Set([
  "staging.member@hel.local",
  "staging.e2e.member@hel.local",
  "staging.unpaid@hel.local",
  "staging.e2e.unpaid@hel.local",
  "staging.admin@hel.local",
  "staging.e2e.admin@hel.local",
  "staging.owner@hel.local",
  "staging.e2e.owner@hel.local",
  "staging.owner@hel.local",
]);

const keepStagingAllowlist = process.argv.includes("--keep-staging-allowlist");

function syntheticUserWhere() {
  // Never match broad local_* — Nest assigns local_reg_* to real members.
  const emailPatterns = [
    { emailNormalized: { endsWith: "@hel.local" } },
    { emailNormalized: { startsWith: "staging.e2e." } },
    { emailNormalized: { startsWith: "phase4." } },
    { emailNormalized: { startsWith: "phase5." } },
    { emailNormalized: { startsWith: "phase6." } },
    { emailNormalized: { startsWith: "phase7." } },
    { emailNormalized: { startsWith: "phase8." } },
    { emailNormalized: { startsWith: "phase11." } },
    { emailNormalized: { startsWith: "p9." } },
    { emailNormalized: { startsWith: "p9e." } },
  ];
  const convexPatterns = [
    { convexId: { startsWith: "local_p9_" } },
    { convexId: { startsWith: "local_p8_" } },
    { convexId: { startsWith: "local_m6_" } },
    { convexId: { startsWith: "local_m7_" } },
    { convexId: { startsWith: "staging_e2e_" } },
    { convexId: { startsWith: "phase4_" } },
  ];
  return { OR: [...emailPatterns, ...convexPatterns] };
}

const prisma = new PrismaClient();

async function main() {
  const candidates = await prisma.user.findMany({
    where: syntheticUserWhere(),
    select: {
      id: true,
      email: true,
      emailNormalized: true,
      convexId: true,
      createdAt: true,
      profile: { select: { id: true, name: true, city: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const toDelete = keepStagingAllowlist
    ? candidates.filter((u) => !STAGING_ALLOWLIST.has(u.emailNormalized))
    : candidates;

  const phase9 = toDelete.filter(
    (u) =>
      u.profile?.name === "Phase9" ||
      u.profile?.name === "Phase9E2E" ||
      u.emailNormalized.includes("p9.member.")
  );

  console.log(
    JSON.stringify(
      {
        mode: execute ? "execute" : "dry_run",
        totalCandidates: candidates.length,
        toDelete: toDelete.length,
        phase9Like: phase9.length,
        sample: toDelete.slice(0, 12).map((u) => ({
          id: u.id,
          email: u.email,
          name: u.profile?.name,
          city: u.profile?.city,
          phone: u.profile?.phone,
          convexId: u.convexId,
          createdAt: u.createdAt,
        })),
      },
      null,
      2
    )
  );

  if (!execute) {
    console.error(
      "\nDry run only. Re-run with CONFIRM_PURGE_SYNTHETIC=1 and --execute to delete."
    );
    return;
  }

  if (process.env.CONFIRM_PURGE_SYNTHETIC !== "1") {
    console.error("Set CONFIRM_PURGE_SYNTHETIC=1 to execute deletion.");
    process.exit(1);
  }

  const ids = toDelete.map((u) => u.id);
  if (!ids.length) {
    console.log("Nothing to delete.");
    return;
  }

  await prisma.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.authAuditEvent.deleteMany({ where: { userId: { in: ids } } });
  await prisma.profileAuditEvent
    .deleteMany({ where: { userId: { in: ids } } })
    .catch(() => undefined);
  await prisma.userUpload.deleteMany({ where: { userId: { in: ids } } });
  await prisma.mediaObject.updateMany({
    where: { ownerUserId: { in: ids } },
    data: { ownerUserId: null },
  });
  await prisma.profile.updateMany({
    where: { userId: { in: ids } },
    data: { profileImageMediaId: null, profileImageConvexId: null },
  });
  await prisma.preference.deleteMany({ where: { userId: { in: ids } } }).catch(() => undefined);
  await prisma.like.deleteMany({
    where: {
      OR: [{ fromUserId: { in: ids } }, { toUserId: { in: ids } }],
    },
  });
  await prisma.compatibilityScore.deleteMany({
    where: {
      OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }],
    },
  });

  const matches = await prisma.match.findMany({
    where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] },
    select: { id: true },
  });
  if (matches.length) {
    const matchIds = matches.map((m) => m.id);
    const conversations = await prisma.conversation.findMany({
      where: { matchId: { in: matchIds } },
      select: { id: true },
    });
    if (conversations.length) {
      const conversationIds = conversations.map((c) => c.id);
      await prisma.message.deleteMany({
        where: { conversationId: { in: conversationIds } },
      });
      await prisma.conversation.deleteMany({
        where: { id: { in: conversationIds } },
      });
    }
    await prisma.payment.updateMany({
      where: { matchId: { in: matchIds } },
      data: { matchId: null },
    });
    await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  }

  await prisma.message.deleteMany({ where: { senderId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.supportMessage.updateMany({
    where: { authorUserId: { in: ids } },
    data: { authorUserId: null },
  });
  await prisma.supportContact.updateMany({
    where: { userId: { in: ids } },
    data: { userId: null, reviewedById: null },
  });
  await prisma.supportContact.updateMany({
    where: { reviewedById: { in: ids } },
    data: { reviewedById: null },
  });
  await prisma.report.deleteMany({
    where: {
      OR: [{ reporterId: { in: ids } }, { reportedUserId: { in: ids } }],
    },
  });
  await prisma.report.updateMany({
    where: { reviewedById: { in: ids } },
    data: { reviewedById: null },
  });
  await prisma.block.deleteMany({
    where: {
      OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }],
    },
  });
  await prisma.memberEmailLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.staffInvite.updateMany({
    where: { acceptedByUserId: { in: ids } },
    data: { acceptedByUserId: null },
  });
  await prisma.staffInvite.deleteMany({
    where: {
      OR: [{ invitedById: { in: ids } }, { acceptedByUserId: { in: ids } }],
    },
  });
  await prisma.announcement.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.deletionJob.deleteMany({
    where: {
      OR: [{ actorUserId: { in: ids } }, { targetUserId: { in: ids } }],
    },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [{ actorUserId: { in: ids } }, { targetUserId: { in: ids } }],
    },
  });
  await prisma.evcPaymentProof.deleteMany({ where: { userId: { in: ids } } });
  await prisma.evcPaymentProof.updateMany({
    where: { reviewedById: { in: ids } },
    data: { reviewedById: null },
  });
  await prisma.payment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.authAccount.deleteMany({ where: { userId: { in: ids } } });
  await prisma.profile.deleteMany({ where: { userId: { in: ids } } });
  const result = await prisma.user.deleteMany({ where: { id: { in: ids } } });

  console.log(`Deleted ${result.count} synthetic users.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
