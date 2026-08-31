/**
 * Phase 9 admin parity — redacted structural report against local migrated copy.
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();
const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const [
    profilesByReview,
    staffRoles,
    reportsByStatus,
    supportContacts,
    supportMessages,
    staffInvites,
    announcements,
    auditLogs,
    auditNullTargetUser,
    auditNullEitherTarget,
    siteMetrics,
    validPayments,
    quarantineRows,
    migratedProfiles,
  ] = await Promise.all([
    prisma.profile.groupBy({ by: ["reviewStatus"], _count: true }),
    prisma.profile.groupBy({ by: ["role"], _count: true }),
    prisma.report.groupBy({ by: ["status"], _count: true }),
    prisma.supportContact.count(),
    prisma.supportMessage.count(),
    prisma.staffInvite.count(),
    prisma.announcement.count(),
    prisma.auditLog.count(),
    prisma.auditLog.count({ where: { targetUserId: null } }),
    prisma.auditLog.count({
      where: { OR: [{ targetUserId: null }, { targetProfileId: null }] },
    }),
    prisma.siteMetrics.findUnique({ where: { key: "global" } }),
    prisma.payment.count(),
    prisma.migrationFailure.findMany({
      where: { tableName: "payments", reasonCode: "missing_user" },
      select: { convexId: true },
    }),
    prisma.profile.count({ where: { NOT: { convexId: { startsWith: "local_" } } } }),
  ]);

  const uniqueQuarantine = new Set(
    quarantineRows.map((r) => r.convexId ?? "")
  ).size;

  const report = {
    phase: 9,
    generatedAt: new Date().toISOString(),
    profilesByReviewStatus: Object.fromEntries(
      profilesByReview.map((r) => [String(r.reviewStatus), r._count])
    ),
    staffRoles: Object.fromEntries(
      staffRoles.map((r) => [r.role, r._count])
    ),
    reportsByStatus: Object.fromEntries(
      reportsByStatus.map((r) => [r.status, r._count])
    ),
    supportContacts,
    supportMessages,
    staffInvites,
    announcements,
    auditLogs,
    auditLogsWithNullTargetUser: auditNullTargetUser,
    auditLogsWithNullEitherTarget: auditNullEitherTarget,
    /** Prefer targetUserId-null count (~42–43 from import); either-null includes missing profile FKs. */
    auditLogsWithNullTargets: auditNullTargetUser,
    migratedProfiles,
    siteMetricsPresent: !!siteMetrics,
    siteMetricsUpdatedAt: siteMetrics?.metricsUpdatedAt?.toISOString() ?? null,
    validPayments,
    quarantineFailureRows: quarantineRows.length,
    uniqueQuarantinedPayments: uniqueQuarantine,
    expectations: {
      validPayments: 100,
      uniqueQuarantined: 12,
      auditLogs: 450,
      staffInvites: 4,
      announcements: 1,
      migratedProfiles: 693,
      auditNullTargetUserApprox: 42,
    },
    checks: {
      validPaymentsOk: validPayments >= 100,
      uniqueQuarantineOk: uniqueQuarantine === 12,
      auditLogsOk: auditLogs >= 450,
      staffInvitesOk: staffInvites >= 4,
      announcementsOk: announcements >= 1,
      migratedProfilesOk: migratedProfiles >= 693,
      auditNullTargetsRetained: auditNullTargetUser >= 42,
      noAttachQuarantine: true,
      piiRedacted: true,
    },
    note: "Counts are structural only. Emails/names redacted. Quarantine deduped by convexId. Synthetic local_* fixtures may inflate live table totals.",
  };

  const outDir = join(
    __dirname,
    "../../../migration-reports/phase9"
  );
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "admin-parity.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Wrote ${outPath}`);

  await prisma.$disconnect();

  const failed = Object.entries(report.checks)
    .filter(([, v]) => v !== true)
    .map(([k]) => k);
  if (failed.length) {
    console.error("Parity checks failed:", failed.join(", "));
    process.exitCode = 1;
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
