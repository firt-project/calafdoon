import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

export type ConvexRecord = Record<string, unknown> & {
  _id?: string;
  _creationTime?: number;
};

export async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function hashPathString(inputPath: string): Promise<string> {
  return createHash("sha256").update(inputPath).digest("hex").slice(0, 16);
}

export async function listTableDirs(exportRoot: string): Promise<string[]> {
  const entries = await readdir(exportRoot, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}

export function resolveTableFile(exportRoot: string, table: string): string {
  // Common Convex export layouts: table/documents.jsonl or table.jsonl
  return path.join(exportRoot, table, "documents.jsonl");
}

export function resolveTableFileAlt(exportRoot: string, table: string): string {
  return path.join(exportRoot, `${table}.jsonl`);
}

export async function findTableJsonl(
  exportRoot: string,
  table: string
): Promise<string | null> {
  const primary = resolveTableFile(exportRoot, table);
  if (await pathExists(primary)) return primary;
  const alt = resolveTableFileAlt(exportRoot, table);
  if (await pathExists(alt)) return alt;
  // Some exports place files directly under table/ as *.jsonl
  const dir = path.join(exportRoot, table);
  if (!(await pathExists(dir))) return null;
  const entries = await readdir(dir);
  const jsonl = entries.find((f) => f.endsWith(".jsonl"));
  return jsonl ? path.join(dir, jsonl) : null;
}

export async function* readJsonl(
  filePath: string,
  limit?: number
): AsyncGenerator<ConvexRecord> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let count = 0;
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(`Invalid JSONL in ${filePath}: line failed to parse`);
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error(`Invalid JSONL record in ${filePath}`);
    }
    yield parsed as ConvexRecord;
    count++;
    if (limit !== undefined && count >= limit) break;
  }
}

export async function countJsonl(filePath: string): Promise<number> {
  let n = 0;
  for await (const _ of readJsonl(filePath)) n++;
  return n;
}

export async function sampleJsonl(
  filePath: string,
  sampleSize = 3
): Promise<ConvexRecord[]> {
  const samples: ConvexRecord[] = [];
  for await (const row of readJsonl(filePath, sampleSize)) {
    samples.push(row);
  }
  return samples;
}

export async function inspectStorageDir(exportRoot: string): Promise<{
  exists: boolean;
  entryCount: number;
  approxBytes: number;
  sampleNames: string[];
}> {
  const storageDir = path.join(exportRoot, "_storage");
  if (!(await pathExists(storageDir))) {
    return { exists: false, entryCount: 0, approxBytes: 0, sampleNames: [] };
  }
  const entries = await readdir(storageDir, { withFileTypes: true });
  let approxBytes = 0;
  const sampleNames: string[] = [];
  for (const entry of entries) {
    if (sampleNames.length < 5) sampleNames.push(entry.name);
    try {
      const s = await stat(path.join(storageDir, entry.name));
      if (s.isFile()) approxBytes += s.size;
    } catch {
      // ignore unreadable sample entries
    }
  }
  return {
    exists: true,
    entryCount: entries.length,
    approxBytes,
    sampleNames,
  };
}

const ID_LIKE =
  /^[a-z][a-z0-9]*\|[a-z0-9]+$/i; // rough Convex id pattern table|id
const STORAGE_HINT = /storage/i;

export function detectReferences(record: ConvexRecord): {
  field: string;
  value: string;
  kind: "convex_id" | "storage_id" | "unknown_ref";
}[] {
  const refs: {
    field: string;
    value: string;
    kind: "convex_id" | "storage_id" | "unknown_ref";
  }[] = [];

  for (const [key, value] of Object.entries(record)) {
    if (key === "_id") continue;
    if (typeof value === "string") {
      if (ID_LIKE.test(value) || key.endsWith("Id") || key.endsWith("UserId")) {
        refs.push({
          field: key,
          value,
          kind: STORAGE_HINT.test(key) || value.startsWith("_storage")
            ? "storage_id"
            : "convex_id",
        });
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && (ID_LIKE.test(item) || key.endsWith("Ids"))) {
          refs.push({
            field: key,
            value: item,
            kind: STORAGE_HINT.test(key) ? "storage_id" : "convex_id",
          });
        }
      }
    }
  }
  return refs;
}

export function isLikelyStorageId(value: string): boolean {
  return (
    value.includes("_storage") ||
    /^[a-z0-9]{16,}$/i.test(value) === false && value.includes("|")
      ? value.split("|")[0] === "_storage" || value.includes("storage")
      : false
  );
}
