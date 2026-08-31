/**
 * Phase 7 parity report against local migrated production copy.
 * Redacts PII — prints counts and structural checks only.
 */
import { PrismaClient } from "@prisma/client";
import { readUnreadCount } from "../src/chat/unread";

const prisma = new PrismaClient();

function redactId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

async function main() {
  const conversationCount = await prisma.conversation.count();
  const messageCount = await prisma.message.count();
  const notificationCount = await prisma.notification.count();

  const orphanedMessages = await prisma.$queryRaw<
    Array<{ count: bigint }>
  >`SELECT COUNT(*)::bigint AS count FROM messages m
     LEFT JOIN conversations c ON c.id = m.conversation_id
     WHERE c.id IS NULL`;

  const orphanedConversations = await prisma.$queryRaw<
    Array<{ count: bigint }>
  >`SELECT COUNT(*)::bigint AS count FROM conversations c
     LEFT JOIN matches m ON m.id = c.match_id
     WHERE m.id IS NULL`;

  const typeCoverage = await prisma.notification.groupBy({
    by: ["type"],
    _count: true,
  });

  const dupIdem = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM (
      SELECT conversation_id, idempotency_key
      FROM messages
      WHERE idempotency_key IS NOT NULL
      GROUP BY conversation_id, idempotency_key
      HAVING COUNT(*) > 1
    ) t`;

  const dupSource = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM (
      SELECT source_key FROM notifications
      WHERE source_key IS NOT NULL
      GROUP BY source_key
      HAVING COUNT(*) > 1
    ) t`;

  const sampleConversations = await prisma.conversation.findMany({
    take: 10,
    orderBy: { lastMessageAt: "desc" },
    include: {
      match: true,
      messages: {
        orderBy: [{ messageCreatedAt: "asc" }, { id: "asc" }],
        take: 5,
        select: {
          id: true,
          senderId: true,
          read: true,
          messageCreatedAt: true,
          imageMediaId: true,
          body: true,
        },
      },
    },
  });

  let unreadInconsistencies = 0;
  let orderingOk = 0;
  let privateImageExposure = 0;

  const sampleParity = [];
  for (const c of sampleConversations) {
    const msgs = await prisma.message.findMany({
      where: { conversationId: c.id },
      orderBy: [{ messageCreatedAt: "asc" }, { id: "asc" }],
      select: {
        messageCreatedAt: true,
        id: true,
        imageMediaId: true,
        body: true,
      },
    });
    let ordered = true;
    for (let i = 1; i < msgs.length; i++) {
      const prev = msgs[i - 1]!;
      const cur = msgs[i]!;
      if (
        cur.messageCreatedAt < prev.messageCreatedAt ||
        (cur.messageCreatedAt.getTime() === prev.messageCreatedAt.getTime() &&
          cur.id < prev.id)
      ) {
        ordered = false;
        break;
      }
    }
    if (ordered) orderingOk++;

    for (const m of msgs) {
      if (m.body?.includes("http://") || m.body?.includes("https://")) {
        // Heuristic: raw MinIO/public URLs should not be stored
        if (/minio|9000|hel-chat/i.test(m.body)) privateImageExposure++;
      }
    }

    const aUnread = readUnreadCount(
      c.unreadByUser,
      c.match.userAId,
      c.match.convexUserA
    );
    const bUnread = readUnreadCount(
      c.unreadByUser,
      c.match.userBId,
      c.match.convexUserB
    );
    if (aUnread < 0 || bUnread < 0) unreadInconsistencies++;

    sampleParity.push({
      conversationId: redactId(c.id),
      matchId: redactId(c.matchId),
      messageSample: msgs.length,
      unreadA: aUnread,
      unreadB: bUnread,
      lastMessageAt: c.lastMessageAt.toISOString(),
      participants: c.participantUserIds.map(redactId),
    });
  }

  const report = {
    phase: 7,
    conversationCount,
    messageCount,
    notificationCount,
    orphanedMessages: Number(orphanedMessages[0]?.count ?? 0),
    orphanedConversations: Number(orphanedConversations[0]?.count ?? 0),
    unreadConsistencyIssues: unreadInconsistencies,
    messageOrderingOkSample: `${orderingOk}/${sampleConversations.length}`,
    notificationTypeCoverage: Object.fromEntries(
      typeCoverage.map((t) => [t.type, t._count])
    ),
    duplicateIdempotencyKeys: Number(dupIdem[0]?.count ?? 0),
    duplicateNotificationSourceKeys: Number(dupSource[0]?.count ?? 0),
    privateImageExposureHeuristics: privateImageExposure,
    sampleParity,
  };

  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();

  if (
    report.conversationCount !== 19 ||
    report.messageCount < 68 ||
    report.notificationCount < 1410
  ) {
    console.error("Parity count mismatch vs expected migrated baseline");
    process.exitCode = 1;
  }
  if (report.orphanedMessages > 0 || report.orphanedConversations > 0) {
    console.error("Orphaned chat rows detected");
    process.exitCode = 1;
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
