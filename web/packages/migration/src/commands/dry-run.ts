import { writeFile } from "node:fs/promises";
import path from "node:path";
import { classifyPasswordHash, redactEmail } from "../crypto/lucia-scrypt.js";
import { normalizeAuthEmail } from "../lib/args.js";
import {
  detectReferences,
  findTableJsonl,
  pathExists,
  readJsonl,
} from "../lib/jsonl.js";

type DryIssue = {
  table: string;
  convexId?: string;
  code: string;
  detail: string;
};

const CORE_TABLES = ["users", "authAccounts", "profiles", "preferences"] as const;

export async function runDryRun(opts: {
  inputPath: string;
  limit?: number;
  outDir?: string;
}) {
  const { inputPath, limit, outDir } = opts;
  if (!(await pathExists(inputPath))) {
    throw new Error(`Export path does not exist: ${inputPath}`);
  }

  const wouldImport: Record<string, number> = {};
  const issues: DryIssue[] = [];
  const seenConvexIds = new Map<string, string>();
  const seenEmails = new Map<string, string>();
  const userIds = new Set<string>();
  const profileUserIds = new Set<string>();
  const preferenceUserIds = new Set<string>();

  for (const table of CORE_TABLES) {
    const jsonl = await findTableJsonl(inputPath, table);
    wouldImport[table] = 0;
    if (!jsonl) {
      issues.push({
        table,
        code: "missing_table",
        detail: "JSONL not found",
      });
      continue;
    }

    for await (const row of readJsonl(jsonl, limit)) {
      const convexId = typeof row._id === "string" ? row._id : undefined;
      if (!convexId) {
        issues.push({ table, code: "missing_id", detail: "Row missing _id" });
        continue;
      }

      const prev = seenConvexIds.get(convexId);
      if (prev) {
        issues.push({
          table,
          convexId,
          code: "duplicate_convex_id",
          detail: `Also seen in ${prev}`,
        });
      } else {
        seenConvexIds.set(convexId, table);
      }

      if (table === "users") {
        userIds.add(convexId);
        const email =
          typeof row.email === "string" ? normalizeAuthEmail(row.email) : "";
        if (email) {
          const existing = seenEmails.get(email);
          if (existing && existing !== convexId) {
            issues.push({
              table,
              convexId,
              code: "duplicate_email",
              detail: `Normalized email collision (${redactEmail(email)})`,
            });
          } else {
            seenEmails.set(email, convexId);
          }
        }
      }

      if (table === "authAccounts") {
        if (row.provider !== "password") continue;
        const secret = typeof row.secret === "string" ? row.secret : null;
        const classification = classifyPasswordHash(secret);
        if (classification === "malformed" || classification === "legacy_s2") {
          issues.push({
            table,
            convexId,
            code: `hash_${classification}`,
            detail: "Password secret format not standard lucia salt:key",
          });
        }
        if (classification === "missing") {
          issues.push({
            table,
            convexId,
            code: "hash_missing",
            detail: "Password account missing secret",
          });
        }
        const userId = typeof row.userId === "string" ? row.userId : undefined;
        if (userId && limit === undefined && !userIds.has(userId)) {
          // Only strong orphan check when full scan; with --limit users may be truncated
          issues.push({
            table,
            convexId,
            code: "orphan_user_ref_possible",
            detail: "userId not in loaded users subset",
          });
        }
      }

      if (table === "profiles") {
        const userId = typeof row.userId === "string" ? row.userId : undefined;
        if (userId) profileUserIds.add(userId);
        const storageFields = ["profileImageId", "additionalImageIds", "privateImageIds"];
        for (const field of storageFields) {
          const value = row[field];
          if (typeof value === "string" && value && !looksLikeId(value)) {
            issues.push({
              table,
              convexId,
              code: "malformed_storage_id",
              detail: field,
            });
          }
          if (Array.isArray(value)) {
            for (const item of value) {
              if (typeof item === "string" && item && !looksLikeId(item)) {
                issues.push({
                  table,
                  convexId,
                  code: "malformed_storage_id",
                  detail: field,
                });
              }
            }
          }
        }
      }

      if (table === "preferences") {
        const userId = typeof row.userId === "string" ? row.userId : undefined;
        if (userId) preferenceUserIds.add(userId);
      }

      // Reference detection (informational)
      detectReferences(row);
      wouldImport[table]++;
    }
  }

  if (limit === undefined) {
    for (const uid of profileUserIds) {
      if (!userIds.has(uid)) {
        issues.push({
          table: "profiles",
          code: "orphan_profile_user",
          detail: `profile userId missing in users`,
          convexId: uid,
        });
      }
    }
    for (const uid of preferenceUserIds) {
      if (!userIds.has(uid)) {
        issues.push({
          table: "preferences",
          code: "orphan_preference_user",
          detail: `preference userId missing in users`,
          convexId: uid,
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: true,
    inputPath,
    limit: limit ?? null,
    wouldImport,
    issueCount: issues.length,
    issues: issues.slice(0, 500),
    truncatedIssues: issues.length > 500,
  };

  const markdown = [
    "# Dry-run import report (core tables)",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Limit: ${report.limit ?? "none"}`,
    `- Issues: ${report.issueCount}`,
    "",
    "## Would import",
    "",
    ...Object.entries(wouldImport).map(([k, v]) => `- ${k}: ${v}`),
    "",
    "## Issues (first 50)",
    "",
    ...issues.slice(0, 50).map(
      (i) => `- [${i.code}] ${i.table}${i.convexId ? ` ${i.convexId}` : ""} — ${i.detail}`
    ),
    "",
  ].join("\n");

  if (outDir) {
    await writeFile(
      path.join(outDir, "dry-run-report.json"),
      JSON.stringify(report, null, 2),
      "utf8"
    );
    await writeFile(path.join(outDir, "dry-run-report.md"), markdown, "utf8");
  }

  return { report, markdown };
}

function looksLikeId(value: string): boolean {
  return value.length >= 8;
}
