import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "../lib/jsonl.js";
import {
  aggregateStorageObjects,
  collectStorageReferences,
  indexBlobFiles,
  loadStorageMeta,
  resolveBlob,
} from "../storage/refs.js";

export async function runInspectStorage(opts: {
  inputPath: string;
  scrubbedPath: string;
  outDir?: string;
}) {
  const { inputPath, scrubbedPath, outDir } = opts;
  if (!(await pathExists(inputPath))) {
    throw new Error(`Export path does not exist: ${inputPath}`);
  }
  if (!(await pathExists(scrubbedPath))) {
    throw new Error(`Scrubbed path does not exist: ${scrubbedPath}`);
  }

  const meta = await loadStorageMeta(inputPath);
  const fileIndex = indexBlobFiles(path.join(inputPath, "_storage"));
  const refs = await collectStorageReferences(scrubbedPath);
  const { objects, unreferencedIds, missingReferencedIds } =
    aggregateStorageObjects(meta, refs);

  const reportRows = [];
  for (const obj of objects) {
    const m = meta.get(obj.storageId);
    const blob = m
      ? await resolveBlob(inputPath, m, fileIndex)
      : {
          filename: null,
          exists: false,
          byteSizeOnDisk: null,
          meta: null,
        };
    reportRows.push({
      purpose: obj.purpose,
      ownerUserId: obj.ownerConvexUserId,
      ownershipResolved: obj.ownershipResolved,
      sourceTable: obj.refs[0]?.table ?? null,
      sourceRecordConvexId: obj.refs[0]?.recordConvexId ?? null,
      convexStorageId: obj.storageId,
      referencedFilename: blob.filename,
      contentType: m?.contentType ?? null,
      byteSize: m?.size ?? blob.byteSizeOnDisk,
      blobExists: blob.exists,
      multiReferenced: obj.multiReferenced,
      unreferenced: !obj.referenced,
      referenceCount: obj.refs.length,
      references: obj.refs.map((r) => ({
        table: r.table,
        recordConvexId: r.recordConvexId,
        field: r.field,
        purpose: r.purpose,
        ownerUserId: r.ownerConvexUserId,
      })),
    });
  }

  const byPurpose: Record<string, number> = {};
  for (const row of reportRows) {
    byPurpose[row.purpose] = (byPurpose[row.purpose] ?? 0) + 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    inputPath,
    scrubbedPath,
    totalStorageObjects: meta.size,
    totalBlobFiles: fileIndex.size,
    totalReferenceRows: refs.length,
    uniqueReferenced: objects.filter((o) => o.referenced).length,
    unreferencedCount: unreferencedIds.length,
    missingReferencedCount: missingReferencedIds.length,
    unresolvedOwnershipCount: reportRows.filter(
      (r) => r.unreferenced || !r.ownershipResolved
    ).length,
    byPurpose,
    missingReferencedIds,
    unreferencedIds,
    objects: reportRows,
  };

  const markdown = [
    "# Storage reference report (Phase 3)",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Total _storage objects: ${report.totalStorageObjects}`,
    `- Blob files on disk: ${report.totalBlobFiles}`,
    `- Reference rows: ${report.totalReferenceRows}`,
    `- Unique referenced: ${report.uniqueReferenced}`,
    `- Unreferenced: ${report.unreferencedCount}`,
    `- Missing referenced: ${report.missingReferencedCount}`,
    `- Unresolved ownership (incl. unreferenced): ${report.unresolvedOwnershipCount}`,
    "",
    "## By purpose",
    "",
    ...Object.entries(byPurpose).map(([k, v]) => `- ${k}: ${v}`),
    "",
    "## Unreferenced storage IDs",
    "",
    ...(unreferencedIds.length
      ? unreferencedIds.map((id) => `- ${id}`)
      : ["- none"]),
    "",
    "## Missing referenced IDs",
    "",
    ...(missingReferencedIds.length
      ? missingReferencedIds.map((id) => `- ${id}`)
      : ["- none"]),
    "",
  ].join("\n");

  if (outDir) {
    await writeFile(
      path.join(outDir, "storage-reference-report.json"),
      JSON.stringify(report, null, 2),
      "utf8"
    );
    await writeFile(
      path.join(outDir, "storage-reference-report.md"),
      markdown,
      "utf8"
    );
  }

  return { report, markdown };
}
