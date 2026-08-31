import { writeFile } from "node:fs/promises";
import path from "node:path";
import { countJsonl, findTableJsonl, pathExists } from "../lib/jsonl.js";

export type DomainValidationResult = {
  generatedAt: string;
  criticalFailures: string[];
  warnings: string[];
  counts: Record<string, number>;
  sourceMessageCount: number | null;
  skippedListed: number;
  ok: boolean;
};

async function loadPrismaClient() {
  const mod = await import("@prisma/client");
  return mod.PrismaClient;
}

async function countDupGroups(
  prisma: {
    $queryRawUnsafe: <T>(query: string) => Promise<T>;
  },
  sql: string
): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ c: bigint }[]>(sql);
  return Number(rows[0]?.c ?? 0);
}

export async function runValidateDomain(opts: {
  databaseUrl?: string;
  outDir?: string;
  inputPath?: string;
  skippedRecordCount?: number;
}): Promise<{
  result: DomainValidationResult;
  markdown: string;
  exitCode: number;
}> {
  const databaseUrl = opts.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for domain validation");
  }

  const PrismaClient = await loadPrismaClient();
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  const criticalFailures: string[] = [];
  const warnings: string[] = [];

  try {
    const [
      likes,
      blocks,
      reports,
      matches,
      conversations,
      messages,
      notifications,
      payments,
      evcProofs,
      announcements,
      staffInvites,
      supportContacts,
      supportMessages,
      memberEmailLogs,
      auditLogs,
      compatibilityScores,
      siteMetrics,
      userUploads,
    ] = await Promise.all([
      prisma.like.count(),
      prisma.block.count(),
      prisma.report.count(),
      prisma.match.count(),
      prisma.conversation.count(),
      prisma.message.count(),
      prisma.notification.count(),
      prisma.payment.count(),
      prisma.evcPaymentProof.count(),
      prisma.announcement.count(),
      prisma.staffInvite.count(),
      prisma.supportContact.count(),
      prisma.supportMessage.count(),
      prisma.memberEmailLog.count(),
      prisma.auditLog.count(),
      prisma.compatibilityScore.count(),
      prisma.siteMetrics.count(),
      prisma.userUpload.count(),
    ]);

    const [
      dupLikeConvex,
      dupBlockConvex,
      dupMatchConvex,
      dupConvConvex,
      dupMsgConvex,
      dupPayConvex,
      dupCompatConvex,
      dupUploadConvex,
      orphanLikes,
      orphanBlocks,
      orphanReports,
      orphanMatches,
      orphanConversations,
      orphanMessages,
      orphanMessageSenders,
      orphanNotifications,
      orphanPayments,
      orphanAnnouncements,
      orphanStaff,
      orphanSupportContacts,
      orphanSupportMessages,
      orphanEmails,
      orphanAudits,
      orphanCompat,
      orphanUploads,
      orphanEvcUsers,
      orphanEvcProfiles,
      orphanProfilesOnAudit,
      dupLikePairs,
      dupBlockPairs,
      dupMatchPairs,
      dupStripe,
      dupCompatPairs,
      paymentStatusNull,
      evcStatusNull,
      conversationMismatch,
    ] = await Promise.all([
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM (SELECT convex_id FROM likes GROUP BY convex_id HAVING COUNT(*) > 1) t`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM (SELECT convex_id FROM blocks GROUP BY convex_id HAVING COUNT(*) > 1) t`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM (SELECT convex_id FROM matches GROUP BY convex_id HAVING COUNT(*) > 1) t`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM (SELECT convex_id FROM conversations GROUP BY convex_id HAVING COUNT(*) > 1) t`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM (SELECT convex_id FROM messages GROUP BY convex_id HAVING COUNT(*) > 1) t`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM (SELECT convex_id FROM payments GROUP BY convex_id HAVING COUNT(*) > 1) t`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM (SELECT convex_id FROM compatibility_scores GROUP BY convex_id HAVING COUNT(*) > 1) t`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM (SELECT convex_id FROM user_uploads GROUP BY convex_id HAVING COUNT(*) > 1) t`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM likes l LEFT JOIN users u1 ON u1.id = l.from_user_id LEFT JOIN users u2 ON u2.id = l.to_user_id WHERE u1.id IS NULL OR u2.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM blocks b LEFT JOIN users u1 ON u1.id = b.blocker_id LEFT JOIN users u2 ON u2.id = b.blocked_id WHERE u1.id IS NULL OR u2.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM reports r LEFT JOIN users u1 ON u1.id = r.reporter_id LEFT JOIN users u2 ON u2.id = r.reported_user_id WHERE u1.id IS NULL OR u2.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM matches m LEFT JOIN users u1 ON u1.id = m.user_a_id LEFT JOIN users u2 ON u2.id = m.user_b_id WHERE u1.id IS NULL OR u2.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM conversations c LEFT JOIN matches m ON m.id = c.match_id WHERE m.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM messages msg LEFT JOIN conversations c ON c.id = msg.conversation_id WHERE c.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM messages msg LEFT JOIN users u ON u.id = msg.sender_id WHERE u.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM notifications n LEFT JOIN users u ON u.id = n.user_id WHERE u.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM payments p LEFT JOIN users u ON u.id = p.user_id WHERE u.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM announcements a LEFT JOIN users u ON u.id = a.created_by_id WHERE u.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM staff_invites s LEFT JOIN users u ON u.id = s.invited_by_id WHERE u.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM support_contacts sc LEFT JOIN users u ON u.id = sc.user_id WHERE sc.user_id IS NOT NULL AND u.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM support_messages sm LEFT JOIN support_contacts sc ON sc.id = sm.contact_id WHERE sc.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM member_email_logs e LEFT JOIN users u ON u.id = e.user_id WHERE u.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id WHERE u.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM compatibility_scores cs LEFT JOIN users u1 ON u1.id = cs.user_a_id LEFT JOIN users u2 ON u2.id = cs.user_b_id WHERE u1.id IS NULL OR u2.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM user_uploads uu LEFT JOIN users u ON u.id = uu.user_id WHERE u.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM evc_payment_proofs e LEFT JOIN users u ON u.id = e.user_id WHERE u.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM evc_payment_proofs e LEFT JOIN profiles p ON p.id = e.profile_id WHERE p.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM audit_logs a LEFT JOIN profiles p ON p.id = a.target_profile_id WHERE a.target_profile_id IS NOT NULL AND p.id IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM (SELECT from_user_id, to_user_id FROM likes GROUP BY from_user_id, to_user_id HAVING COUNT(*) > 1) t`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM (SELECT blocker_id, blocked_id FROM blocks GROUP BY blocker_id, blocked_id HAVING COUNT(*) > 1) t`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM (SELECT user_a_id, user_b_id FROM matches GROUP BY user_a_id, user_b_id HAVING COUNT(*) > 1) t`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM (SELECT stripe_session_id FROM payments GROUP BY stripe_session_id HAVING COUNT(*) > 1) t`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM (SELECT user_a_id, user_b_id FROM compatibility_scores GROUP BY user_a_id, user_b_id HAVING COUNT(*) > 1) t`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM payments WHERE status IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c FROM evc_payment_proofs WHERE status IS NULL`
      ),
      countDupGroups(
        prisma,
        `SELECT COUNT(*)::bigint AS c
         FROM conversations c
         JOIN matches m ON m.id = c.match_id
         WHERE NOT (
           cardinality(c.participant_convex_ids) = 2
           AND m.convex_user_a = ANY(c.participant_convex_ids)
           AND m.convex_user_b = ANY(c.participant_convex_ids)
         )`
      ),
    ]);

    let sourceMessageCount: number | null = null;
    if (opts.inputPath && (await pathExists(opts.inputPath))) {
      const msgFile = await findTableJsonl(opts.inputPath, "messages");
      if (msgFile) sourceMessageCount = await countJsonl(msgFile);
    }

    const counts = {
      likes,
      blocks,
      reports,
      matches,
      conversations,
      messages,
      notifications,
      payments,
      evcPaymentProofs: evcProofs,
      announcements,
      staffInvites,
      supportContacts,
      supportMessages,
      memberEmailLogs,
      auditLogs,
      compatibilityScores,
      siteMetrics,
      userUploads,
      duplicateConvexLikes: dupLikeConvex,
      duplicateConvexBlocks: dupBlockConvex,
      duplicateConvexMatches: dupMatchConvex,
      duplicateConvexConversations: dupConvConvex,
      duplicateConvexMessages: dupMsgConvex,
      duplicateConvexPayments: dupPayConvex,
      duplicateConvexCompatScores: dupCompatConvex,
      duplicateConvexUploads: dupUploadConvex,
      orphanLikes,
      orphanBlocks,
      orphanReports,
      orphanMatches,
      orphanConversations,
      orphanMessages,
      orphanMessageSenders,
      orphanNotifications,
      orphanPayments,
      orphanAnnouncements,
      orphanStaffInvites: orphanStaff,
      orphanSupportContacts,
      orphanSupportMessages,
      orphanMemberEmailLogs: orphanEmails,
      orphanAuditActors: orphanAudits,
      orphanCompatScores: orphanCompat,
      orphanUserUploads: orphanUploads,
      orphanEvcUsers,
      orphanEvcProfiles,
      orphanAuditProfiles: orphanProfilesOnAudit,
      duplicateLikePairs: dupLikePairs,
      duplicateBlockPairs: dupBlockPairs,
      duplicateMatchPairs: dupMatchPairs,
      duplicateStripeSessionIds: dupStripe,
      duplicateCompatPairs: dupCompatPairs,
      paymentsMissingStatus: paymentStatusNull,
      evcMissingStatus: evcStatusNull,
      conversationParticipantMismatches: conversationMismatch,
      sourceMessageCount: sourceMessageCount ?? -1,
      skippedListed: opts.skippedRecordCount ?? 0,
    };

    const criticalChecks: [string, number][] = [
      ["duplicate_convex_likes", dupLikeConvex],
      ["duplicate_convex_blocks", dupBlockConvex],
      ["duplicate_convex_matches", dupMatchConvex],
      ["duplicate_convex_conversations", dupConvConvex],
      ["duplicate_convex_messages", dupMsgConvex],
      ["duplicate_convex_payments", dupPayConvex],
      ["duplicate_convex_compat", dupCompatConvex],
      ["duplicate_convex_uploads", dupUploadConvex],
      ["orphan_likes", orphanLikes],
      ["orphan_blocks", orphanBlocks],
      ["orphan_reports", orphanReports],
      ["orphan_matches", orphanMatches],
      ["orphan_conversations", orphanConversations],
      ["orphan_messages", orphanMessages],
      ["orphan_message_senders", orphanMessageSenders],
      ["orphan_notifications", orphanNotifications],
      ["orphan_payments", orphanPayments],
      ["orphan_announcements", orphanAnnouncements],
      ["orphan_staff_invites", orphanStaff],
      ["orphan_support_contacts", orphanSupportContacts],
      ["orphan_support_messages", orphanSupportMessages],
      ["orphan_member_email_logs", orphanEmails],
      ["orphan_audit_actors", orphanAudits],
      ["orphan_compat_scores", orphanCompat],
      ["orphan_user_uploads", orphanUploads],
      ["orphan_evc_users", orphanEvcUsers],
      ["orphan_evc_profiles", orphanEvcProfiles],
      ["orphan_audit_profiles", orphanProfilesOnAudit],
      ["duplicate_like_pairs", dupLikePairs],
      ["duplicate_block_pairs", dupBlockPairs],
      ["duplicate_match_pairs", dupMatchPairs],
      ["duplicate_stripe_session_ids", dupStripe],
      ["duplicate_compat_pairs", dupCompatPairs],
      ["payments_missing_status", paymentStatusNull],
      ["evc_missing_status", evcStatusNull],
      ["conversation_participant_mismatches", conversationMismatch],
    ];

    for (const [name, value] of criticalChecks) {
      if (value > 0) criticalFailures.push(`${name}=${value}`);
    }

    if (
      sourceMessageCount !== null &&
      sourceMessageCount >= 0 &&
      messages !== sourceMessageCount
    ) {
      // Message count may be lower if some were quarantined — warn unless equal
      if (messages > sourceMessageCount) {
        criticalFailures.push(
          `message_count_exceeds_source db=${messages} source=${sourceMessageCount}`
        );
      } else {
        warnings.push(
          `message_count_below_source db=${messages} source=${sourceMessageCount} (quarantined/skipped may explain)`
        );
      }
    }

    const result: DomainValidationResult = {
      generatedAt: new Date().toISOString(),
      criticalFailures,
      warnings,
      counts,
      sourceMessageCount,
      skippedListed: opts.skippedRecordCount ?? 0,
      ok: criticalFailures.length === 0,
    };

    const markdown = [
      "# Phase 2 domain validation report",
      "",
      `- Generated: ${result.generatedAt}`,
      `- Status: ${result.ok ? "PASS" : "FAIL"}`,
      "",
      "## Counts",
      "",
      ...Object.entries(counts).map(([k, v]) => `- ${k}: ${v}`),
      "",
      "## Critical failures",
      "",
      ...(criticalFailures.length
        ? criticalFailures.map((f) => `- ${f}`)
        : ["- none"]),
      "",
      "## Warnings",
      "",
      ...(warnings.length ? warnings.map((w) => `- ${w}`) : ["- none"]),
      "",
    ].join("\n");

    if (opts.outDir) {
      await writeFile(
        path.join(opts.outDir, "validation-domain-report.json"),
        JSON.stringify(result, null, 2),
        "utf8"
      );
      await writeFile(
        path.join(opts.outDir, "validation-domain-report.md"),
        markdown,
        "utf8"
      );
    }

    return {
      result,
      markdown,
      exitCode: result.ok ? 0 : 1,
    };
  } finally {
    await prisma.$disconnect();
  }
}
