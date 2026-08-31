/**
 * Prepare a STAGING database copy for safe login policy.
 *
 * NEVER run against the canonical migrated DB unless
 * ALLOW_CANONICAL_STAGING_MUTATION=1 (discouraged).
 *
 * Required:
 *   STAGING_DATABASE_URL=postgres://...
 *   CONFIRM_STAGING_PREPARE=1
 *
 * Optional:
 *   LOCAL_DATABASE_URL — used only for before-count comparison docs
 *
 * Steps:
 *  1) before counts
 *  2) remove synthetic fixtures (local_*, staging.e2e.*, phase smoke)
 *  3) disable password login for all non-allowlist users (replace hashes)
 *  4) upsert allowlisted staging accounts (member/unpaid/admin/owner)
 *  5) after counts → migration-reports/phase12/staging-db-prepare.json
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import * as argon2 from "argon2";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = path.join(ROOT, "migration-reports", "phase12");
const apiRequire = createRequire(path.join(ROOT, "package.json"));
const { PrismaClient } = apiRequire("@prisma/client") as {
  PrismaClient: new (args?: { datasources?: { db?: { url?: string } } }) => import("@prisma/client").PrismaClient;
};

const ARGON2ID = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

const ALLOWLIST = [
  {
    email: "staging.member@hel.local",
    password: "StagingMember1!",
    role: "user" as const,
    name: "Staging Member",
    convexId: "staging_allow_member",
    hasPaid: true,
  },
  {
    email: "staging.e2e.member@hel.local",
    password: "StagingMember1!",
    role: "user" as const,
    name: "Staging E2E Member",
    convexId: "staging_e2e_member",
    hasPaid: true,
  },
  {
    email: "staging.unpaid@hel.local",
    password: "StagingUnpaid1!",
    role: "user" as const,
    name: "Staging Incomplete",
    convexId: "staging_allow_unpaid",
    hasPaid: false,
  },
  {
    email: "staging.e2e.unpaid@hel.local",
    password: "StagingUnpaid1!",
    role: "user" as const,
    name: "Staging E2E Unpaid",
    convexId: "staging_e2e_unpaid",
    hasPaid: false,
  },
  {
    email: "staging.admin@hel.local",
    password: "StagingAdmin1!",
    role: "admin" as const,
    name: "Staging Admin",
    convexId: "staging_allow_admin",
    hasPaid: true,
  },
  {
    email: "staging.e2e.admin@hel.local",
    password: "StagingAdmin1!",
    role: "admin" as const,
    name: "Staging E2E Admin",
    convexId: "staging_e2e_admin",
    hasPaid: true,
  },
  {
    email: "staging.owner@hel.local",
    password: "StagingOwner1!",
    role: "owner" as const,
    name: "Staging Owner",
    convexId: "staging_allow_owner",
    hasPaid: true,
  },
] as const;

const stagingUrl = process.env.STAGING_DATABASE_URL ?? "";
const confirm = process.env.CONFIRM_STAGING_PREPARE === "1";
const localUrl = process.env.LOCAL_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

if (!stagingUrl) {
  console.error("STAGING_DATABASE_URL is required");
  process.exit(1);
}
if (!confirm) {
  console.error("Set CONFIRM_STAGING_PREPARE=1 to proceed");
  process.exit(1);
}
if (
  localUrl &&
  stagingUrl === localUrl &&
  process.env.ALLOW_CANONICAL_STAGING_MUTATION !== "1"
) {
  console.error(
    "Refusing to mutate canonical DB (STAGING_DATABASE_URL === LOCAL). Copy first, or set ALLOW_CANONICAL_STAGING_MUTATION=1 (discouraged)."
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: { db: { url: stagingUrl } },
});

async function counts() {
  return {
    users: await prisma.user.count(),
    authAccounts: await prisma.authAccount.count(),
    profiles: await prisma.profile.count(),
    payments: await prisma.payment.count(),
    matches: await prisma.match.count().catch(() => -1),
    notifications: await prisma.notification.count().catch(() => -1),
    staffInvites: await prisma.staffInvite.count().catch(() => -1),
    sessions: await prisma.session.count(),
    mediaObjects: await prisma.mediaObject.count().catch(() => -1),
  };
}

async function deleteFixtureUsers() {
  const fixtures = await prisma.user.findMany({
    where: {
      OR: [
        { convexId: { startsWith: "local_" } },
        { convexId: { startsWith: "phase4_" } },
        { emailNormalized: { startsWith: "local_" } },
        { emailNormalized: { startsWith: "phase11." } },
        { emailNormalized: { startsWith: "phase4." } },
        { emailNormalized: { startsWith: "phase11.final." } },
      ],
    },
    select: { id: true },
  });
  const ids = fixtures.map((u) => u.id);
  if (!ids.length) return 0;

  await prisma.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.authAuditEvent.deleteMany({ where: { userId: { in: ids } } });
  await prisma.profileAuditEvent.deleteMany({ where: { userId: { in: ids } } }).catch(() => undefined);
  await prisma.authAccount.deleteMany({ where: { userId: { in: ids } } });
  await prisma.preference.deleteMany({ where: { userId: { in: ids } } }).catch(() => undefined);
  await prisma.profile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

async function disableNonAllowlistLogins() {
  const allowEmails = ALLOWLIST.map((a) => a.email);
  const allowConvex = ALLOWLIST.map((a) => a.convexId);
  const accounts = await prisma.authAccount.findMany({
    where: {
      provider: "password",
      user: {
        NOT: {
          OR: [
            { emailNormalized: { in: [...allowEmails] } },
            { convexId: { in: [...allowConvex] } },
          ],
        },
      },
    },
    select: { id: true },
  });

  let updated = 0;
  for (const a of accounts) {
    // Replace real hashes with a unique random Argon2id of discarded material.
    const discard = randomBytes(32).toString("hex");
    const hash = await argon2.hash(discard, ARGON2ID);
    await prisma.authAccount.update({
      where: { id: a.id },
      data: {
        passwordHash: hash,
        passwordAlgo: "argon2id",
      },
    });
    updated += 1;
  }

  await prisma.user.updateMany({
    where: {
      NOT: {
        OR: [
          { emailNormalized: { in: [...allowEmails] } },
          { convexId: { in: [...allowConvex] } },
        ],
      },
    },
    data: { mustResetPassword: true },
  });

  return updated;
}

async function upsertAllowlist() {
  for (const u of ALLOWLIST) {
    const emailNormalized = u.email.toLowerCase();
    const hash = await argon2.hash(u.password.normalize("NFKC"), ARGON2ID);
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ convexId: u.convexId }, { emailNormalized }],
      },
      include: { profile: true, preferences: true },
    });

    let userId: string;
    if (existing) {
      userId = existing.id;
      await prisma.user.update({
        where: { id: userId },
        data: {
          email: emailNormalized,
          emailNormalized,
          name: u.name,
          mustResetPassword: false,
        },
      });
      if (existing.profile) {
        await prisma.profile.update({
          where: { userId },
          data: {
            role: u.role,
            hasPaid: u.hasPaid,
            approved: u.role !== "user" || u.hasPaid,
            banned: false,
          },
        });
      }
    } else {
      userId = randomUUID();
      await prisma.user.create({
        data: {
          id: userId,
          convexId: u.convexId,
          email: emailNormalized,
          emailNormalized,
          name: u.name,
          mustResetPassword: false,
          profile: {
            create: {
              convexId: `${u.convexId}_profile`,
              role: u.role,
              hasPaid: u.hasPaid,
              approved: u.role !== "user" || u.hasPaid,
              registrationComplete: u.hasPaid,
              questionnaireComplete: u.hasPaid,
              gender: "male",
            },
          },
          preferences: {
            create: {
              convexId: `${u.convexId}_prefs`,
            },
          },
        },
      });
    }

    await prisma.authAccount.deleteMany({
      where: { userId, provider: "password" },
    });
    await prisma.authAccount.create({
      data: {
        convexId: `staging_auth_${randomUUID()}`,
        userId,
        convexUserId: u.convexId,
        provider: "password",
        providerAccountId: emailNormalized,
        passwordHash: hash,
        passwordAlgo: "argon2id",
      },
    });
  }
}

async function main() {
  const before = await counts();
  const removedFixtures = await deleteFixtureUsers();
  const disabledAccounts = await disableNonAllowlistLogins();
  await upsertAllowlist();
  const after = await counts();

  const report = {
    generatedAt: new Date().toISOString(),
    stagingDatabaseHost: stagingUrl.replace(/:[^:@/]+@/, ":***@"),
    before,
    after,
    removedFixtures,
    disabledPasswordAccounts: disabledAccounts,
    allowlistEmails: ALLOWLIST.map((a) => a.email),
    policy:
      "Allowlisted staging aliases only; all other password hashes replaced with discarded Argon2id material; mustResetPassword=true for others",
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, "staging-db-prepare.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  console.log(`Wrote ${out}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
