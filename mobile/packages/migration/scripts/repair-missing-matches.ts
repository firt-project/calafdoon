/**
 * One-off repair for matches that failed without pairKey (+ dependent conv/msg).
 * DATABASE_URL=… npx tsx scripts/repair-missing-matches.ts --input=/abs/extracted
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

function makePairKey(a: string, b: string) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

async function* readJsonl(file: string) {
  const text = await readFile(file, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    yield JSON.parse(t) as Record<string, unknown>;
  }
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asBoolean(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function msToDate(v: unknown): Date | null {
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v);
  return null;
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

async function main() {
  const inputArg = process.argv.find((a) => a.startsWith("--input="));
  const input = inputArg?.slice("--input=".length);
  if (!input || !process.env.DATABASE_URL) {
    throw new Error("Need --input=… and DATABASE_URL");
  }

  const base = process.env.DATABASE_URL;
  const url =
    base +
    (base.includes("?") ? "&" : "?") +
    "connection_limit=5&pool_timeout=60&connect_timeout=30";

  const prisma = new PrismaClient({ datasources: { db: { url } } });

  const users = await prisma.user.findMany({
    select: { id: true, convexId: true },
  });
  const userByConvex = new Map(users.map((u) => [u.convexId, u.id]));

  let matchesInserted = 0;
  let matchesUpdated = 0;
  let matchesFailed = 0;

  for await (const row of readJsonl(
    path.join(input, "matches", "documents.jsonl")
  )) {
    const convexId = asString(row._id);
    const userAConvex = asString(row.userA);
    const userBConvex = asString(row.userB);
    const score = asNumber(row.score);
    const status = asString(row.status);
    const chatUnlocked = asBoolean(row.chatUnlocked);
    if (
      !convexId ||
      !userAConvex ||
      !userBConvex ||
      score === null ||
      !status ||
      chatUnlocked === null
    ) {
      matchesFailed += 1;
      continue;
    }
    const userAId = userByConvex.get(userAConvex);
    const userBId = userByConvex.get(userBConvex);
    if (!userAId || !userBId) {
      matchesFailed += 1;
      continue;
    }
    const pairKey = makePairKey(userAId, userBId);
    try {
      const existing = await prisma.match.findUnique({ where: { convexId } });
      await prisma.match.upsert({
        where: { convexId },
        create: {
          convexId,
          pairKey,
          userAId,
          userBId,
          convexUserA: userAConvex,
          convexUserB: userBConvex,
          score,
          status: status as "active" | "archived" | "unmatched",
          chatUnlocked,
          seenAtByUser: (row.seenAtByUser as object) ?? undefined,
          archivedAt: msToDate(row.archivedAt),
          convexCreatedAt: msToDate(row._creationTime),
        },
        update: {
          pairKey,
          score,
          status: status as "active" | "archived" | "unmatched",
          chatUnlocked,
          seenAtByUser: (row.seenAtByUser as object) ?? undefined,
          archivedAt: msToDate(row.archivedAt),
        },
      });
      if (existing) matchesUpdated += 1;
      else matchesInserted += 1;
    } catch (e) {
      matchesFailed += 1;
      console.warn(
        "match fail",
        convexId,
        e instanceof Error ? e.message.slice(0, 200) : e
      );
    }
  }

  const matchRows = await prisma.match.findMany({
    select: { id: true, convexId: true, convexUserA: true, convexUserB: true },
  });
  const matchByConvex = new Map(matchRows.map((m) => [m.convexId, m]));

  let convOk = 0;
  let convFail = 0;
  for await (const row of readJsonl(
    path.join(input, "conversations", "documents.jsonl")
  )) {
    const convexId = asString(row._id);
    const matchConvex = asString(row.matchId);
    const participants = stringArray(row.participants);
    const lastMessageAt = msToDate(row.lastMessageAt);
    if (!convexId || !matchConvex || !lastMessageAt) {
      convFail += 1;
      continue;
    }
    const match = matchByConvex.get(matchConvex);
    if (!match) {
      convFail += 1;
      continue;
    }
    try {
      await prisma.conversation.upsert({
        where: { convexId },
        create: {
          convexId,
          matchId: match.id,
          convexMatchId: matchConvex,
          participantConvexIds: participants,
          participantUserIds: participants
            .map((p) => userByConvex.get(p))
            .filter((x): x is string => Boolean(x)),
          lastMessageAt,
          unreadByUser: (row.unreadByUser as object) ?? undefined,
          convexCreatedAt: msToDate(row._creationTime),
        },
        update: {
          lastMessageAt,
          participantConvexIds: participants,
          unreadByUser: (row.unreadByUser as object) ?? undefined,
        },
      });
      convOk += 1;
    } catch (e) {
      convFail += 1;
      console.warn(
        "conv fail",
        convexId,
        e instanceof Error ? e.message.slice(0, 200) : e
      );
    }
  }

  const convRows = await prisma.conversation.findMany({
    select: { id: true, convexId: true },
  });
  const convByConvex = new Map(convRows.map((c) => [c.convexId, c.id]));

  let msgOk = 0;
  let msgFail = 0;
  for await (const row of readJsonl(
    path.join(input, "messages", "documents.jsonl")
  )) {
    const convexId = asString(row._id);
    const conversationConvex = asString(row.conversationId);
    const senderConvex = asString(row.senderId);
    const body = asString(row.message) ?? asString(row.body);
    const read = asBoolean(row.read);
    const messageCreatedAt =
      msToDate(row._creationTime) ?? msToDate(row.createdAt);
    if (
      !convexId ||
      !conversationConvex ||
      !senderConvex ||
      body === null ||
      read === null ||
      !messageCreatedAt
    ) {
      msgFail += 1;
      continue;
    }
    const conversationId = convByConvex.get(conversationConvex);
    const senderId = userByConvex.get(senderConvex);
    if (!conversationId || !senderId) {
      msgFail += 1;
      continue;
    }
    try {
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
          convexCreatedAt: msToDate(row._creationTime),
        },
        update: {
          body,
          read,
          imageConvexId: asString(row.imageId),
        },
      });
      msgOk += 1;
    } catch (e) {
      msgFail += 1;
      console.warn(
        "msg fail",
        convexId,
        e instanceof Error ? e.message.slice(0, 200) : e
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        matchesInserted,
        matchesUpdated,
        matchesFailed,
        convOk,
        convFail,
        msgOk,
        msgFail,
        counts: {
          matches: await prisma.match.count(),
          conversations: await prisma.conversation.count(),
          messages: await prisma.message.count(),
          payments: await prisma.payment.count(),
          scores: await prisma.compatibilityScore.count(),
        },
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
