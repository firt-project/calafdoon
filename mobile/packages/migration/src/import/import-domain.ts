import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { msToDate } from "../lib/args.js";
import { findTableJsonl, pathExists, readJsonl } from "../lib/jsonl.js";
import {
  asBoolean,
  asNumber,
  asString,
  bump,
  convexCreatedAt,
  createdAtMs,
  emptyCounts,
  fail,
  oneOf,
  preferExisting,
  requireId,
  safeId,
  skip,
  stringArray,
  type DomainImportCounts,
  type QuarantineFn,
} from "./helpers.js";

const DOMAIN_TABLES = [
  "likes",
  "blocks",
  "reports",
  "matches",
  "conversations",
  "messages",
  "notifications",
  "payments",
  "evcPaymentProofs",
  "announcements",
  "staffInvites",
  "supportContacts",
  "supportMessages",
  "memberEmailLog",
  "auditLogs",
  "compatibilityScores",
  "siteMetrics",
  "userUploads",
] as const;

/** Same ordering as apps/api matching makePairKey. */
function makePairKey(userAId: string, userBId: string): string {
  return userAId < userBId
    ? `${userAId}:${userBId}`
    : `${userBId}:${userAId}`;
}

type DomainTable = (typeof DOMAIN_TABLES)[number];

const LIKE_ACTIONS = ["like", "pass", "shortlist"] as const;
const MATCH_STATUSES = ["active", "archived", "unmatched"] as const;
const NOTIF_TYPES = [
  "like",
  "match",
  "message",
  "announcement",
  "approval",
  "payment",
] as const;
const PAYMENT_TYPES = [
  "registration",
  "registration_premium",
  "premium_upgrade",
  "chat",
] as const;
const REG_TIERS = ["basic", "premium"] as const;
const PAYMENT_STATUSES = ["pending", "completed", "failed"] as const;
const ANNOUNCEMENT_AUDIENCES = ["all", "paid", "trial", "unpaid"] as const;
const STAFF_ROLES = ["user", "admin", "owner"] as const;
const STAFF_STATUSES = ["pending", "accepted", "revoked", "expired"] as const;
const REPORT_STATUSES = ["open", "reviewed", "dismissed"] as const;
const REPORT_PRIORITIES = ["low", "medium", "high"] as const;
const SUPPORT_TOPICS = [
  "photo_upload",
  "account",
  "payment",
  "other",
  "contact_form",
] as const;
const SUPPORT_SOURCES = [
  "profile",
  "questionnaire",
  "contact_page",
  "other",
] as const;
const SUPPORT_STATUSES = ["open", "reviewed", "closed"] as const;
const SUPPORT_ROLES = ["member", "admin", "visitor"] as const;
const EMAIL_KINDS = [
  "reminder_profile",
  "reminder_payment",
  "reminder_trial_ending",
  "reminder_signup_incomplete",
  "request_profile_photo",
] as const;
const EVC_STATUSES = ["pending", "approved", "rejected"] as const;

async function loadPrisma() {
  const mod = await import("@prisma/client");
  return mod.PrismaClient;
}

type PrismaClient = InstanceType<Awaited<ReturnType<typeof loadPrisma>>>;

async function loadUserMap(prisma: PrismaClient): Promise<Map<string, string>> {
  const rows = await prisma.user.findMany({
    select: { id: true, convexId: true },
  });
  return new Map(rows.map((r) => [r.convexId, r.id]));
}

async function loadProfileMap(
  prisma: PrismaClient
): Promise<Map<string, string>> {
  const rows = await prisma.profile.findMany({
    select: { id: true, convexId: true },
  });
  return new Map(rows.map((r) => [r.convexId, r.id]));
}

async function loadMatchMap(prisma: PrismaClient): Promise<Map<string, string>> {
  const rows = await prisma.match.findMany({
    select: { id: true, convexId: true },
  });
  return new Map(rows.map((r) => [r.convexId, r.id]));
}

async function loadConversationMap(
  prisma: PrismaClient
): Promise<Map<string, string>> {
  const rows = await prisma.conversation.findMany({
    select: { id: true, convexId: true },
  });
  return new Map(rows.map((r) => [r.convexId, r.id]));
}

async function loadSupportContactMap(
  prisma: PrismaClient
): Promise<Map<string, string>> {
  const rows = await prisma.supportContact.findMany({
    select: { id: true, convexId: true },
  });
  return new Map(rows.map((r) => [r.convexId, r.id]));
}

/** Dry-run FK stubs: map convexId → itself from export JSONL. */
async function loadConvexIdsFromExport(
  inputPath: string,
  table: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const file = await findTableJsonl(inputPath, table);
  if (!file) return map;
  for await (const row of readJsonl(file)) {
    const id = typeof row._id === "string" ? row._id : null;
    if (id) map.set(id, id);
  }
  return map;
}

function withPrismaPoolLimits(url: string): string {
  const u = new URL(url);
  if (!u.searchParams.has("connection_limit")) {
    u.searchParams.set("connection_limit", "5");
  }
  if (!u.searchParams.has("pool_timeout")) {
    u.searchParams.set("pool_timeout", "60");
  }
  if (!u.searchParams.has("connect_timeout")) {
    u.searchParams.set("connect_timeout", "30");
  }
  return u.toString();
}

function makeQuarantine(
  prisma: PrismaClient | null,
  runId: string | null,
  dryRun: boolean
): QuarantineFn {
  return async ({ table, convexId, reasonCode, safeDetail }) => {
    if (dryRun || !prisma || !runId) return;
    try {
      await prisma.migrationFailure.create({
        data: {
          runId,
          tableName: table,
          convexId: convexId ?? null,
          reasonCode,
          safeDetail: safeDetail ?? null,
        },
      });
    } catch (error) {
      // Never abort the import because quarantine logging failed (e.g. pool timeout).
      console.warn(
        `[quarantine] failed to record ${table}/${convexId ?? "?"} (${reasonCode}):`,
        error instanceof Error ? error.message : error
      );
    }
  };
}

