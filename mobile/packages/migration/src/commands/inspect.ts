import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  countJsonl,
  detectReferences,
  findTableJsonl,
  hashPathString,
  inspectStorageDir,
  listTableDirs,
  pathExists,
  sampleJsonl,
} from "../lib/jsonl.js";
import { redactConvexId } from "../crypto/lucia-scrypt.js";

export async function runInspect(inputPath: string, outDir?: string) {
  if (!(await pathExists(inputPath))) {
    throw new Error(`Export path does not exist: ${inputPath}`);
  }

  const tables = await listTableDirs(inputPath);
  const tableReports: Record<
    string,
    {
      recordCount: number | null;
      jsonlPath: string | null;
      sampleIds: string[];
      sampleFields: string[];
      referenceFields: string[];
    }
  > = {};

  for (const table of tables) {
    if (table === "_storage") continue;
    const jsonl = await findTableJsonl(inputPath, table);
    if (!jsonl) {
      tableReports[table] = {
        recordCount: null,
        jsonlPath: null,
        sampleIds: [],
        sampleFields: [],
        referenceFields: [],
      };
      continue;
    }
    const count = await countJsonl(jsonl);
    const samples = await sampleJsonl(jsonl, 3);
    const refFields = new Set<string>();
    for (const sample of samples) {
      for (const ref of detectReferences(sample)) {
        refFields.add(ref.field);
      }
    }
    tableReports[table] = {
      recordCount: count,
      jsonlPath: jsonl,
      sampleIds: samples
        .map((s) => (typeof s._id === "string" ? redactConvexId(s._id) : "[none]"))
        .filter(Boolean),
      sampleFields: samples[0] ? Object.keys(samples[0]).sort() : [],
      referenceFields: [...refFields].sort(),
    };
  }

  const storage = await inspectStorageDir(inputPath);
  const report = {
    generatedAt: new Date().toISOString(),
    inputPath,
    inputPathHash: await hashPathString(inputPath),
    tableDirectories: tables,
    tables: tableReports,
    storage: {
      exists: storage.exists,
      entryCount: storage.entryCount,
      approxBytes: storage.approxBytes,
      sampleNamesRedacted: storage.sampleNames.map((n) =>
        n.length > 12 ? `${n.slice(0, 6)}…` : n
      ),
    },
    notes: [
      "This tool never contacts Convex or production.",
      "Sample IDs are redacted.",
      "Password secrets are never inspected by this command — use inspect-auth.",
    ],
  };

  const markdown = renderInspectMarkdown(report);

  if (outDir) {
    await writeFile(
      path.join(outDir, "inspect-report.json"),
      JSON.stringify(report, null, 2),
      "utf8"
    );
    await writeFile(path.join(outDir, "inspect-report.md"), markdown, "utf8");
  }

  return { report, markdown };
}

function renderInspectMarkdown(report: Awaited<ReturnType<typeof runInspect>>["report"]) {
  const lines: string[] = [];
  lines.push("# Convex export inspection report");
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Input hash: \`${report.inputPathHash}\``);
  lines.push(`- Table directories: ${report.tableDirectories.length}`);
  lines.push(
    `- Storage: ${
      report.storage.exists
        ? `${report.storage.entryCount} entries (~${report.storage.approxBytes} bytes)`
        : "not present"
    }`
  );
  lines.push("");
  lines.push("## Tables");
  lines.push("");
  lines.push("| Table | Records | Ref fields |");
  lines.push("|-------|--------:|------------|");
  for (const [name, t] of Object.entries(report.tables)) {
    lines.push(
      `| ${name} | ${t.recordCount ?? "n/a"} | ${t.referenceFields.join(", ") || "—"} |`
    );
  }
  lines.push("");
  lines.push("## Notes");
  for (const note of report.notes) lines.push(`- ${note}`);
  lines.push("");
  return lines.join("\n");
}
