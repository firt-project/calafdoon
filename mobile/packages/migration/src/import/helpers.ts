import { msToDate } from "../lib/args.js";
import { redactConvexId } from "../crypto/lucia-scrypt.js";
import type { ConvexRecord } from "../lib/jsonl.js";

export type CounterBucket = {
  inserted: number;
  updated: number;
  skipped: number;
};

export type FailureRecord = {
  table: string;
  convexId?: string;
  reason: string;
  detail?: string;
};

export type SkipRecord = {
  table: string;
  convexId?: string;
  reason: string;
  detail?: string;
};

export type DomainImportCounts = {
  inserted: Record<string, number>;
  updated: Record<string, number>;
  skipped: Record<string, number>;
  source: Record<string, number>;
  failed: FailureRecord[];
  skippedRecords: SkipRecord[];
};

export function emptyCounts(tables: string[]): DomainImportCounts {
  const zero = Object.fromEntries(tables.map((t) => [t, 0]));
  return {
    inserted: { ...zero },
    updated: { ...zero },
    skipped: { ...zero },
    source: { ...zero },
    failed: [],
    skippedRecords: [],
  };
}

export function preferExisting<T>(
  existing: T | null | undefined,
  incoming: T | null | undefined
): T | null | undefined {
  if (incoming === null || incoming === undefined) return existing;
  if (typeof incoming === "string" && incoming.trim() === "" && existing) {
    return existing;
  }
  return incoming;
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export function requireId(row: ConvexRecord): string | null {
  return typeof row._id === "string" ? row._id : null;
}

export function createdAtMs(row: ConvexRecord): Date | null {
  return msToDate(row.createdAt) ?? msToDate(row._creationTime);
}

export function convexCreatedAt(row: ConvexRecord): Date | null {
  return msToDate(row._creationTime);
}

export function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | null {
  if (typeof value !== "string") return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export type QuarantineFn = (args: {
  table: string;
  convexId?: string;
  reasonCode: string;
  safeDetail?: string;
}) => Promise<void>;

export async function loadConvexIdMap(
  prisma: {
    findMany: (args: {
      select: { id: true; convexId: true };
    }) => Promise<{ id: string; convexId: string }[]>;
  }
): Promise<Map<string, string>> {
  const rows = await prisma.findMany({
    select: { id: true, convexId: true },
  });
  return new Map(rows.map((r) => [r.convexId, r.id]));
}

export function bump(
  counts: DomainImportCounts,
  table: string,
  kind: "inserted" | "updated" | "skipped"
) {
  counts[kind][table] = (counts[kind][table] ?? 0) + 1;
}

export function fail(
  counts: DomainImportCounts,
  table: string,
  convexId: string | undefined,
  reason: string,
  detail?: string
) {
  counts.failed.push({ table, convexId, reason, detail });
}

export function skip(
  counts: DomainImportCounts,
  table: string,
  convexId: string | undefined,
  reason: string,
  detail?: string
) {
  bump(counts, table, "skipped");
  counts.skippedRecords.push({ table, convexId, reason, detail });
}

export function safeId(id?: string | null): string {
  return id ? redactConvexId(id) : "[none]";
}
