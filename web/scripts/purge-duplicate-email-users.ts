/**
 * Find accounts that share the same email (case-insensitive) and delete extras.
 * Keeps the strongest account (paid → staff → complete profile → oldest).
 *
 * Usage:
 *   DATABASE_URL=… npx tsx scripts/purge-duplicate-email-users.ts
 *   CONFIRM_PURGE_DUPLICATE_EMAILS=1 DATABASE_URL=… npx tsx scripts/purge-duplicate-email-users.ts --execute
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRequire = createRequire(path.join(ROOT, "package.json"));
const { PrismaClient } = apiRequire("@prisma/client") as {
  PrismaClient: new () => import("@prisma/client").PrismaClient;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

type Row = {
  id: string;
  email: string | null;
  emailNormalized: string | null;
  createdAt: Date;
  profile: {
    hasPaid: boolean;
    questionnaireComplete: boolean;
    registrationComplete: boolean | null;
    banned: boolean;
    role: string;
    name: string | null;
  } | null;
  _count: { authAccounts: number };
};

function score(u: Row): number {
  const p = u.profile;
  let s = 0;
  if (p?.hasPaid) s += 1000;
  if (p?.role === "owner") s += 500;
  if (p?.role === "admin") s += 400;
  if (p?.questionnaireComplete) s += 100;
  if (p?.registrationComplete) s += 50;
  if (u._count.authAccounts > 0) s += 20;
  if (p?.banned) s -= 200;
  return s;
}

function pickKeep(users: Row[]): Row {
  return [...users].sort((a, b) => {
    const d = score(b) - score(a);
    if (d !== 0) return d;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0]!;
}

const execute = process.argv.includes("--execute");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const prisma = new PrismaClient();

async function deleteUsers(ids: string[]) {
  if (!ids.length) return;

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
  await prisma.evcPaymentProof.deleteMany({ where: { userId: { in: ids } } }).catch(() => undefined);
  await prisma.payment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.authAccount.deleteMany({ where: { userId: { in: ids } } });
  await prisma.profile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  const users = await prisma.user.findMany({
    where: {
      OR: [{ email: { not: null } }, { emailNormalized: { not: null } }],
    },
    select: {
      id: true,
      email: true,
      emailNormalized: true,
      createdAt: true,
      profile: {
        select: {
          hasPaid: true,
          questionnaireComplete: true,
          registrationComplete: true,
          banned: true,
          role: true,
          name: true,
        },
      },
      _count: { select: { authAccounts: true } },
    },
  });

  const groups = new Map<string, Row[]>();
  for (const u of users) {
    const key = normalizeEmail(u.emailNormalized || u.email || "");
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(u as Row);
    groups.set(key, list);
  }

  const duplicateGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1);
  const plan = duplicateGroups.map(([email, rows]) => {
    const keep = pickKeep(rows);
    const remove = rows.filter((r) => r.id !== keep.id);
    return {
      email,
      keep: {
        id: keep.id,
        name: keep.profile?.name,
        hasPaid: keep.profile?.hasPaid,
        createdAt: keep.createdAt,
      },
      remove: remove.map((r) => ({
        id: r.id,
        name: r.profile?.name,
        hasPaid: r.profile?.hasPaid,
        email: r.email,
        emailNormalized: r.emailNormalized,
        createdAt: r.createdAt,
      })),
    };
  });

  console.log(
    JSON.stringify(
      {
        duplicateEmailGroups: plan.length,
        accountsToDelete: plan.reduce((n, g) => n + g.remove.length, 0),
        plan,
      },
      null,
      2
    )
  );

  // Backfill normalized email on keepers (even in dry-run we only print).
  if (!execute) {
    console.error(
      "\nDry run only. Re-run with CONFIRM_PURGE_DUPLICATE_EMAILS=1 and --execute to delete extras."
    );
    return;
  }

  if (process.env.CONFIRM_PURGE_DUPLICATE_EMAILS !== "1") {
    console.error("Set CONFIRM_PURGE_DUPLICATE_EMAILS=1 to execute deletion.");
    process.exit(1);
  }

  for (const group of plan) {
    const removeIds = group.remove.map((r) => r.id);
    await deleteUsers(removeIds);
    await prisma.user.update({
      where: { id: group.keep.id },
      data: {
        email: group.email,
        emailNormalized: group.email,
      },
    });
    await prisma.authAccount.updateMany({
      where: { userId: group.keep.id, provider: "password" },
      data: { providerAccountId: group.email },
    });
    console.error(`Kept ${group.keep.id} for ${group.email}; deleted ${removeIds.length}`);
  }

  console.log(JSON.stringify({ ok: true, groupsFixed: plan.length }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