export async function runImportDomain(opts: {
  inputPath: string;
  limit?: number;
  dryRun: boolean;
  databaseUrl?: string;
  outDir?: string;
}) {
  const { inputPath, limit, dryRun, outDir } = opts;
  if (!(await pathExists(inputPath))) {
    throw new Error(`Export path does not exist: ${inputPath}`);
  }

  const databaseUrl = opts.databaseUrl ?? process.env.DATABASE_URL;
  if (!dryRun && !databaseUrl) {
    throw new Error("DATABASE_URL is required unless --dry-run is set");
  }

  const prisma = dryRun
    ? null
    : new (await loadPrisma())({
        datasources: { db: { url: withPrismaPoolLimits(databaseUrl) } },
      });

  const counts = emptyCounts([...DOMAIN_TABLES]);
  const sourceHash = createHash("sha256")
    .update(`domain:${inputPath}`)
    .digest("hex")
    .slice(0, 16);

  let runId: string | null = null;

  try {
    if (prisma) {
      const run = await prisma.migrationRun.create({
        data: {
          sourceExportPath: inputPath,
          sourceExportHash: sourceHash,
          status: "running",
          dryRun: false,
          notes: "phase2-domain",
        },
      });
      runId = run.id;
    }

    const q = makeQuarantine(prisma, runId, dryRun);

    // Live DB maps for resume/FK resolution; dry-run loads IDs from export.
    const userByConvex = prisma
      ? await loadUserMap(prisma)
      : await loadConvexIdsFromExport(inputPath, "users");
    const profileByConvex = prisma
      ? await loadProfileMap(prisma)
      : await loadConvexIdsFromExport(inputPath, "profiles");
    const matchByConvex = prisma
      ? await loadMatchMap(prisma)
      : new Map<string, string>();
    const conversationByConvex = prisma
      ? await loadConversationMap(prisma)
      : new Map<string, string>();
    const supportContactByConvex = prisma
      ? await loadSupportContactMap(prisma)
      : new Map<string, string>();

    // Stage 1
    await importLikes({
      inputPath,
      limit,
      dryRun,
      prisma,
      userByConvex,
      counts,
      quarantine: q,
    });
    await importBlocks({
      inputPath,
      limit,
      dryRun,
      prisma,
      userByConvex,
      counts,
      quarantine: q,
    });
    await importReports({
      inputPath,
      limit,
      dryRun,
      prisma,
      userByConvex,
      counts,
      quarantine: q,
    });

    // Stage 2–4
    await importMatches({
      inputPath,
      limit,
      dryRun,
      prisma,
      userByConvex,
      matchByConvex,
      counts,
      quarantine: q,
    });
    await importConversations({
      inputPath,
      limit,
      dryRun,
      prisma,
      matchByConvex,
      conversationByConvex,
      userByConvex,
      counts,
      quarantine: q,
    });
    await importMessages({
      inputPath,
      limit,
      dryRun,
      prisma,
      conversationByConvex,
      userByConvex,
      counts,
      quarantine: q,
    });

    // Stage 5
    await importNotifications({
      inputPath,
      limit,
      dryRun,
      prisma,
      userByConvex,
      counts,
      quarantine: q,
    });

    // Stage 6
    await importPayments({
      inputPath,
      limit,
      dryRun,
      prisma,
      userByConvex,
      matchByConvex,
      counts,
      quarantine: q,
    });
    await importEvcProofs({
      inputPath,
      limit,
      dryRun,
      prisma,
      userByConvex,
      profileByConvex,
      counts,
      quarantine: q,
    });

    // Stage 7
    await importAnnouncements({
      inputPath,
      limit,
      dryRun,
      prisma,
      userByConvex,
      counts,
      quarantine: q,
    });
    await importStaffInvites({
      inputPath,
      limit,
      dryRun,
      prisma,
      userByConvex,
      counts,
      quarantine: q,
    });

    // Stage 8
    await importSupportContacts({
      inputPath,
      limit,
      dryRun,
      prisma,
      userByConvex,
      supportContactByConvex,
      counts,
      quarantine: q,
    });
    await importSupportMessages({
      inputPath,
      limit,
      dryRun,
      prisma,
      userByConvex,
      supportContactByConvex,
      counts,
      quarantine: q,
    });

    // Stage 9
    await importMemberEmailLog({
      inputPath,
      limit,
      dryRun,
      prisma,
      userByConvex,
      counts,
      quarantine: q,
    });
    await importAuditLogs({
      inputPath,
      limit,
      dryRun,
      prisma,
      userByConvex,
      profileByConvex,
      counts,
      quarantine: q,
    });

    // Stage 10–12
    await importCompatibilityScores({
      inputPath,
      limit,
      dryRun,
      prisma,
      userByConvex,
      counts,
      quarantine: q,
    });
    await importSiteMetrics({
      inputPath,
      limit,
      dryRun,
      prisma,
      counts,
      quarantine: q,
    });
    await importUserUploads({
      inputPath,
      limit,
      dryRun,
      prisma,
      userByConvex,
      counts,
      quarantine: q,
    });

    if (prisma && runId) {
      await prisma.migrationRun.update({
        where: { id: runId },
        data: {
          status: "completed",
          completedAt: new Date(),
          insertedCounts: counts.inserted,
          updatedCounts: counts.updated,
          skippedCounts: counts.skipped,
          failureCounts: { total: counts.failed.length },
          tableCounts: counts.source,
          orphanCounts: {
            skippedRecords: counts.skippedRecords.length,
          },
        },
      });
    }

    const report = {
      generatedAt: new Date().toISOString(),
      phase: 2,
      dryRun,
      inputPath,
      limit: limit ?? null,
      source: counts.source,
      inserted: counts.inserted,
      updated: counts.updated,
      skipped: counts.skipped,
      failed: counts.failed,
      skippedRecords: counts.skippedRecords,
      failureCount: counts.failed.length,
      skippedRecordCount: counts.skippedRecords.length,
    };

    const markdown = [
      "# Phase 2 domain import report",
      "",
      `- Generated: ${report.generatedAt}`,
      `- Dry-run: ${dryRun}`,
      `- Limit: ${report.limit ?? "none"}`,
      `- Failures: ${report.failureCount}`,
      `- Skipped records: ${report.skippedRecordCount}`,
      "",
      "## Source counts",
      "",
      ...DOMAIN_TABLES.map((t) => `- ${t}: ${counts.source[t] ?? 0}`),
      "",
      "## Inserted",
      "",
      ...DOMAIN_TABLES.map((t) => `- ${t}: ${counts.inserted[t] ?? 0}`),
      "",
      "## Updated",
      "",
      ...DOMAIN_TABLES.map((t) => `- ${t}: ${counts.updated[t] ?? 0}`),
      "",
      "## Skipped (counts)",
      "",
      ...DOMAIN_TABLES.map((t) => `- ${t}: ${counts.skipped[t] ?? 0}`),
      "",
      "## Failures (quarantined)",
      "",
      ...(counts.failed.length
        ? counts.failed
            .slice(0, 200)
            .map(
              (f) =>
                `- [${f.reason}] ${f.table}${f.convexId ? ` ${f.convexId}` : ""}${f.detail ? ` — ${f.detail}` : ""}`
            )
        : ["- none"]),
      "",
      "## Skipped records (explicit)",
      "",
      ...(counts.skippedRecords.length
        ? counts.skippedRecords
            .slice(0, 200)
            .map(
              (s) =>
                `- [${s.reason}] ${s.table}${s.convexId ? ` ${s.convexId}` : ""}${s.detail ? ` — ${s.detail}` : ""}`
            )
        : ["- none"]),
      "",
    ].join("\n");

    if (outDir) {
      await writeFile(
        path.join(outDir, "import-domain-report.json"),
        JSON.stringify(report, null, 2),
        "utf8"
      );
      await writeFile(
        path.join(outDir, "import-domain-report.md"),
        markdown,
        "utf8"
      );
    }

    return { dryRun, runId, counts, report, markdown };
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}

type CommonArgs = {
  inputPath: string;
  limit?: number;
  dryRun: boolean;
  prisma: PrismaClient | null;
  counts: DomainImportCounts;
  quarantine: QuarantineFn;
};

async function* iterateTable(
  inputPath: string,
  table: DomainTable,
  limit: number | undefined,
  counts: DomainImportCounts
) {
  const file = await findTableJsonl(inputPath, table);
  if (!file) {
    counts.source[table] = 0;
    return;
  }
  let n = 0;
  for await (const row of readJsonl(file, limit)) {
    n++;
    yield row;
  }
  counts.source[table] = n;
}

async function importLikes(
  args: CommonArgs & { userByConvex: Map<string, string> }
) {
  const { dryRun, prisma, userByConvex, counts, quarantine } = args;
  for await (const row of iterateTable(
    args.inputPath,
    "likes",
    args.limit,
    counts
  )) {
    const convexId = requireId(row);
    const fromConvex = asString(row.fromUserId);
    const toConvex = asString(row.toUserId);
    const action = oneOf(row.action, LIKE_ACTIONS);
    if (!convexId || !fromConvex || !toConvex || !action) {
      fail(counts, "likes", convexId ?? undefined, "invalid_row");
      await quarantine({
        table: "likes",
        convexId: convexId ?? undefined,
        reasonCode: "invalid_row",
      });
      continue;
    }
    const fromUserId = userByConvex.get(fromConvex);
    const toUserId = userByConvex.get(toConvex);
    if (!fromUserId || !toUserId) {
      fail(counts, "likes", convexId, "missing_user");
      await quarantine({
        table: "likes",
        convexId,
        reasonCode: "missing_user",
        safeDetail: `from=${safeId(fromConvex)} to=${safeId(toConvex)}`,
      });
      continue;
    }
    if (dryRun || !prisma) {
      bump(counts, "likes", "inserted");
      continue;
    }
    try {
      const existing = await prisma.like.findUnique({ where: { convexId } });
      await prisma.like.upsert({
        where: { convexId },
        create: {
          convexId,
          fromUserId,
          toUserId,
          convexFromUserId: fromConvex,
          convexToUserId: toConvex,
          action,
          convexCreatedAt: convexCreatedAt(row),
        },
        update: {
          fromUserId,
          toUserId,
          action,
          convexFromUserId: fromConvex,
          convexToUserId: toConvex,
        },
      });
      bump(counts, "likes", existing ? "updated" : "inserted");
    } catch (error) {
      fail(
        counts,
        "likes",
        convexId,
        error instanceof Error ? error.message : "upsert_failed"
      );
      await quarantine({
        table: "likes",
        convexId,
        reasonCode: "upsert_failed",
      });
    }
  }
}

async function importBlocks(
  args: CommonArgs & { userByConvex: Map<string, string> }
) {
  const { dryRun, prisma, userByConvex, counts, quarantine } = args;
  for await (const row of iterateTable(
    args.inputPath,
    "blocks",
    args.limit,
    counts
  )) {
    const convexId = requireId(row);
    const blockerConvex = asString(row.blockerId);
    const blockedConvex = asString(row.blockedId);
    if (!convexId || !blockerConvex || !blockedConvex) {
      fail(counts, "blocks", convexId ?? undefined, "invalid_row");
      await quarantine({
        table: "blocks",
        convexId: convexId ?? undefined,
        reasonCode: "invalid_row",
      });
      continue;
    }
    const blockerId = userByConvex.get(blockerConvex);
    const blockedId = userByConvex.get(blockedConvex);
    if (!blockerId || !blockedId) {
      fail(counts, "blocks", convexId, "missing_user");
      await quarantine({
        table: "blocks",
        convexId,
        reasonCode: "missing_user",
      });
      continue;
    }
    const blockedAt = createdAtMs(row) ?? new Date(0);
    if (dryRun || !prisma) {
      bump(counts, "blocks", "inserted");
      continue;
    }
    try {
      const existing = await prisma.block.findUnique({ where: { convexId } });
      await prisma.block.upsert({
        where: { convexId },
        create: {
          convexId,
          blockerId,
          blockedId,
          convexBlockerId: blockerConvex,
          convexBlockedId: blockedConvex,
          blockedAt,
          convexCreatedAt: convexCreatedAt(row),
        },
        update: {
          blockerId,
          blockedId,
          blockedAt: preferExisting(existing?.blockedAt, blockedAt) as Date,
        },
      });
      bump(counts, "blocks", existing ? "updated" : "inserted");
    } catch (error) {
      fail(
        counts,
        "blocks",
        convexId,
        error instanceof Error ? error.message : "upsert_failed"
      );
      await quarantine({
        table: "blocks",
        convexId,
        reasonCode: "upsert_failed",
      });
    }
  }
}

async function importReports(
  args: CommonArgs & { userByConvex: Map<string, string> }
) {
  const { dryRun, prisma, userByConvex, counts, quarantine } = args;
  for await (const row of iterateTable(
    args.inputPath,
    "reports",
    args.limit,
    counts
  )) {
    const convexId = requireId(row);
    const reporterConvex = asString(row.reporterId);
    const reportedConvex = asString(row.reportedUserId);
    const status = oneOf(row.status, REPORT_STATUSES);
    const reason = asString(row.reason);
    if (!convexId || !reporterConvex || !reportedConvex || !status || !reason) {
      fail(counts, "reports", convexId ?? undefined, "invalid_row");
      await quarantine({
        table: "reports",
        convexId: convexId ?? undefined,
        reasonCode: "invalid_row",
      });
      continue;
    }
    const reporterId = userByConvex.get(reporterConvex);
    const reportedUserId = userByConvex.get(reportedConvex);
    if (!reporterId || !reportedUserId) {
      fail(counts, "reports", convexId, "missing_user");
      await quarantine({
        table: "reports",
        convexId,
        reasonCode: "missing_user",
      });
      continue;
    }
    const reviewedByConvex = asString(row.reviewedBy);
    let reviewedById: string | null = null;
    if (reviewedByConvex) {
      reviewedById = userByConvex.get(reviewedByConvex) ?? null;
      if (!reviewedById) {
        skip(
          counts,
          "reports",
          convexId,
          "optional_reviewed_by_missing",
          safeId(reviewedByConvex)
        );
      }
    }
    if (dryRun || !prisma) {
      bump(counts, "reports", "inserted");
      continue;
    }
    try {
      const existing = await prisma.report.findUnique({ where: { convexId } });
      await prisma.report.upsert({
        where: { convexId },
        create: {
          convexId,
          reporterId,
          reportedUserId,
          convexReporterId: reporterConvex,
          convexReportedUserId: reportedConvex,
          reason,
          details: asString(row.details),
          status,
          priority: oneOf(row.priority, REPORT_PRIORITIES),
          adminNotes: asString(row.adminNotes),
          resolution: asString(row.resolution),
          reportCreatedAt: createdAtMs(row) ?? new Date(0),
          reviewedAt: msToDate(row.reviewedAt),
          reviewedById,
          convexReviewedBy: reviewedByConvex,
          convexCreatedAt: convexCreatedAt(row),
        },
        update: {
          status,
          details: preferExisting(
            existing?.details,
            asString(row.details)
          ) as string | null,
          adminNotes: preferExisting(
            existing?.adminNotes,
            asString(row.adminNotes)
          ) as string | null,
          resolution: preferExisting(
            existing?.resolution,
            asString(row.resolution)
          ) as string | null,
          reviewedById: preferExisting(existing?.reviewedById, reviewedById) as
            | string
            | null,
          priority:
            oneOf(row.priority, REPORT_PRIORITIES) ?? existing?.priority ?? null,
        },
      });
      bump(counts, "reports", existing ? "updated" : "inserted");
    } catch (error) {
      fail(
        counts,
        "reports",
        convexId,
        error instanceof Error ? error.message : "upsert_failed"
      );
      await quarantine({
        table: "reports",
        convexId,
        reasonCode: "upsert_failed",
      });
    }
  }
}

async function importMatches(
  args: CommonArgs & {
    userByConvex: Map<string, string>;
    matchByConvex: Map<string, string>;
  }
) {
  const { dryRun, prisma, userByConvex, matchByConvex, counts, quarantine } =
    args;
  for await (const row of iterateTable(
    args.inputPath,
    "matches",
    args.limit,
    counts
  )) {
    const convexId = requireId(row);
    const userAConvex = asString(row.userA);
    const userBConvex = asString(row.userB);
    const status = oneOf(row.status, MATCH_STATUSES);
    const score = asNumber(row.score);
    const chatUnlocked = asBoolean(row.chatUnlocked);
    if (
      !convexId ||
      !userAConvex ||
      !userBConvex ||
      !status ||
      score === null ||
      chatUnlocked === null
    ) {
      fail(counts, "matches", convexId ?? undefined, "invalid_row");
      await quarantine({
        table: "matches",
        convexId: convexId ?? undefined,
        reasonCode: "invalid_row",
      });
      continue;
    }
    const userAId = userByConvex.get(userAConvex);
    const userBId = userByConvex.get(userBConvex);
    if (!userAId || !userBId) {
      fail(counts, "matches", convexId, "missing_user");
      await quarantine({
        table: "matches",
        convexId,
        reasonCode: "missing_user",
      });
      continue;
    }
    if (dryRun || !prisma) {
      matchByConvex.set(convexId, `dry-${convexId}`);
      bump(counts, "matches", "inserted");
      continue;
    }
    try {
      const existing = await prisma.match.findUnique({ where: { convexId } });
      const pairKey = makePairKey(userAId, userBId);
      const saved = await prisma.match.upsert({
        where: { convexId },
        create: {
          convexId,
          pairKey,
          userAId,
          userBId,
          convexUserA: userAConvex,
          convexUserB: userBConvex,
          score,
          status,
          chatUnlocked,
          seenAtByUser: (row.seenAtByUser as object | undefined) ?? undefined,
          archivedAt: msToDate(row.archivedAt),
          convexCreatedAt: convexCreatedAt(row),
        },
        update: {
          pairKey,
          score,
          status,
          chatUnlocked,
          seenAtByUser: preferExisting(
            existing?.seenAtByUser as object | null | undefined,
            row.seenAtByUser as object | undefined
          ) as object | undefined,
          archivedAt: preferExisting(
            existing?.archivedAt,
            msToDate(row.archivedAt)
          ) as Date | null,
        },
      });
      matchByConvex.set(convexId, saved.id);
      bump(counts, "matches", existing ? "updated" : "inserted");
    } catch (error) {
      fail(
        counts,
        "matches",
        convexId,
        error instanceof Error ? error.message : "upsert_failed"
      );
      await quarantine({
        table: "matches",
        convexId,
        reasonCode: "upsert_failed",
      });
    }
  }
}

async function importConversations(
  args: CommonArgs & {
    matchByConvex: Map<string, string>;
    conversationByConvex: Map<string, string>;
    userByConvex: Map<string, string>;
  }
) {
  const {
    dryRun,
    prisma,
    matchByConvex,
    conversationByConvex,
    userByConvex,
    counts,
    quarantine,
  } = args;
  for await (const row of iterateTable(
    args.inputPath,
    "conversations",
    args.limit,
    counts
  )) {
    const convexId = requireId(row);
    const matchConvex = asString(row.matchId);
    const participants = stringArray(row.participants);
    const lastMessageAt = msToDate(row.lastMessageAt);
    if (!convexId || !matchConvex || !lastMessageAt) {
      fail(counts, "conversations", convexId ?? undefined, "invalid_row");
      await quarantine({
        table: "conversations",
        convexId: convexId ?? undefined,
        reasonCode: "invalid_row",
      });
      continue;
    }
    const matchId = matchByConvex.get(matchConvex);
    if (!matchId) {
      fail(counts, "conversations", convexId, "missing_match");
      await quarantine({
        table: "conversations",
        convexId,
        reasonCode: "missing_match",
        safeDetail: safeId(matchConvex),
      });
      continue;
    }
    const missingParticipant = participants.find((p) => !userByConvex.has(p));
    if (missingParticipant) {
      fail(counts, "conversations", convexId, "missing_participant");
      await quarantine({
        table: "conversations",
        convexId,
        reasonCode: "missing_participant",
        safeDetail: safeId(missingParticipant),
      });
      continue;
    }
    if (dryRun || !prisma) {
      conversationByConvex.set(convexId, `dry-${convexId}`);
      bump(counts, "conversations", "inserted");
      continue;
    }
    try {
      const saved = await prisma.$transaction(async (tx) => {
        const match = await tx.match.findUnique({ where: { id: matchId } });
        if (!match) throw new Error("match_missing_in_tx");
        const expected = new Set([match.convexUserA, match.convexUserB]);
        const parts = new Set(participants);
        if (
          expected.size !== parts.size ||
          [...expected].some((id) => !parts.has(id))
        ) {
          throw new Error("participant_match_mismatch");
        }
        const existing = await tx.conversation.findUnique({
          where: { convexId },
        });
        const rowSaved = await tx.conversation.upsert({
          where: { convexId },
          create: {
            convexId,
            matchId,
            convexMatchId: matchConvex,
            participantConvexIds: participants,
            lastMessageAt,
            unreadByUser: (row.unreadByUser as object | undefined) ?? undefined,
            convexCreatedAt: convexCreatedAt(row),
          },
          update: {
            lastMessageAt,
            participantConvexIds:
              participants.length > 0
                ? participants
                : existing?.participantConvexIds ?? [],
            unreadByUser: preferExisting(
              existing?.unreadByUser as object | null | undefined,
              row.unreadByUser as object | undefined
            ) as object | undefined,
          },
        });
        return { rowSaved, existing };
      });
      conversationByConvex.set(convexId, saved.rowSaved.id);
      bump(counts, "conversations", saved.existing ? "updated" : "inserted");
    } catch (error) {
      fail(
        counts,
        "conversations",
        convexId,
        error instanceof Error ? error.message : "upsert_failed"
      );
      await quarantine({
        table: "conversations",
        convexId,
        reasonCode: "upsert_failed",
        safeDetail:
          error instanceof Error ? error.message.slice(0, 120) : undefined,
      });
    }
  }
}

async function importMessages(
  args: CommonArgs & {
    conversationByConvex: Map<string, string>;
    userByConvex: Map<string, string>;
  }
) {
  const {
    dryRun,
    prisma,
    conversationByConvex,
    userByConvex,
    counts,
    quarantine,
  } = args;
  for await (const row of iterateTable(
    args.inputPath,
    "messages",
    args.limit,
    counts
  )) {
    const convexId = requireId(row);
    const conversationConvex = asString(row.conversationId);
    const senderConvex = asString(row.senderId);
    const body = asString(row.message) ?? asString(row.body);
    const read = asBoolean(row.read);
    const messageCreatedAt = createdAtMs(row);
    if (
      !convexId ||
      !conversationConvex ||
      !senderConvex ||
      body === null ||
      read === null ||
      !messageCreatedAt
    ) {
      fail(counts, "messages", convexId ?? undefined, "invalid_row");
      await quarantine({
        table: "messages",
        convexId: convexId ?? undefined,
        reasonCode: "invalid_row",
      });
      continue;
    }
    const conversationId = conversationByConvex.get(conversationConvex);
    const senderId = userByConvex.get(senderConvex);
    if (!conversationId || !senderId) {
      fail(
        counts,
        "messages",
        convexId,
        !conversationId ? "missing_conversation" : "missing_sender"
      );
      await quarantine({
        table: "messages",
        convexId,
        reasonCode: !conversationId
          ? "missing_conversation"
          : "missing_sender",
      });
      continue;
    }
    if (dryRun || !prisma) {
      bump(counts, "messages", "inserted");
      continue;
    }
    try {
      const existing = await prisma.message.findUnique({ where: { convexId } });
      await prisma.message.upsert({
        where: { convexId },
        create: {
          convexId,
          conversationId,
          convexConversationId: conversationConvex,
          senderId,
          convexSenderId: senderConvex,
          body,
          imageConvexId: asString(row.imageId),
          read,
          messageCreatedAt,
          convexCreatedAt: convexCreatedAt(row),
        },
        update: {
          body: preferExisting(existing?.body, body) as string,
          read,
          imageConvexId: preferExisting(
            existing?.imageConvexId,
            asString(row.imageId)
          ) as string | null,
        },
      });
      bump(counts, "messages", existing ? "updated" : "inserted");
    } catch (error) {
      fail(
        counts,
        "messages",
        convexId,
        error instanceof Error ? error.message : "upsert_failed"
      );
      await quarantine({
        table: "messages",
        convexId,
        reasonCode: "upsert_failed",
      });
    }
  }
}

async function importNotifications(
  args: CommonArgs & { userByConvex: Map<string, string> }
) {
  const { dryRun, prisma, userByConvex, counts, quarantine } = args;
  for await (const row of iterateTable(
    args.inputPath,
    "notifications",
    args.limit,
    counts
  )) {
    const convexId = requireId(row);
    const userConvex = asString(row.userId);
    const type = oneOf(row.type, NOTIF_TYPES);
    const title = asString(row.title);
    const body = asString(row.body);
    const read = asBoolean(row.read);
    const notificationCreatedAt = createdAtMs(row);
    if (
      !convexId ||
      !userConvex ||
      !type ||
      !title ||
      !body ||
      read === null ||
      !notificationCreatedAt
    ) {
      fail(counts, "notifications", convexId ?? undefined, "invalid_row");
      await quarantine({
        table: "notifications",
        convexId: convexId ?? undefined,
        reasonCode: "invalid_row",
      });
      continue;
    }
    const userId = userByConvex.get(userConvex);
    if (!userId) {
      fail(counts, "notifications", convexId, "missing_user");
      await quarantine({
        table: "notifications",
        convexId,
        reasonCode: "missing_user",
      });
      continue;
    }
    const relatedConvex = asString(row.relatedUserId);
    let relatedUserId: string | null = null;
    if (relatedConvex) {
      relatedUserId = userByConvex.get(relatedConvex) ?? null;
      if (!relatedUserId) {
        skip(
          counts,
          "notifications",
          convexId,
          "optional_related_user_missing",
          safeId(relatedConvex)
        );
      }
    }
    if (dryRun || !prisma) {
      bump(counts, "notifications", "inserted");
      continue;
    }
    try {
      const existing = await prisma.notification.findUnique({
        where: { convexId },
      });
      await prisma.notification.upsert({
        where: { convexId },
        create: {
          convexId,
          userId,
          convexUserId: userConvex,
          type,
          title,
          body,
          read,
          relatedUserId,
          convexRelatedUserId: relatedConvex,
          notificationCreatedAt,
          convexCreatedAt: convexCreatedAt(row),
        },
        update: {
          title: preferExisting(existing?.title, title) as string,
          body: preferExisting(existing?.body, body) as string,
          read,
          relatedUserId: preferExisting(
            existing?.relatedUserId,
            relatedUserId
          ) as string | null,
        },
      });
      bump(counts, "notifications", existing ? "updated" : "inserted");
    } catch (error) {
      fail(
        counts,
        "notifications",
        convexId,
        error instanceof Error ? error.message : "upsert_failed"
      );
      await quarantine({
        table: "notifications",
        convexId,
        reasonCode: "upsert_failed",
      });
    }
  }
}

async function importPayments(
  args: CommonArgs & {
    userByConvex: Map<string, string>;
    matchByConvex: Map<string, string>;
  }
) {
  const { dryRun, prisma, userByConvex, matchByConvex, counts, quarantine } =
    args;
  for await (const row of iterateTable(
    args.inputPath,
    "payments",
    args.limit,
    counts
  )) {
    const convexId = requireId(row);
    const userConvex = asString(row.userId);
    const stripeSessionId = asString(row.stripeSessionId);
    const amount = asNumber(row.amount);
    const status = oneOf(row.status, PAYMENT_STATUSES);
    const paymentCreatedAt = createdAtMs(row);
    if (
      !convexId ||
      !userConvex ||
      !stripeSessionId ||
      amount === null ||
      !status ||
      !paymentCreatedAt
    ) {
      fail(counts, "payments", convexId ?? undefined, "invalid_row");
      await quarantine({
        table: "payments",
        convexId: convexId ?? undefined,
        reasonCode: "invalid_row",
      });
      continue;
    }
    const userId = userByConvex.get(userConvex);
    if (!userId) {
      fail(counts, "payments", convexId, "missing_user");
      await quarantine({
        table: "payments",
        convexId,
        reasonCode: "missing_user",
        safeDetail: safeId(userConvex),
      });
      continue;
    }
    const matchConvex = asString(row.matchId);
    let matchId: string | null = null;
    if (matchConvex) {
      matchId = matchByConvex.get(matchConvex) ?? null;
      if (!matchId) {
        skip(
          counts,
          "payments",
          convexId,
          "optional_match_missing",
          safeId(matchConvex)
        );
      }
    }
    if (dryRun || !prisma) {
      bump(counts, "payments", "inserted");
      continue;
    }
    try {
      const existing = await prisma.payment.findUnique({ where: { convexId } });
      await prisma.payment.upsert({
        where: { convexId },
        create: {
          convexId,
          userId,
          convexUserId: userConvex,
          stripeSessionId,
          amount,
          paymentType: oneOf(row.paymentType, PAYMENT_TYPES),
          registrationTier: oneOf(row.registrationTier, REG_TIERS),
          matchId,
          convexMatchId: matchConvex,
          status,
          paymentCreatedAt,
          convexCreatedAt: convexCreatedAt(row),
        },
        update: {
          amount,
          status,
          paymentType:
            oneOf(row.paymentType, PAYMENT_TYPES) ??
            existing?.paymentType ??
            null,
          registrationTier:
            oneOf(row.registrationTier, REG_TIERS) ??
            existing?.registrationTier ??
            null,
          matchId: preferExisting(existing?.matchId, matchId) as string | null,
          stripeSessionId: preferExisting(
            existing?.stripeSessionId,
            stripeSessionId
          ) as string,
        },
      });
      bump(counts, "payments", existing ? "updated" : "inserted");
    } catch (error) {
      fail(
        counts,
        "payments",
        convexId,
        error instanceof Error ? error.message : "upsert_failed"
      );
      await quarantine({
        table: "payments",
        convexId,
        reasonCode: "upsert_failed",
        safeDetail:
          error instanceof Error ? error.message.slice(0, 120) : undefined,
      });
    }
  }
}

async function importEvcProofs(
  args: CommonArgs & {
    userByConvex: Map<string, string>;
    profileByConvex: Map<string, string>;
  }
) {
  const { dryRun, prisma, userByConvex, profileByConvex, counts, quarantine } =
    args;
  const file = await findTableJsonl(args.inputPath, "evcPaymentProofs");
  if (!file) {
    counts.source.evcPaymentProofs = 0;
    return;
  }
  for await (const row of iterateTable(
    args.inputPath,
    "evcPaymentProofs",
    args.limit,
    counts
  )) {
    const convexId = requireId(row);
    const userConvex = asString(row.userId);
    const profileConvex = asString(row.profileId);
    const tier = oneOf(row.tier, REG_TIERS);
    const status = oneOf(row.status, EVC_STATUSES);
    const payerFullName = asString(row.payerFullName);
    const lastFourDigits = asString(row.lastFourDigits);
    const screenshotConvexId =
      asString(row.screenshotId) ?? asString(row.screenshotConvexId);
    const amountCents = asNumber(row.amountCents);
    const proofCreatedAt = createdAtMs(row);
    if (
      !convexId ||
      !userConvex ||
      !profileConvex ||
      !tier ||
      !status ||
      !payerFullName ||
      !lastFourDigits ||
      !screenshotConvexId ||
      amountCents === null ||
      !proofCreatedAt
    ) {
      fail(counts, "evcPaymentProofs", convexId ?? undefined, "invalid_row");
      await quarantine({
        table: "evcPaymentProofs",
        convexId: convexId ?? undefined,
        reasonCode: "invalid_row",
      });
      continue;
    }
    const userId = userByConvex.get(userConvex);
    const profileId = profileByConvex.get(profileConvex);
    if (!userId || !profileId) {
      fail(
        counts,
        "evcPaymentProofs",
        convexId,
        !userId ? "missing_user" : "missing_profile"
      );
      await quarantine({
        table: "evcPaymentProofs",
        convexId,
        reasonCode: !userId ? "missing_user" : "missing_profile",
      });
      continue;
    }
    const reviewedByConvex = asString(row.reviewedBy);
    let reviewedById: string | null = null;
    if (reviewedByConvex) {
      reviewedById = userByConvex.get(reviewedByConvex) ?? null;
      if (!reviewedById) {
        skip(
          counts,
          "evcPaymentProofs",
          convexId,
          "optional_reviewed_by_missing",
          safeId(reviewedByConvex)
        );
      }
    }
    if (dryRun || !prisma) {
      bump(counts, "evcPaymentProofs", "inserted");
      continue;
    }
    try {
      const existing = await prisma.evcPaymentProof.findUnique({
        where: { convexId },
      });
      await prisma.evcPaymentProof.upsert({
        where: { convexId },
        create: {
          convexId,
          userId,
          profileId,
          convexUserId: userConvex,
          convexProfileId: profileConvex,
          tier,
          payerFullName,
          lastFourDigits,
          screenshotConvexId,
          amountCents,
          status,
          proofCreatedAt,
          reviewedAt: msToDate(row.reviewedAt),
          reviewedById,
          convexReviewedBy: reviewedByConvex,
          rejectionReason: asString(row.rejectionReason),
          convexCreatedAt: convexCreatedAt(row),
        },
        update: {
          status,
          rejectionReason: preferExisting(
            existing?.rejectionReason,
            asString(row.rejectionReason)
          ) as string | null,
          reviewedById: preferExisting(existing?.reviewedById, reviewedById) as
            | string
            | null,
        },
      });
      bump(counts, "evcPaymentProofs", existing ? "updated" : "inserted");
    } catch (error) {
      fail(
        counts,
        "evcPaymentProofs",
        convexId,
        error instanceof Error ? error.message : "upsert_failed"
      );
      await quarantine({
        table: "evcPaymentProofs",
        convexId,
        reasonCode: "upsert_failed",
      });
    }
  }
}

async function importAnnouncements(
  args: CommonArgs & { userByConvex: Map<string, string> }
) {
  const { dryRun, prisma, userByConvex, counts, quarantine } = args;
  for await (const row of iterateTable(
    args.inputPath,
    "announcements",
    args.limit,
    counts
  )) {
    const convexId = requireId(row);
    const createdByConvex = asString(row.createdBy);
    const title = asString(row.title);
    const body = asString(row.body);
    const announcementCreatedAt = createdAtMs(row);
    if (
      !convexId ||
      !createdByConvex ||
      !title ||
      !body ||
      !announcementCreatedAt
    ) {
      fail(counts, "announcements", convexId ?? undefined, "invalid_row");
      await quarantine({
        table: "announcements",
        convexId: convexId ?? undefined,
        reasonCode: "invalid_row",
      });
      continue;
    }
    const createdById = userByConvex.get(createdByConvex);
    if (!createdById) {
      fail(counts, "announcements", convexId, "missing_user");
      await quarantine({
        table: "announcements",
        convexId,
        reasonCode: "missing_user",
      });
      continue;
    }
    if (dryRun || !prisma) {
      bump(counts, "announcements", "inserted");
      continue;
    }
    try {
      const existing = await prisma.announcement.findUnique({
        where: { convexId },
      });
      await prisma.announcement.upsert({
        where: { convexId },
        create: {
          convexId,
          title,
          body,
          announcementCreatedAt,
          createdById,
          convexCreatedBy: createdByConvex,
          scheduledFor: msToDate(row.scheduledFor),
          sentAt: msToDate(row.sentAt),
          audience: oneOf(row.audience, ANNOUNCEMENT_AUDIENCES),
          convexCreatedAt: convexCreatedAt(row),
        },
        update: {
          title: preferExisting(existing?.title, title) as string,
          body: preferExisting(existing?.body, body) as string,
          sentAt: preferExisting(existing?.sentAt, msToDate(row.sentAt)) as
            | Date
            | null,
          audience:
            oneOf(row.audience, ANNOUNCEMENT_AUDIENCES) ??
            existing?.audience ??
            null,
        },
      });
      bump(counts, "announcements", existing ? "updated" : "inserted");
    } catch (error) {
      fail(
        counts,
        "announcements",
        convexId,
        error instanceof Error ? error.message : "upsert_failed"
      );
      await quarantine({
        table: "announcements",
        convexId,
        reasonCode: "upsert_failed",
      });
    }
  }
}

async function importStaffInvites(
  args: CommonArgs & { userByConvex: Map<string, string> }
) {
  const { dryRun, prisma, userByConvex, counts, quarantine } = args;
  for await (const row of iterateTable(
    args.inputPath,
    "staffInvites",
    args.limit,
    counts
  )) {
    const convexId = requireId(row);
    const email = asString(row.email);
    const token = asString(row.token);
    const invitedByConvex = asString(row.invitedBy);
    const status = oneOf(row.status, STAFF_STATUSES);
    const role = oneOf(row.role, STAFF_ROLES) ?? "admin";
    const inviteCreatedAt = createdAtMs(row);
    const expiresAt = msToDate(row.expiresAt);
    if (
      !convexId ||
      !email ||
      !token ||
      !invitedByConvex ||
      !status ||
      !inviteCreatedAt ||
      !expiresAt
    ) {
      fail(counts, "staffInvites", convexId ?? undefined, "invalid_row");
      await quarantine({
        table: "staffInvites",
        convexId: convexId ?? undefined,
        reasonCode: "invalid_row",
      });
      continue;
    }
    const invitedById = userByConvex.get(invitedByConvex);
    if (!invitedById) {
      fail(counts, "staffInvites", convexId, "missing_user");
      await quarantine({
        table: "staffInvites",
        convexId,
        reasonCode: "missing_user",
      });
      continue;
    }
    const acceptedByConvex = asString(row.acceptedByUserId);
    let acceptedByUserId: string | null = null;
    if (acceptedByConvex) {
      acceptedByUserId = userByConvex.get(acceptedByConvex) ?? null;
      if (!acceptedByUserId) {
        skip(
          counts,
          "staffInvites",
          convexId,
          "optional_accepted_by_missing",
          safeId(acceptedByConvex)
        );
      }
    }
    if (dryRun || !prisma) {
      bump(counts, "staffInvites", "inserted");
      continue;
    }
    try {
      const existing = await prisma.staffInvite.findUnique({
        where: { convexId },
      });
      await prisma.staffInvite.upsert({
        where: { convexId },
        create: {
          convexId,
          email,
          token,
          role,
          invitedById,
          convexInvitedBy: invitedByConvex,
          status,
          inviteCreatedAt,
          expiresAt,
          acceptedAt: msToDate(row.acceptedAt),
          acceptedByUserId,
          convexAcceptedByUserId: acceptedByConvex,
          convexCreatedAt: convexCreatedAt(row),
        },
        update: {
          status,
          acceptedAt: preferExisting(
            existing?.acceptedAt,
            msToDate(row.acceptedAt)
          ) as Date | null,
          acceptedByUserId: preferExisting(
            existing?.acceptedByUserId,
            acceptedByUserId
          ) as string | null,
        },
      });
      bump(counts, "staffInvites", existing ? "updated" : "inserted");
    } catch (error) {
      fail(
        counts,
        "staffInvites",
        convexId,
        error instanceof Error ? error.message : "upsert_failed"
      );
      await quarantine({
        table: "staffInvites",
        convexId,
        reasonCode: "upsert_failed",
      });
    }
  }
}

async function importSupportContacts(
  args: CommonArgs & {
    userByConvex: Map<string, string>;
    supportContactByConvex: Map<string, string>;
  }
) {
  const {
    dryRun,
    prisma,
    userByConvex,
    supportContactByConvex,
    counts,
    quarantine,
  } = args;
  for await (const row of iterateTable(
    args.inputPath,
    "supportContacts",
    args.limit,
    counts
  )) {
    const convexId = requireId(row);
    const name = asString(row.name);
    const topic = oneOf(row.topic, SUPPORT_TOPICS);
    const subject = asString(row.subject);
    const message = asString(row.message);
    const source = oneOf(row.source, SUPPORT_SOURCES);
    const status = oneOf(row.status, SUPPORT_STATUSES);
    const contactCreatedAt = createdAtMs(row);
    if (
      !convexId ||
      !name ||
      !topic ||
      !subject ||
      !message ||
      !source ||
      !status ||
      !contactCreatedAt
    ) {
      fail(counts, "supportContacts", convexId ?? undefined, "invalid_row");
      await quarantine({
        table: "supportContacts",
        convexId: convexId ?? undefined,
        reasonCode: "invalid_row",
      });
      continue;
    }
    const userConvex = asString(row.userId);
    let userId: string | null = null;
    if (userConvex) {
      userId = userByConvex.get(userConvex) ?? null;
      if (!userId) {
        fail(counts, "supportContacts", convexId, "missing_user");
        await quarantine({
          table: "supportContacts",
          convexId,
          reasonCode: "missing_user",
          safeDetail: safeId(userConvex),
        });
        continue;
      }
    }
    const reviewedByConvex = asString(row.reviewedBy);
    let reviewedById: string | null = null;
    if (reviewedByConvex) {
      reviewedById = userByConvex.get(reviewedByConvex) ?? null;
      if (!reviewedById) {
        skip(
          counts,
          "supportContacts",
          convexId,
          "optional_reviewed_by_missing",
          safeId(reviewedByConvex)
        );
      }
    }
    if (dryRun || !prisma) {
      supportContactByConvex.set(convexId, `dry-${convexId}`);
      bump(counts, "supportContacts", "inserted");
      continue;
    }
    try {
      const existing = await prisma.supportContact.findUnique({
        where: { convexId },
      });
      const saved = await prisma.supportContact.upsert({
        where: { convexId },
        create: {
          convexId,
          userId,
          convexUserId: userConvex,
          name,
          email: asString(row.email),
          phone: asString(row.phone),
          topic,
          subject,
          message,
          imageConvexId: asString(row.imageId),
          source,
          status,
          adminNotes: asString(row.adminNotes),
          contactCreatedAt,
          reviewedAt: msToDate(row.reviewedAt),
          reviewedById,
          convexReviewedBy: reviewedByConvex,
          convexCreatedAt: convexCreatedAt(row),
        },
        update: {
          status,
          adminNotes: preferExisting(
            existing?.adminNotes,
            asString(row.adminNotes)
          ) as string | null,
          reviewedById: preferExisting(existing?.reviewedById, reviewedById) as
            | string
            | null,
          message: preferExisting(existing?.message, message) as string,
        },
      });
      supportContactByConvex.set(convexId, saved.id);
      bump(counts, "supportContacts", existing ? "updated" : "inserted");
    } catch (error) {
      fail(
        counts,
        "supportContacts",
        convexId,
        error instanceof Error ? error.message : "upsert_failed"
      );
      await quarantine({
        table: "supportContacts",
        convexId,
        reasonCode: "upsert_failed",
      });
    }
  }
}

async function importSupportMessages(
  args: CommonArgs & {
    userByConvex: Map<string, string>;
    supportContactByConvex: Map<string, string>;
  }
) {
  const {
    dryRun,
    prisma,
    userByConvex,
    supportContactByConvex,
    counts,
    quarantine,
  } = args;
  for await (const row of iterateTable(
    args.inputPath,
    "supportMessages",
    args.limit,
    counts
  )) {
    const convexId = requireId(row);
    const contactConvex = asString(row.contactId);
    const authorRole = oneOf(row.authorRole, SUPPORT_ROLES);
    const body = asString(row.body);
    const messageCreatedAt = createdAtMs(row);
    if (
      !convexId ||
      !contactConvex ||
      !authorRole ||
      !body ||
      !messageCreatedAt
    ) {
      fail(counts, "supportMessages", convexId ?? undefined, "invalid_row");
      await quarantine({
        table: "supportMessages",
        convexId: convexId ?? undefined,
        reasonCode: "invalid_row",
      });
      continue;
    }
    const contactId = supportContactByConvex.get(contactConvex);
    if (!contactId) {
      fail(counts, "supportMessages", convexId, "missing_contact");
      await quarantine({
        table: "supportMessages",
        convexId,
        reasonCode: "missing_contact",
      });
      continue;
    }
    const authorConvex = asString(row.authorUserId);
    let authorUserId: string | null = null;
    if (authorConvex) {
      authorUserId = userByConvex.get(authorConvex) ?? null;
      if (!authorUserId) {
        skip(
          counts,
          "supportMessages",
          convexId,
          "optional_author_missing",
          safeId(authorConvex)
        );
      }
    }
    if (dryRun || !prisma) {
      bump(counts, "supportMessages", "inserted");
      continue;
    }
    try {
      const existing = await prisma.supportMessage.findUnique({
        where: { convexId },
      });
      await prisma.supportMessage.upsert({
        where: { convexId },
        create: {
          convexId,
          contactId,
          convexContactId: contactConvex,
          authorUserId,
          convexAuthorUserId: authorConvex,
          authorRole,
          body,
          messageCreatedAt,
          convexCreatedAt: convexCreatedAt(row),
        },
        update: {
          body: preferExisting(existing?.body, body) as string,
          authorUserId: preferExisting(existing?.authorUserId, authorUserId) as
            | string
            | null,
        },
      });
      bump(counts, "supportMessages", existing ? "updated" : "inserted");
    } catch (error) {
      fail(
        counts,
        "supportMessages",
        convexId,
        error instanceof Error ? error.message : "upsert_failed"
      );
      await quarantine({
        table: "supportMessages",
        convexId,
        reasonCode: "upsert_failed",
      });
    }
  }
}

async function importMemberEmailLog(
  args: CommonArgs & { userByConvex: Map<string, string> }
) {
  const { dryRun, prisma, userByConvex, counts, quarantine } = args;
  for await (const row of iterateTable(
    args.inputPath,
    "memberEmailLog",
    args.limit,
    counts
  )) {
    const convexId = requireId(row);
    const userConvex = asString(row.userId);
    const kind = oneOf(row.kind, EMAIL_KINDS);
    const sentAt = msToDate(row.sentAt) ?? createdAtMs(row);
    if (!convexId || !userConvex || !kind || !sentAt) {
      fail(counts, "memberEmailLog", convexId ?? undefined, "invalid_row");
      await quarantine({
        table: "memberEmailLog",
        convexId: convexId ?? undefined,
        reasonCode: "invalid_row",
      });
      continue;
    }
    const userId = userByConvex.get(userConvex);
    if (!userId) {
      fail(counts, "memberEmailLog", convexId, "missing_user");
      await quarantine({
        table: "memberEmailLog",
        convexId,
        reasonCode: "missing_user",
      });
      continue;
    }
    if (dryRun || !prisma) {
      bump(counts, "memberEmailLog", "inserted");
      continue;
    }
    try {
      const existing = await prisma.memberEmailLog.findUnique({
        where: { convexId },
      });
      await prisma.memberEmailLog.upsert({
        where: { convexId },
        create: {
          convexId,
          userId,
          convexUserId: userConvex,
          kind,
          sentAt,
          convexCreatedAt: convexCreatedAt(row),
        },
        update: {
          kind,
          sentAt: preferExisting(existing?.sentAt, sentAt) as Date,
        },
      });
      bump(counts, "memberEmailLog", existing ? "updated" : "inserted");
    } catch (error) {
      fail(
        counts,
        "memberEmailLog",
        convexId,
        error instanceof Error ? error.message : "upsert_failed"
      );
      await quarantine({
        table: "memberEmailLog",
        convexId,
        reasonCode: "upsert_failed",
      });
    }
  }
}

async function importAuditLogs(
  args: CommonArgs & {
    userByConvex: Map<string, string>;
    profileByConvex: Map<string, string>;
  }
) {
  const { dryRun, prisma, userByConvex, profileByConvex, counts, quarantine } =
    args;
  for await (const row of iterateTable(
    args.inputPath,
    "auditLogs",
    args.limit,
    counts
  )) {
    const convexId = requireId(row);
    const actorConvex = asString(row.actorUserId);
    const action = asString(row.action);
    const loggedAt = createdAtMs(row);
    if (!convexId || !actorConvex || !action || !loggedAt) {
      fail(counts, "auditLogs", convexId ?? undefined, "invalid_row");
      await quarantine({
        table: "auditLogs",
        convexId: convexId ?? undefined,
        reasonCode: "invalid_row",
      });
      continue;
    }
    const actorUserId = userByConvex.get(actorConvex);
    if (!actorUserId) {
      fail(counts, "auditLogs", convexId, "missing_actor");
      await quarantine({
        table: "auditLogs",
        convexId,
        reasonCode: "missing_actor",
      });
      continue;
    }
    const targetUserConvex = asString(row.targetUserId);
    let targetUserId: string | null = null;
    if (targetUserConvex) {
      targetUserId = userByConvex.get(targetUserConvex) ?? null;
      if (!targetUserId) {
        skip(
          counts,
          "auditLogs",
          convexId,
          "optional_target_user_missing",
          safeId(targetUserConvex)
        );
      }
    }
    const targetProfileConvex = asString(row.targetProfileId);
    let targetProfileId: string | null = null;
    if (targetProfileConvex) {
      targetProfileId = profileByConvex.get(targetProfileConvex) ?? null;
      if (!targetProfileId) {
        skip(
          counts,
          "auditLogs",
          convexId,
          "optional_target_profile_missing",
          safeId(targetProfileConvex)
        );
      }
    }
    if (dryRun || !prisma) {
      bump(counts, "auditLogs", "inserted");
      continue;
    }
    try {
      const existing = await prisma.auditLog.findUnique({ where: { convexId } });
      await prisma.auditLog.upsert({
        where: { convexId },
        create: {
          convexId,
          actorUserId,
          convexActorUserId: actorConvex,
          action,
          targetUserId,
          convexTargetUserId: targetUserConvex,
          targetProfileId,
          convexTargetProfileId: targetProfileConvex,
          metadata: asString(row.metadata),
          loggedAt,
          convexCreatedAt: convexCreatedAt(row),
        },
        update: {
          action: preferExisting(existing?.action, action) as string,
          metadata: preferExisting(
            existing?.metadata,
            asString(row.metadata)
          ) as string | null,
          targetUserId: preferExisting(existing?.targetUserId, targetUserId) as
            | string
            | null,
          targetProfileId: preferExisting(
            existing?.targetProfileId,
            targetProfileId
          ) as string | null,
        },
      });
      bump(counts, "auditLogs", existing ? "updated" : "inserted");
    } catch (error) {
      fail(
        counts,
        "auditLogs",
        convexId,
        error instanceof Error ? error.message : "upsert_failed"
      );
      await quarantine({
        table: "auditLogs",
        convexId,
        reasonCode: "upsert_failed",
      });
    }
  }
}

async function importCompatibilityScores(
  args: CommonArgs & { userByConvex: Map<string, string> }
) {
  const { dryRun, prisma, userByConvex, counts, quarantine } = args;
  for await (const row of iterateTable(
    args.inputPath,
    "compatibilityScores",
    args.limit,
    counts
  )) {
    const convexId = requireId(row);
    const userAConvex = asString(row.userA);
    const userBConvex = asString(row.userB);
    const score = asNumber(row.score);
    if (!convexId || !userAConvex || !userBConvex || score === null) {
      fail(counts, "compatibilityScores", convexId ?? undefined, "invalid_row");
      await quarantine({
        table: "compatibilityScores",
        convexId: convexId ?? undefined,
        reasonCode: "invalid_row",
      });
      continue;
    }
    const userAId = userByConvex.get(userAConvex);
    const userBId = userByConvex.get(userBConvex);
    if (!userAId || !userBId) {
      fail(counts, "compatibilityScores", convexId, "missing_user");
      await quarantine({
        table: "compatibilityScores",
        convexId,
        reasonCode: "missing_user",
      });
      continue;
    }
    if (dryRun || !prisma) {
      bump(counts, "compatibilityScores", "inserted");
      continue;
    }
    try {
      const existing = await prisma.compatibilityScore.findUnique({
        where: { convexId },
      });
      await prisma.compatibilityScore.upsert({
        where: { convexId },
        create: {
          convexId,
          userAId,
          userBId,
          convexUserA: userAConvex,
          convexUserB: userBConvex,
          score,
          scoreVersion:
            typeof row.scoreVersion === "number" ? row.scoreVersion : 1,
          convexCreatedAt: convexCreatedAt(row),
        },
        update: {
          score,
          scoreVersion:
            typeof row.scoreVersion === "number"
              ? row.scoreVersion
              : existing?.scoreVersion ?? 1,
        },
      });
      bump(counts, "compatibilityScores", existing ? "updated" : "inserted");
    } catch (error) {
      fail(
        counts,
        "compatibilityScores",
        convexId,
        error instanceof Error ? error.message : "upsert_failed"
      );
      await quarantine({
        table: "compatibilityScores",
        convexId,
        reasonCode: "upsert_failed",
        safeDetail:
          error instanceof Error ? error.message.slice(0, 120) : undefined,
      });
    }
  }
}

async function importSiteMetrics(args: CommonArgs) {
  const { dryRun, prisma, counts, quarantine } = args;
  for await (const row of iterateTable(
    args.inputPath,
    "siteMetrics",
    args.limit,
    counts
  )) {
    const convexId = requireId(row);
    const key = asString(row.key) ?? "global";
    const metricsUpdatedAt =
      msToDate(row.updatedAt) ?? msToDate(row.metricsUpdatedAt);
    if (!convexId || !metricsUpdatedAt) {
      fail(counts, "siteMetrics", convexId ?? undefined, "invalid_row");
      await quarantine({
        table: "siteMetrics",
        convexId: convexId ?? undefined,
        reasonCode: "invalid_row",
      });
      continue;
    }
    const num = (v: unknown, fallback = 0) =>
      typeof v === "number" && Number.isFinite(v) ? v : fallback;
    if (dryRun || !prisma) {
      bump(counts, "siteMetrics", "inserted");
      continue;
    }
    try {
      const existing = await prisma.siteMetrics.findUnique({
        where: { convexId },
      });
      await prisma.siteMetrics.upsert({
        where: { convexId },
        create: {
          convexId,
          key,
          totalUsers: num(row.totalUsers),
          maleUsers: num(row.maleUsers),
          femaleUsers: num(row.femaleUsers),
          approvedMale: num(row.approvedMale),
          approvedFemale: num(row.approvedFemale),
          approvedTotal: num(row.approvedTotal),
          paidBasicMembers: num(row.paidBasicMembers),
          freeBasicWomen: num(row.freeBasicWomen),
          paidPremiumCount: num(row.paidPremiumCount),
          unpaidCount: num(row.unpaidCount),
          trialCount: num(row.trialCount),
          pendingApproval: num(row.pendingApproval),
          bannedUsers: num(row.bannedUsers),
          paidMembers: num(row.paidMembers),
          memberCount: num(row.memberCount),
          completeMembers: num(row.completeMembers),
          trialMembers: num(row.trialMembers),
          genderBreakdown: (row.genderBreakdown as object) ?? {},
          reviewBreakdown: (row.reviewBreakdown as object) ?? {},
          countryBreakdown: (row.countryBreakdown as object) ?? {},
          monthlySignups: (row.monthlySignups as object) ?? {},
          metricsUpdatedAt,
          rebuildScheduledAt: msToDate(row.rebuildScheduledAt),
          convexCreatedAt: convexCreatedAt(row),
        },
        update: {
          totalUsers: num(row.totalUsers, existing?.totalUsers ?? 0),
          maleUsers: num(row.maleUsers, existing?.maleUsers ?? 0),
          femaleUsers: num(row.femaleUsers, existing?.femaleUsers ?? 0),
          approvedMale: num(row.approvedMale, existing?.approvedMale ?? 0),
          approvedFemale: num(
            row.approvedFemale,
            existing?.approvedFemale ?? 0
          ),
          approvedTotal: num(row.approvedTotal, existing?.approvedTotal ?? 0),
          paidBasicMembers: num(
            row.paidBasicMembers,
            existing?.paidBasicMembers ?? 0
          ),
          freeBasicWomen: num(
            row.freeBasicWomen,
            existing?.freeBasicWomen ?? 0
          ),
          paidPremiumCount: num(
            row.paidPremiumCount,
            existing?.paidPremiumCount ?? 0
          ),
          unpaidCount: num(row.unpaidCount, existing?.unpaidCount ?? 0),
          trialCount: num(row.trialCount, existing?.trialCount ?? 0),
          pendingApproval: num(
            row.pendingApproval,
            existing?.pendingApproval ?? 0
          ),
          bannedUsers: num(row.bannedUsers, existing?.bannedUsers ?? 0),
          paidMembers: num(row.paidMembers, existing?.paidMembers ?? 0),
          memberCount: num(row.memberCount, existing?.memberCount ?? 0),
          completeMembers: num(
            row.completeMembers,
            existing?.completeMembers ?? 0
          ),
          trialMembers: num(row.trialMembers, existing?.trialMembers ?? 0),
          genderBreakdown: (row.genderBreakdown as object) ??
            (existing?.genderBreakdown as object) ??
            {},
          reviewBreakdown: (row.reviewBreakdown as object) ??
            (existing?.reviewBreakdown as object) ??
            {},
          countryBreakdown: (row.countryBreakdown as object) ??
            (existing?.countryBreakdown as object) ??
            {},
          monthlySignups: (row.monthlySignups as object) ??
            (existing?.monthlySignups as object) ??
            {},
          metricsUpdatedAt,
        },
      });
      bump(counts, "siteMetrics", existing ? "updated" : "inserted");
    } catch (error) {
      fail(
        counts,
        "siteMetrics",
        convexId,
        error instanceof Error ? error.message : "upsert_failed"
      );
      await quarantine({
        table: "siteMetrics",
        convexId,
        reasonCode: "upsert_failed",
      });
    }
  }
}

async function importUserUploads(
  args: CommonArgs & { userByConvex: Map<string, string> }
) {
  const { dryRun, prisma, userByConvex, counts, quarantine } = args;
  for await (const row of iterateTable(
    args.inputPath,
    "userUploads",
    args.limit,
    counts
  )) {
    const convexId = requireId(row);
    const userConvex = asString(row.userId);
    const storageId = asString(row.storageId);
    const uploadedAt = createdAtMs(row);
    if (!convexId || !userConvex || !storageId || !uploadedAt) {
      fail(counts, "userUploads", convexId ?? undefined, "invalid_row");
      await quarantine({
        table: "userUploads",
        convexId: convexId ?? undefined,
        reasonCode: "invalid_row",
      });
      continue;
    }
    const userId = userByConvex.get(userConvex);
    if (!userId) {
      fail(counts, "userUploads", convexId, "missing_user");
      await quarantine({
        table: "userUploads",
        convexId,
        reasonCode: "missing_user",
      });
      continue;
    }
    if (dryRun || !prisma) {
      bump(counts, "userUploads", "inserted");
      continue;
    }
    try {
      const existing = await prisma.userUpload.findUnique({
        where: { convexId },
      });
      await prisma.userUpload.upsert({
        where: { convexId },
        create: {
          convexId,
          userId,
          convexUserId: userConvex,
          convexStorageId: storageId,
          uploadedAt,
          convexCreatedAt: convexCreatedAt(row),
        },
        update: {
          uploadedAt: preferExisting(existing?.uploadedAt, uploadedAt) as Date,
          convexStorageId: preferExisting(
            existing?.convexStorageId,
            storageId
          ) as string,
        },
      });
      bump(counts, "userUploads", existing ? "updated" : "inserted");
    } catch (error) {
      fail(
        counts,
        "userUploads",
        convexId,
        error instanceof Error ? error.message : "upsert_failed"
      );
      await quarantine({
        table: "userUploads",
        convexId,
        reasonCode: "upsert_failed",
      });
    }
  }
}

export { DOMAIN_TABLES };
