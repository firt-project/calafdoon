/**
 * One-off delta builder: copies only rows missing from the target Postgres
 * (by convexId) into a filtered export directory, so import-domain doesn't
 * re-upsert thousands of unchanged rows over a remote connection.
 *
 * Tiny tables are copied in full so field updates still propagate.
 *
 * Usage:
 *   DATABASE_URL=... tsx src/build-delta-export.ts <exportRoot> <outRoot>
 */
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const FULL_COPY_TABLES = [
  "blocks",
  "reports",
  "matches",
  "conversations",
  "evcPaymentProofs",
  "announcements",
  "staffInvites",
  "siteMetrics",
] as const;

// export table name -> prisma model accessor
const DELTA_TABLES: Record<string, string> = {
  likes: "like",
  messages: "message",
  notifications: "notification",
  payments: "payment",
  supportContacts: "supportContact",
  supportMessages: "supportMessage",
  memberEmailLog: "memberEmailLog",
  auditLogs: "auditLog",
  compatibilityScores: "compatibilityScore",
  userUploads: "userUpload",
};

async function readLines(file: string): Promise<string[]> {
  const rl = readline.createInterface({
    input: createReadStream(file),
    crlfDelay: Infinity,
  });
  const lines: string[] = [];
  for await (const line of rl) {
    if (line.trim().length > 0) lines.push(line);
  }
  return lines;
}

async function main() {
  const [exportRoot, outRoot] = process.argv.slice(2);
  if (!exportRoot || !outRoot) {
    console.error("usage: build-delta-export <exportRoot> <outRoot>");
    process.exit(1);
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  const summary: Record<string, { total: number; kept: number }> = {};

  for (const table of FULL_COPY_TABLES) {
    const src = path.join(exportRoot, table, "documents.jsonl");
    let lines: string[] = [];
    try {
      lines = await readLines(src);
    } catch {
      continue;
    }
    const dest = path.join(outRoot, table);
    await mkdir(dest, { recursive: true });
    await writeFile(
      path.join(dest, "documents.jsonl"),
      lines.join("\n") + (lines.length ? "\n" : "")
    );
    summary[table] = { total: lines.length, kept: lines.length };
  }

  for (const [table, model] of Object.entries(DELTA_TABLES)) {
    const src = path.join(exportRoot, table, "documents.jsonl");
    let lines: string[] = [];
    try {
      lines = await readLines(src);
    } catch {
      continue;
    }
    let existing = new Set<string>();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: Array<{ convexId: string | null }> = await (prisma as any)[
        model
      ].findMany({ select: { convexId: true } });
      existing = new Set(
        rows.map((r) => r.convexId).filter((v): v is string => !!v)
      );
    } catch (error) {
      console.warn(
        `[warn] could not load convexIds for ${table}, copying in full:`,
        error instanceof Error ? error.message.split("\n")[0] : error
      );
    }
    const kept = lines.filter((line) => {
      try {
        const row = JSON.parse(line) as { _id?: string };
        return !row._id || !existing.has(row._id);
      } catch {
        return true;
      }
    });
    const dest = path.join(outRoot, table);
    await mkdir(dest, { recursive: true });
    await writeFile(
      path.join(dest, "documents.jsonl"),
      kept.join("\n") + (kept.length ? "\n" : "")
    );
    summary[table] = { total: lines.length, kept: kept.length };
  }

  await prisma.$disconnect();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
