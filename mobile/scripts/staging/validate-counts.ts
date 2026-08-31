/**
 * Report row counts for local/staging Postgres.
 * Writes migration-reports/phase11/staging-counts.json
 *
 * Usage: DATABASE_URL=… npx tsx scripts/staging/validate-counts.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = path.join(ROOT, "migration-reports", "phase11");
const OUT = path.join(OUT_DIR, "staging-counts.json");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  const report = {
    generatedAt: new Date().toISOString(),
    ok: false,
    error: "DATABASE_URL is required",
    counts: {},
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.error(report.error);
  process.exit(1);
}

const apiRequire = createRequire(path.join(ROOT, "package.json"));
const { PrismaClient } = apiRequire("@prisma/client") as {
  PrismaClient: new (args?: { datasources?: { db?: { url: string } } }) => {
    user: { count: (args?: unknown) => Promise<number> };
    authAccount: { count: () => Promise<number> };
    profile: { count: () => Promise<number> };
    session: { count: () => Promise<number> };
    payment: { count: () => Promise<number> };
    match: { count: () => Promise<number> };
    notification: { count: () => Promise<number> };
    staffInvite: { count: () => Promise<number> };
    auditLog: { count: () => Promise<number> };
    evcPaymentProof: { count: () => Promise<number> };
    $disconnect: () => Promise<void>;
  };
};

const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
});

async function main() {
  const counts: Record<string, number> = {};
  const tables: Array<[string, () => Promise<number>]> = [
    ["users", () => prisma.user.count()],
    ["authAccounts", () => prisma.authAccount.count()],
    ["profiles", () => prisma.profile.count()],
    ["sessions", () => prisma.session.count()],
    ["payments", () => prisma.payment.count()],
    ["matches", () => prisma.match.count()],
    ["notifications", () => prisma.notification.count()],
    ["staffInvites", () => prisma.staffInvite.count()],
    ["auditLogs", () => prisma.auditLog.count()],
    ["evcPaymentProofs", () => prisma.evcPaymentProof.count()],
  ];

  let ok = true;
  let error: string | undefined;
  try {
    for (const [name, fn] of tables) {
      counts[name] = await fn();
    }
  } catch (e) {
    ok = false;
    error = e instanceof Error ? e.message : String(e);
  }

  let stagingE2eUsers = 0;
  if (ok) {
    try {
      stagingE2eUsers = await prisma.user.count({
        where: {
          OR: [
            { convexId: { startsWith: "staging_e2e_" } },
            { emailNormalized: { startsWith: "staging.e2e." } },
          ],
        },
      });
    } catch {
      /* ignore */
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    ok,
    error,
    databaseHost: (() => {
      try {
        return new URL(databaseUrl).host;
      } catch {
        return "unknown";
      }
    })(),
    counts,
    stagingE2eUsers,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(`Wrote ${OUT}`);
  console.log(JSON.stringify(report.counts, null, 2));
  if (!ok) {
    console.error(error);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
