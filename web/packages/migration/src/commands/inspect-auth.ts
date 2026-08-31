import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  classifyPasswordHash,
  redactConvexId,
  type HashClassification,
} from "../crypto/lucia-scrypt.js";
import { findTableJsonl, pathExists, readJsonl } from "../lib/jsonl.js";

export async function runInspectAuth(inputPath: string, outDir?: string) {
  if (!(await pathExists(inputPath))) {
    throw new Error(`Export path does not exist: ${inputPath}`);
  }

  const jsonl = await findTableJsonl(inputPath, "authAccounts");
  if (!jsonl) {
    throw new Error(
      "authAccounts JSONL not found under export (expected authAccounts/documents.jsonl)"
    );
  }

  const counts: Record<HashClassification, number> = {
    standard_salt_key: 0,
    legacy_s2: 0,
    missing: 0,
    malformed: 0,
  };

  let passwordProviderCount = 0;
  let withSecret = 0;
  const malformedSamples: { convexIdRedacted: string; classification: string }[] =
    [];

  for await (const row of readJsonl(jsonl)) {
    if (row.provider !== "password") continue;
    passwordProviderCount++;
    const secret = typeof row.secret === "string" ? row.secret : null;
    if (secret) withSecret++;
    const classification = classifyPasswordHash(secret);
    counts[classification]++;
    if (
      (classification === "malformed" || classification === "legacy_s2") &&
      malformedSamples.length < 20
    ) {
      malformedSamples.push({
        convexIdRedacted: redactConvexId(
          typeof row._id === "string" ? row._id : undefined
        ),
        classification,
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    inputPath,
    passwordProviderCount,
    accountsWithSecret: withSecret,
    classifications: counts,
    hexValidationNote:
      "standard_salt_key requires 32-char hex salt and 128-char hex key",
    samplesWithoutSecrets: malformedSamples,
    safety: [
      "Full password hashes are never printed.",
      "Only redacted Convex IDs are shown for non-standard formats.",
    ],
  };

  const markdown = [
    "# Auth hash inspection report",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Password provider accounts: ${report.passwordProviderCount}`,
    `- Accounts with secret: ${report.accountsWithSecret}`,
    "",
    "## Classifications",
    "",
    `| Format | Count |`,
    `|--------|------:|`,
    `| standard saltHex:keyHex | ${counts.standard_salt_key} |`,
    `| legacy s2: | ${counts.legacy_s2} |`,
    `| missing | ${counts.missing} |`,
    `| malformed | ${counts.malformed} |`,
    "",
    "## Safety",
    ...report.safety.map((s) => `- ${s}`),
    "",
  ].join("\n");

  if (outDir) {
    await writeFile(
      path.join(outDir, "auth-hash-report.json"),
      JSON.stringify(report, null, 2),
      "utf8"
    );
    await writeFile(path.join(outDir, "auth-hash-report.md"), markdown, "utf8");
  }

  return { report, markdown };
}
