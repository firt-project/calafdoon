/**
 * Find / fix / delete member accounts whose email domain is a known typo
 * (e.g. @gmail.come, @gmail.con) — invalid for Play Console & often unreachable.
 *
 * Usage (dry-run):
 *   DATABASE_URL=… npx tsx scripts/purge-typo-email-users.ts
 *
 * Fix emails in place (recommended if they are real people who mistyped):
 *   CONFIRM_FIX_TYPO_EMAILS=1 DATABASE_URL=… npx tsx scripts/purge-typo-email-users.ts --fix
 *
 * Delete the users entirely:
 *   CONFIRM_PURGE_TYPO_EMAILS=1 DATABASE_URL=… npx tsx scripts/purge-typo-email-users.ts --delete
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectEmailDomainTypo } from "../apps/api/src/admin/play-tester-email";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRequire = createRequire(path.join(ROOT, "package.json"));
const { PrismaClient } = apiRequire("@prisma/client") as {
  PrismaClient: new () => import("@prisma/client").PrismaClient;
};

const doFix = process.argv.includes("--fix");
const doDelete = process.argv.includes("--delete");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (doFix && doDelete) {
  console.error("Use only one of --fix or --delete");
  process.exit(1);
}
if (doFix && process.env.CONFIRM_FIX_TYPO_EMAILS !== "1") {
  console.error("Set CONFIRM_FIX_TYPO_EMAILS=1 to apply email fixes");
  process.exit(1);
}
if (doDelete && process.env.CONFIRM_PURGE_TYPO_EMAILS !== "1") {
  console.error("Set CONFIRM_PURGE_TYPO_EMAILS=1 to delete typo-email users");
  process.exit(1);
}

const prisma = new PrismaClient();

async function deleteUsers(ids: string[]) {
  if (!ids.length) return;

  await prisma.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.emailVerificationToken
    .deleteMany({ where: { userId: { in: ids } } })
    .catch(() => undefined);
  await prisma.authAuditEvent.deleteMany({ where: { userId: { in: ids } } });
  await prisma.profileAuditEvent
    .deleteMany({ where: { userId: { in: ids } } })
    .catch(() => undefined);
  await prisma.accountAppeal
    .deleteMany({ where: { userId: { in: ids } } })
    .catch(() => undefined);
  await prisma.accountStatusHistory
    .deleteMany({ where: { userId: { in: ids } } })
    .catch(() => undefined);
  await prisma.photoReveal
    .deleteMany({
      where: {
        OR: [{ viewerUserId: { in: ids } }, { ownerUserId: { in: ids } }],
      },
    })
    .catch(() => undefined);
  await prisma.auditLog
    .deleteMany({ where: { actorUserId: { in: ids } } })
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
    where: { OR: [{ fromUserId: { in: ids } }, { toUserId: { in: ids } }] },
  });
  await prisma.compatibilityScore.deleteMany({
    where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] },
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
  await prisma.evcPaymentProof
    .deleteMany({ where: { userId: { in: ids } } })
    .catch(() => undefined);
  await prisma.payment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.authAccount.deleteMany({ where: { userId: { in: ids } } });
  await prisma.profile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      OR: [{ email: { not: null } }, { emailNormalized: { not: null } }],
    },
    select: {
      id: true,
      email: true,
      emailNormalized: true,
      profile: {
        select: {
          id: true,
          name: true,
          role: true,
          hasPaid: true,
          banned: true,
        },
      },
    },
  });

  const hits: Array<{
    userId: string;
    profileId: string | null;
    name: string | null;
    role: string | null;
    hasPaid: boolean;
    original: string;
    fixed: string;
  }> = [];

  for (const u of users) {
    const raw = (u.emailNormalized || u.email || "").trim();
    if (!raw) continue;
    const typo = detectEmailDomainTypo(raw);
    if (!typo) continue;
    if (u.profile?.role === "admin" || u.profile?.role === "owner") continue;
    hits.push({
      userId: u.id,
      profileId: u.profile?.id ?? null,
      name: u.profile?.name ?? null,
      role: u.profile?.role ?? null,
      hasPaid: u.profile?.hasPaid === true,
      original: typo.original,
      fixed: typo.fixed,
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: doDelete ? "delete" : doFix ? "fix" : "dry-run",
        count: hits.length,
        paidCount: hits.filter((h) => h.hasPaid).length,
        samples: hits.slice(0, 30),
      },
      null,
      2
    )
  );

  if (!doFix && !doDelete) {
    console.log(
      "\nDry-run only. To fix emails: CONFIRM_FIX_TYPO_EMAILS=1 … --fix\nTo delete users: CONFIRM_PURGE_TYPO_EMAILS=1 … --delete"
    );
    return;
  }

  if (doFix) {
    let fixed = 0;
    let conflicts = 0;
    for (const h of hits) {
      const taken = await prisma.user.findFirst({
        where: {
          id: { not: h.userId },
          OR: [
            { emailNormalized: h.fixed },
            { email: { equals: h.fixed, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      if (taken) {
        conflicts += 1;
        console.warn(`skip conflict ${h.original} → ${h.fixed} (user ${taken.id})`);
        continue;
      }
      await prisma.user.update({
        where: { id: h.userId },
        data: {
          email: h.fixed,
          emailNormalized: h.fixed,
        },
      });
      await prisma.authAccount.updateMany({
        where: {
          userId: h.userId,
          provider: "password",
          providerAccountId: {
            equals: h.original,
            mode: "insensitive",
          },
        },
        data: { providerAccountId: h.fixed },
      });
      fixed += 1;
    }
    console.log(JSON.stringify({ fixed, conflicts }, null, 2));
    return;
  }

  // --delete
  const ids = hits.map((h) => h.userId);
  const batchSize = 25;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    await deleteUsers(batch);
    console.log(`deleted ${Math.min(i + batchSize, ids.length)}/${ids.length}`);
  }
  console.log(JSON.stringify({ deleted: ids.length }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
