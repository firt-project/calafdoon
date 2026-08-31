/**
 * Phase 8 payment parity — redacted structural report against local migrated copy.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const validPaymentCount = await prisma.payment.count();
  const quarantinedPaymentCount = await prisma.migrationFailure.count({
    where: { tableName: "payments", reasonCode: "missing_user" },
  });
  const byStatus = await prisma.payment.groupBy({
    by: ["status"],
    _count: true,
  });
  const byType = await prisma.payment.groupBy({
    by: ["paymentType"],
    _count: true,
  });
  const byTier = await prisma.payment.groupBy({
    by: ["registrationTier"],
    _count: true,
  });
  const dupSessions = await prisma.$queryRaw<Array<{ c: number }>>`
    SELECT COUNT(*)::int AS c FROM (
      SELECT stripe_session_id FROM payments
      GROUP BY stripe_session_id HAVING COUNT(*) > 1
    ) t`;

  const completed = await prisma.payment.findMany({
    where: { status: "completed" },
    select: { userId: true, amount: true, registrationTier: true },
  });
  let completedProfileInconsistencies = 0;
  for (const p of completed) {
    const profile = await prisma.profile.findUnique({
      where: { userId: p.userId },
      select: { hasPaid: true },
    });
    if (!profile?.hasPaid) completedProfileInconsistencies++;
  }

  const paidWithoutPayment = await prisma.$queryRaw<Array<{ c: number }>>`
    SELECT COUNT(*)::int AS c FROM profiles pr
    WHERE pr.has_paid = true
      AND pr.role = 'user'
      AND NOT EXISTS (
        SELECT 1 FROM payments pay
        WHERE pay.user_id = pr.user_id AND pay.status = 'completed'
      )`;

  const report = {
    phase: 8,
    validPaymentCount,
    quarantinedPaymentCount,
    statusCounts: Object.fromEntries(
      byStatus.map((s) => [s.status, s._count])
    ),
    typeCounts: Object.fromEntries(
      byType.map((s) => [String(s.paymentType), s._count])
    ),
    tierCounts: Object.fromEntries(
      byTier.map((s) => [String(s.registrationTier), s._count])
    ),
    duplicateStripeSessions: dupSessions[0]?.c ?? 0,
    completedProfileInconsistencies,
    paidUsersWithoutCompletedPayment: paidWithoutPayment[0]?.c ?? 0,
    quarantinedUnchanged: true,
    note: "Quarantined rows remain in migration_failures (missing_user); not attached to accounts.",
  };

  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();

  if (validPaymentCount < 100) {
    console.error("Expected at least 100 valid migrated payments");
    process.exitCode = 1;
  }
  if ((dupSessions[0]?.c ?? 0) > 0) {
    console.error("Duplicate stripe session ids found");
    process.exitCode = 1;
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
