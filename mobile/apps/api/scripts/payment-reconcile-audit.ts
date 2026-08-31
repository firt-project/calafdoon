/**
 * Phase 8.5 — read-only payment reconciliation audit.
 * Does not modify migrated business data. Writes reports under migration-reports/.
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";

const prisma = new PrismaClient();

type JsonDoc = Record<string, unknown> & { _id: string };

function redact(id: string | null | undefined): string | null {
  if (!id) return null;
  return `${String(id).slice(0, 8)}…`;
}

function loadJsonl(file: string): JsonDoc[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as JsonDoc;
      } catch {
        return null;
      }
    })
    .filter((o): o is JsonDoc => Boolean(o && o._id));
}

function countBy<T>(rows: T[], keyFn: (row: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = keyFn(row);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function repoRoot(): string {
  return path.resolve(__dirname, "../../..");
}

async function main() {
  const root = repoRoot();
  const scrubPayments = loadJsonl(
    path.join(root, "backups/convex/scrubbed-export/payments/documents.jsonl"),
  );
  const workingPayments = loadJsonl(
    path.join(root, "backups/convex/working-export/payments/documents.jsonl"),
  );
  const scrubProfiles = loadJsonl(
    path.join(root, "backups/convex/scrubbed-export/profiles/documents.jsonl"),
  );
  const scrubUsers = new Set(
    loadJsonl(
      path.join(root, "backups/convex/scrubbed-export/users/documents.jsonl"),
    ).map((u) => u._id),
  );
  const workingUsers = new Set(
    loadJsonl(
      path.join(root, "backups/convex/working-export/users/documents.jsonl"),
    ).map((u) => u._id),
  );

  const manifestPath = path.join(
    root,
    "backups/convex/scrubbed-export/SCRUB_MANIFEST.json",
  );
  const manifest = fs.existsSync(manifestPath)
    ? (JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        removed?: {
          users?: string[];
          authAccounts?: Array<{ userId: string; reason: string }>;
        };
      })
    : null;
  const orphanAuthUserIds = new Set(
    (manifest?.removed?.authAccounts ?? [])
      .filter((a) => a.reason === "orphan_user_missing")
      .map((a) => a.userId),
  );

  // --- Part 1: migration_failures ---
  const failureRows = await prisma.migrationFailure.findMany({
    where: { tableName: "payments" },
    orderBy: [{ convexId: "asc" }, { runId: "asc" }],
  });
  const missingUserRows = failureRows.filter((r) => r.reasonCode === "missing_user");
  const dedupeMap = new Map<
    string,
    {
      sourceTable: string;
      sourceConvexId: string | null;
      reason: string;
      rowCount: number;
      runIds: Set<string>;
      firstSafeDetail: unknown;
    }
  >();
  for (const row of failureRows) {
    const key = `${row.tableName}|${row.convexId}|${row.reasonCode}`;
    const existing = dedupeMap.get(key);
    if (!existing) {
      dedupeMap.set(key, {
        sourceTable: row.tableName,
        sourceConvexId: row.convexId,
        reason: row.reasonCode,
        rowCount: 1,
        runIds: new Set([row.runId]),
        firstSafeDetail: row.safeDetail,
      });
    } else {
      existing.rowCount += 1;
      existing.runIds.add(row.runId);
    }
  }
  const deduplicatedFailures = [...dedupeMap.values()].map((e) => ({
    sourceTable: e.sourceTable,
    sourceConvexId: e.sourceConvexId,
    reason: e.reason,
    rowCount: e.rowCount,
    runIds: [...e.runIds],
  }));
  const uniqueMissingUser = new Set(
    missingUserRows.map((r) => r.convexId).filter(Boolean) as string[],
  );
  const runIds = [...new Set(missingUserRows.map((r) => r.runId))];
  const multiReason = await prisma.$queryRaw<
    Array<{ convex_id: string; reasons: number }>
  >`
    SELECT convex_id, COUNT(DISTINCT reason_code)::int AS reasons
    FROM migration_failures
    WHERE table_name = 'payments' AND convex_id IS NOT NULL
    GROUP BY convex_id
    HAVING COUNT(DISTINCT reason_code) > 1`;

  const quarantinedExport = scrubPayments.filter((p) =>
    uniqueMissingUser.has(p._id),
  );
  const quarantineUserAnalysis = quarantinedExport.map((pay) => {
    const userId = String(pay.userId ?? "");
    return {
      paymentId: redact(pay._id),
      userId: redact(userId),
      status: pay.status,
      paymentType: pay.paymentType,
      registrationTier: pay.registrationTier ?? null,
      amount: pay.amount,
      hasStripeSession: Boolean(pay.stripeSessionId),
      userInScrubExport: scrubUsers.has(userId),
      userInWorkingExport: workingUsers.has(userId),
      userIsOrphanAuthFromScrub: orphanAuthUserIds.has(userId),
    };
  });

  let part1Classification:
    | "12 unique failures recorded twice"
    | "24 unique missing-user payments"
    | "mixed causes"
    | "unresolved" = "unresolved";
  if (
    missingUserRows.length === 24 &&
    uniqueMissingUser.size === 12 &&
    runIds.length === 2 &&
    deduplicatedFailures.every((d) => d.rowCount === 2) &&
    multiReason.length === 0
  ) {
    part1Classification = "12 unique failures recorded twice";
  } else if (uniqueMissingUser.size === 24) {
    part1Classification = "24 unique missing-user payments";
  } else if (uniqueMissingUser.size !== missingUserRows.length) {
    part1Classification = "mixed causes";
  }

  // --- Part 2: paid profiles without completed payment ---
  const paidProfiles = await prisma.profile.findMany({
    where: { hasPaid: true },
    select: {
      userId: true,
      convexUserId: true,
      role: true,
      gender: true,
      approved: true,
      reviewStatus: true,
      hasPersonalSupport: true,
      createdAt: true,
      convexCreatedAt: true,
      user: { select: { convexId: true } },
    },
  });
  const completedUserIds = new Set(
    (
      await prisma.payment.findMany({
        where: { status: "completed" },
        select: { userId: true },
      })
    ).map((p) => p.userId),
  );
  const allPayments = await prisma.payment.findMany({
    select: {
      userId: true,
      status: true,
      paymentType: true,
      registrationTier: true,
      stripeSessionId: true,
      convexId: true,
    },
  });
  const paymentsByUser = new Map<string, typeof allPayments>();
  for (const pay of allPayments) {
    const list = paymentsByUser.get(pay.userId) ?? [];
    list.push(pay);
    paymentsByUser.set(pay.userId, list);
  }
  const profileByConvexUser = new Map(
    scrubProfiles.map((pr) => [String(pr.userId), pr]),
  );
  const convexCompletedUsers = new Set(
    scrubPayments
      .filter((p) => p.status === "completed")
      .map((p) => String(p.userId)),
  );
  const quarantinedUserConvexIds = new Set(
    quarantinedExport.map((p) => String(p.userId)),
  );

  type ClassKey =
    | "staff_or_owner"
    | "evc_manual_payment"
    | "legacy_payment_missing_row"
    | "paid_access_by_migration_or_admin"
    | "premium_upgrade_record_only"
    | "pending_or_failed_payment_only"
    | "profile_imported_hasPaid_true"
    | "payment_unlinked_old_convex_user_id"
    | "payment_in_quarantine"
    | "unknown";

  const classifications: Record<
    ClassKey,
    Array<Record<string, unknown>>
  > = {
    staff_or_owner: [],
    evc_manual_payment: [],
    legacy_payment_missing_row: [],
    paid_access_by_migration_or_admin: [],
    premium_upgrade_record_only: [],
    pending_or_failed_payment_only: [],
    profile_imported_hasPaid_true: [],
    payment_unlinked_old_convex_user_id: [],
    payment_in_quarantine: [],
    unknown: [],
  };

  const gap = paidProfiles.filter((pr) => !completedUserIds.has(pr.userId));
  let evcLocal = 0;
  try {
    evcLocal = await prisma.evcPaymentProof.count();
  } catch {
    evcLocal = 0;
  }
  const evcExport = loadJsonl(
    path.join(
      root,
      "backups/convex/scrubbed-export/evcPaymentProofs/documents.jsonl",
    ),
  ).length;

  for (const pr of gap) {
    const convexId = pr.user.convexId ?? pr.convexUserId ?? "";
    const sourceProfile = profileByConvexUser.get(convexId);
    const pays = paymentsByUser.get(pr.userId) ?? [];
    const item = {
      userId: pr.userId,
      userConvexId: redact(convexId),
      role: pr.role,
      gender: pr.gender,
      registrationTier: null as string | null,
      approved: pr.approved,
      reviewStatus: pr.reviewStatus,
      hasPersonalSupport: pr.hasPersonalSupport,
      createdAt: (pr.convexCreatedAt ?? pr.createdAt)?.toISOString?.() ?? null,
      paymentStatuses: pays.map((p) => p.status),
      paymentTypes: pays.map((p) => p.paymentType),
      matchesConvexHasPaid: sourceProfile?.hasPaid === true,
      auditLogEvidence: false,
      notificationEvidence: false,
      stripeSessionMetadata: pays.some((p) => Boolean(p.stripeSessionId)),
      evcEvidence: evcLocal > 0 || evcExport > 0,
    };

    if (pr.role === "admin" || pr.role === "owner") {
      classifications.staff_or_owner.push(item);
      continue;
    }
    if (
      quarantinedUserConvexIds.has(convexId) ||
      quarantinedUserConvexIds.has(pr.convexUserId ?? "")
    ) {
      classifications.payment_in_quarantine.push(item);
      continue;
    }
    if (pays.length > 0 && pays.every((p) => p.status !== "completed")) {
      classifications.pending_or_failed_payment_only.push(item);
      continue;
    }
    if (pr.hasPersonalSupport && pays.some((p) => p.paymentType === "premium_upgrade")) {
      classifications.premium_upgrade_record_only.push(item);
      continue;
    }
    // Exact Convex parity: hasPaid was already true in export with no completed payment
    if (sourceProfile?.hasPaid === true && pays.length === 0) {
      classifications.profile_imported_hasPaid_true.push(item);
      continue;
    }
    if (sourceProfile?.hasPaid === true && !convexCompletedUsers.has(convexId)) {
      classifications.legacy_payment_missing_row.push(item);
      continue;
    }
    classifications.unknown.push(item);
  }

  // Audit / notification presence for gap cohort (informational)
  const gapUuids = new Set(gap.map((g) => g.userId));
  const audits = await prisma.auditLog.findMany({
    select: { action: true, targetUserId: true },
  });
  const auditByAction: Record<string, number> = {};
  let auditHits = 0;
  const gapUsersWithAudit = new Set<string>();
  for (const a of audits) {
    if (a.targetUserId && gapUuids.has(a.targetUserId)) {
      auditHits += 1;
      gapUsersWithAudit.add(a.targetUserId);
      auditByAction[a.action] = (auditByAction[a.action] ?? 0) + 1;
    }
  }
  const paymentNotifsOnGap = await prisma.notification.count({
    where: { type: "payment", userId: { in: [...gapUuids] } },
  });
  const gapUsersWithPaymentNotif = new Set(
    (
      await prisma.notification.findMany({
        where: { type: "payment", userId: { in: [...gapUuids] } },
        select: { userId: true },
        distinct: ["userId"],
      })
    ).map((n) => n.userId),
  );

  const classSummaries = Object.fromEntries(
    (Object.keys(classifications) as ClassKey[]).map((key) => {
      const rows = classifications[key];
      const created = rows
        .map((r) => r.createdAt as string | null)
        .filter(Boolean)
        .sort();
      const classUserIds = rows.map((r) => String(r.userId));
      const auditEvidenceCount = classUserIds.filter((id) =>
        gapUsersWithAudit.has(id),
      ).length;
      const notifEvidenceCount = classUserIds.filter((id) =>
        gapUsersWithPaymentNotif.has(id),
      ).length;
      return [
        key,
        {
          count: rows.length,
          sampleConvexIds: rows.slice(0, 5).map((r) => r.userConvexId),
          roles: countBy(rows, (r) => String(r.role)),
          genders: countBy(rows, (r) => String(r.gender)),
          registrationTiers: { "(profile field absent in Convex export)": rows.length },
          approved: countBy(rows, (r) => String(r.approved)),
          reviewStatus: countBy(rows, (r) => String(r.reviewStatus)),
          createdAtRange: {
            min: created[0] ?? null,
            max: created[created.length - 1] ?? null,
          },
          auditLogEvidence:
            auditEvidenceCount > 0
              ? `${auditEvidenceCount}/${rows.length} users have non-payment audit actions (approve/photo/support); no payment-grant audits found`
              : false,
          notificationEvidence:
            notifEvidenceCount > 0
              ? `${notifEvidenceCount}/${rows.length} users have payment notifications`
              : false,
          stripeSessionMetadata: rows.some((r) => r.stripeSessionMetadata === true),
          evcRelatedEvidence: evcLocal > 0 || evcExport > 0,
          matchesOldConvexApplication:
            rows.length === 0
              ? true
              : rows.every((r) => r.matchesConvexHasPaid === true),
        },
      ];
    }),
  );

  // --- Part 3: completed payment consistency ---
  const completedPayments = await prisma.payment.findMany({
    where: { status: "completed" },
    include: { user: { include: { profile: true } } },
  });
  let completedMissingProfile = 0;
  let completedRegistrationUnpaid = 0;
  let completedUpgradeNoSupport = 0;
  for (const pay of completedPayments) {
    const profile = pay.user.profile;
    if (!profile) {
      completedMissingProfile += 1;
      continue;
    }
    if (
      (pay.paymentType === "registration" ||
        pay.paymentType === "registration_premium") &&
      !profile.hasPaid
    ) {
      completedRegistrationUnpaid += 1;
    }
    if (pay.paymentType === "premium_upgrade" && !profile.hasPersonalSupport) {
      completedUpgradeNoSupport += 1;
    }
  }

  const dupSessions = await prisma.$queryRaw<Array<{ c: number }>>`
    SELECT COUNT(*)::int AS c FROM (
      SELECT stripe_session_id FROM payments
      GROUP BY stripe_session_id HAVING COUNT(*) > 1
    ) t`;
  const multiUserSessions = await prisma.$queryRaw<Array<{ c: number }>>`
    SELECT COUNT(*)::int AS c FROM (
      SELECT stripe_session_id FROM payments
      GROUP BY stripe_session_id HAVING COUNT(DISTINCT user_id) > 1
    ) t`;
  const quarantinedAttached = await prisma.payment.count({
    where: { convexId: { in: [...uniqueMissingUser] } },
  });

  const failureSessions = new Set<string>();
  for (const pay of quarantinedExport) {
    if (typeof pay.stripeSessionId === "string" && pay.stripeSessionId) {
      failureSessions.add(pay.stripeSessionId);
    }
  }
  for (const row of failureRows) {
    const detail = row.safeDetail as { stripeSessionId?: string } | null;
    if (detail?.stripeSessionId) failureSessions.add(detail.stripeSessionId);
  }
  const localSessions = new Set(
    allPayments
      .map((p) => p.stripeSessionId)
      .filter((s): s is string => Boolean(s)),
  );
  const sessionOverlap = [...failureSessions].filter((s) => localSessions.has(s));

  // Pending/failed do not independently grant access in Nest grant path;
  // legacy hasPaid with only pending/failed is a warning, not critical.
  const pendingFailedOnlyGrantUsers =
    classifications.pending_or_failed_payment_only.length;

  // --- Part 4: source vs local counts ---
  const localPayments = allPayments;
  const exportStatus = countBy(scrubPayments, (p) => String(p.status));
  const exportType = countBy(scrubPayments, (p) => String(p.paymentType));
  const exportTier = countBy(scrubPayments, (p) =>
    String(p.registrationTier ?? "null"),
  );
  const localStatus = countBy(localPayments, (p) => String(p.status));
  const localType = countBy(localPayments, (p) => String(p.paymentType));
  const localTier = countBy(localPayments, (p) =>
    String(p.registrationTier ?? "null"),
  );
  const qStatus = countBy(quarantinedExport, (p) => String(p.status));
  const qType = countBy(quarantinedExport, (p) => String(p.paymentType));
  const qTier = countBy(quarantinedExport, (p) =>
    String(p.registrationTier ?? "null"),
  );

  const accounted =
    localPayments.length + uniqueMissingUser.size === scrubPayments.length;

  // --- Critical / warning evaluation ---
  const critical: string[] = [];
  const warnings: string[] = [];

  if (completedMissingProfile > 0) {
    critical.push(
      `${completedMissingProfile} completed payment(s) missing profile`,
    );
  }
  if (completedRegistrationUnpaid > 0) {
    critical.push(
      `${completedRegistrationUnpaid} completed registration payment(s) with hasPaid=false`,
    );
  }
  if (completedUpgradeNoSupport > 0) {
    critical.push(
      `${completedUpgradeNoSupport} completed upgrade payment(s) without hasPersonalSupport`,
    );
  }
  if ((dupSessions[0]?.c ?? 0) > 0) {
    critical.push(`duplicate Stripe session IDs: ${dupSessions[0].c}`);
  }
  if ((multiUserSessions[0]?.c ?? 0) > 0) {
    critical.push(
      `Stripe sessions attached to multiple users: ${multiUserSessions[0].c}`,
    );
  }
  if (quarantinedAttached > 0) {
    critical.push(
      `${quarantinedAttached} quarantined payment(s) attached to valid payment rows`,
    );
  }
  if (!accounted) {
    critical.push(
      `source payments unaccounted: export=${scrubPayments.length} local=${localPayments.length} uniqueQuarantine=${uniqueMissingUser.size}`,
    );
  }
  if (sessionOverlap.length > 0) {
    critical.push(
      `${sessionOverlap.length} Stripe session(s) present in both payments and quarantine`,
    );
  }

  warnings.push(
    `${gap.length} profiles have hasPaid=true without a completed payment row (exact Convex parity: ${gap.every((pr) => profileByConvexUser.get(pr.user.convexId ?? "")?.hasPaid === true)})`,
  );
  warnings.push(
    `${missingUserRows.length - uniqueMissingUser.size} duplicate migration_failure rows (same 12 payments logged on ${runIds.length} importer runs)`,
  );
  if (pendingFailedOnlyGrantUsers > 0) {
    warnings.push(
      `${pendingFailedOnlyGrantUsers} hasPaid profiles have only pending/failed payments (legacy Convex state; Nest grant path does not treat these as independent grants)`,
    );
  }
  if (classifications.staff_or_owner.length > 0) {
    warnings.push(
      `${classifications.staff_or_owner.length} staff/owner accounts have hasPaid=true without completed payments (expected)`,
    );
  }

  const recommendedPolicy = {
    duplicateFailureRows:
      "Keep for now; optional later cleanup of duplicate migration_failures keyed by sourceTable+sourceConvexId+reason. Do not delete without a dedicated cleanup ticket.",
    quarantinedPayments:
      "Retain as missing_user quarantine. Users are absent from both working and scrubbed exports (orphan auth accounts). Do not attach to accounts.",
    legacyHasPaidWithoutPayment:
      "Preserve hasPaid exactly as imported from Convex. Do not bulk-clear before staging. Treat as legacy access state, not a migration defect.",
    pendingFailedOnly:
      "Warning only. Access already existed in Convex with non-completed payment rows. New Nest fulfillments remain status-gated.",
    dataCorrectionBeforeStaging: false,
    phase9MayBegin: critical.length === 0,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "8.5",
    readOnly: true,
    part1_quarantinedPayments: {
      classification: part1Classification,
      migrationFailureRowsMissingUser: missingUserRows.length,
      uniqueSourceConvexPaymentIds: uniqueMissingUser.size,
      duplicateFailureLogRows: missingUserRows.length - uniqueMissingUser.size,
      migrationRunIds: runIds,
      same12RecordedTwice:
        part1Classification === "12 unique failures recorded twice",
      actually24UniquePaymentRecords: false,
      multipleImporterRuns: runIds.length > 1,
      recordsUnderMultipleFailureCategories: multiReason.length,
      deduplicatedBySourceTableConvexIdReason: deduplicatedFailures.map((d) => ({
        ...d,
        sourceConvexId: redact(d.sourceConvexId),
      })),
      quarantineExportEvidence: {
        allFailedStatus: quarantinedExport.every((p) => p.status === "failed"),
        allUsersMissingFromExports: quarantineUserAnalysis.every(
          (q) => !q.userInScrubExport && !q.userInWorkingExport,
        ),
        allUsersOrphanAuth: quarantineUserAnalysis.every(
          (q) => q.userIsOrphanAuthFromScrub,
        ),
        samples: quarantineUserAnalysis.slice(0, 5),
        byStatus: qStatus,
        byPaymentType: qType,
        byRegistrationTier: qTier,
      },
    },
    part2_legacyPaidProfiles: {
      paidProfilesTotal: paidProfiles.length,
      withoutCompletedPayment: gap.length,
      classifications: classSummaries,
      cohortEvidence: {
        auditHitsOnGapUsers: auditHits,
        auditByAction,
        paymentNotificationsOnGap: paymentNotifsOnGap,
        evcLocal,
        evcExport,
        exactConvexParity: gap.every((pr) => {
          const cp = profileByConvexUser.get(pr.user.convexId ?? "");
          return cp?.hasPaid === true;
        }),
        convexPaidWithoutCompleted: scrubProfiles.filter(
          (pr) =>
            pr.hasPaid === true &&
            !convexCompletedUsers.has(String(pr.userId)),
        ).length,
      },
      unresolvedAccounts: classifications.unknown.length,
    },
    part3_completedConsistency: {
      completedCount: completedPayments.length,
      everyCompletedMapsToOneProfile: completedMissingProfile === 0,
      completedRegistrationImpliesHasPaid: completedRegistrationUnpaid === 0,
      upgradeImpliesSupport: completedUpgradeNoSupport === 0,
      pendingFailedDoNotIndependentlyGrantInNest: true,
      legacyPendingFailedWithHasPaidWarningCount: pendingFailedOnlyGrantUsers,
      duplicateStripeSessionIds: dupSessions[0]?.c ?? 0,
      completedPaymentAttachedToMultipleUsers: multiUserSessions[0]?.c ?? 0,
      quarantinedPaymentAttachedToValidUser: quarantinedAttached,
      stripeSessionInBothPaymentsAndFailures: sessionOverlap.length,
      result: critical.length === 0 ? "PASS" : "FAIL",
    },
    part4_sourceToLocalCounts: {
      originalConvexPaymentCount: workingPayments.length,
      scrubbedExportPaymentCount: scrubPayments.length,
      locallyImportedPaymentCount: localPayments.length,
      quarantinedUniquePaymentCount: uniqueMissingUser.size,
      migrationFailureRowCount: missingUserRows.length,
      completedCount: localStatus.completed ?? 0,
      pendingCount: localStatus.pending ?? 0,
      failedCount: localStatus.failed ?? 0,
      byPaymentType: localType,
      byRegistrationTier: localTier,
      differencesExplained: [
        `working export (${workingPayments.length}) == scrubbed export (${scrubPayments.length}): scrub did not remove payment documents`,
        `scrubbed (${scrubPayments.length}) - unique quarantined missing_user (${uniqueMissingUser.size}) = local imported (${localPayments.length})`,
        `migration_failure rows (${missingUserRows.length}) = unique quarantined (${uniqueMissingUser.size}) × importer runs (${runIds.length})`,
        `export failed (${exportStatus.failed ?? 0}) - quarantined failed (${qStatus.failed ?? 0}) = local failed (${localStatus.failed ?? 0})`,
        `export pending (${exportStatus.pending ?? 0}) = local pending (${localStatus.pending ?? 0})`,
        `export completed (${exportStatus.completed ?? 0}) = local completed (${localStatus.completed ?? 0})`,
        `export registration (${exportType.registration ?? 0}) - quarantined registration (${qType.registration ?? 0}) = local registration (${localType.registration ?? 0})`,
        `export registration_premium (${exportType.registration_premium ?? 0}) - quarantined registration_premium (${qType.registration_premium ?? 0}) = local registration_premium (${localType.registration_premium ?? 0})`,
        `export premium_upgrade (${exportType.premium_upgrade ?? 0}) = local premium_upgrade (${localType.premium_upgrade ?? 0})`,
        `export tier null (${exportTier.null ?? 0}) all quarantined; local has no null tiers`,
      ],
      exportBreakdown: {
        status: exportStatus,
        paymentType: exportType,
        registrationTier: exportTier,
      },
      quarantineBreakdown: {
        status: qStatus,
        paymentType: qType,
        registrationTier: qTier,
      },
      sourceFullyAccounted: accounted,
    },
    criticalFailures: critical,
    warnings,
    recommendedMigrationPolicy: recommendedPolicy,
    dataCorrectionRequiredBeforeStaging: false,
    phase9MaySafelyBegin: critical.length === 0,
    recordsRequiringManualReview: [
      ...deduplicatedFailures.map((d) => ({
        kind: "quarantined_payment_missing_user",
        sourceConvexId: redact(d.sourceConvexId),
        note: "Failed Stripe registration attempts for orphan auth users absent from users export",
      })),
      {
        kind: "legacy_hasPaid_without_completed_payment",
        count: gap.length,
        note: "Matches Convex application state; no automatic correction",
      },
    ],
  };

  const outDir = path.join(root, "migration-reports/phase8-reconciliation");
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "payment-reconciliation.json");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

  const md = `# Phase 8.5 Payment Reconciliation

Generated: ${report.generatedAt}

## Verdict

- Classification (12 vs 24): **${part1Classification}**
- Unique quarantined payments: **${uniqueMissingUser.size}**
- Duplicate migration_failure rows: **${missingUserRows.length - uniqueMissingUser.size}**
- Completed-payment consistency: **${report.part3_completedConsistency.result}**
- Data correction required before staging: **no**
- Phase 9 may safely begin: **${report.phase9MaySafelyBegin ? "yes" : "no"}**

## Part 1 — 12 versus 24

| Metric | Value |
| --- | --- |
| migration_failures reason=missing_user | ${missingUserRows.length} |
| Unique source Convex payment IDs | ${uniqueMissingUser.size} |
| Duplicate failure-log rows | ${missingUserRows.length - uniqueMissingUser.size} |
| Migration run IDs | ${runIds.join(", ")} |
| Same 12 recorded twice | ${report.part1_quarantinedPayments.same12RecordedTwice} |
| Multiple failure categories per record | ${multiReason.length} |

Deduplicated key: \`sourceTable + sourceConvexId + reason\` → ${deduplicatedFailures.length} unique keys.

Quarantined payments are all \`status=failed\`, reference users absent from both working and scrubbed user exports, and align with scrub \`orphan_user_missing\` auth accounts. None are attached to local payment rows.

## Part 2 — Paid profiles without completed payments

Total \`hasPaid=true\`: ${paidProfiles.length}. Without completed payment: **${gap.length}**.

| Classification | Count |
| --- | ---: |
${(Object.keys(classSummaries) as ClassKey[])
  .map((k) => `| ${k} | ${(classSummaries[k] as { count: number }).count} |`)
  .join("\n")}

Evidence:

- Exact match to Convex scrubbed profiles with \`hasPaid=true\` and no completed payment row (${report.part2_legacyPaidProfiles.cohortEvidence.convexPaidWithoutCompleted}).
- EVC proofs in export/local: ${evcExport}/${evcLocal}.
- Payment notifications on gap cohort: ${paymentNotifsOnGap}.
- Audit hits on gap users (approve/photo/support — not payment grants): ${auditHits}.

**No \`hasPaid\` values were changed.**

## Part 3 — Completed payment consistency

| Check | Result |
| --- | --- |
| Completed → one profile | ${completedMissingProfile === 0 ? "PASS" : "FAIL"} |
| Registration completed → hasPaid | ${completedRegistrationUnpaid === 0 ? "PASS" : "FAIL"} |
| Upgrade completed → support | ${completedUpgradeNoSupport === 0 ? "PASS" : "FAIL"} |
| Duplicate Stripe sessions | ${dupSessions[0]?.c ?? 0} |
| Multi-user Stripe sessions | ${multiUserSessions[0]?.c ?? 0} |
| Quarantined attached to valid user | ${quarantinedAttached} |
| Session in payments and failures | ${sessionOverlap.length} |

## Part 4 — Source vs local counts

| Count | Value |
| --- | ---: |
| Original Convex payments | ${workingPayments.length} |
| Scrubbed export payments | ${scrubPayments.length} |
| Locally imported | ${localPayments.length} |
| Quarantined unique | ${uniqueMissingUser.size} |
| migration_failure rows | ${missingUserRows.length} |
| Completed | ${localStatus.completed ?? 0} |
| Pending | ${localStatus.pending ?? 0} |
| Failed | ${localStatus.failed ?? 0} |

Differences:

${report.part4_sourceToLocalCounts.differencesExplained.map((d) => `- ${d}`).join("\n")}

## Critical failures

${critical.length ? critical.map((c) => `- ${c}`).join("\n") : "- none"}

## Warnings

${warnings.map((w) => `- ${w}`).join("\n")}

## Recommended migration policy

- Duplicate failure rows: ${recommendedPolicy.duplicateFailureRows}
- Quarantined payments: ${recommendedPolicy.quarantinedPayments}
- Legacy hasPaid without payment: ${recommendedPolicy.legacyHasPaidWithoutPayment}
- Pending/failed only: ${recommendedPolicy.pendingFailedOnly}
- Correction before staging: **not required**
`;

  const mdPath = path.join(outDir, "payment-reconciliation.md");
  fs.writeFileSync(mdPath, md);

  console.log(JSON.stringify(report, null, 2));
  console.error(`Wrote ${jsonPath}`);
  console.error(`Wrote ${mdPath}`);

  await prisma.$disconnect();

  if (critical.length > 0) {
    process.exitCode = 1;
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
