import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "../lib/jsonl.js";
import {
  bucketForPurpose,
  defaultBucketConfig,
  objectKeyFor,
  type MediaPurposeName,
} from "../storage/purpose.js";
import {
  aggregateStorageObjects,
  collectStorageReferences,
  exportSha256Base64ToHex,
  indexBlobFiles,
  loadStorageMeta,
  resolveBlob,
  sha256FileHex,
  withRetries,
  type AggregatedStorageObject,
} from "../storage/refs.js";
import {
  createS3Client,
  ensureBucket,
  headObject,
  loadS3Env,
  putFile,
} from "../storage/s3.js";

async function loadPrisma() {
  const mod = await import("@prisma/client");
  return mod.PrismaClient;
}

type PrismaClient = InstanceType<Awaited<ReturnType<typeof loadPrisma>>>;

type Counts = {
  inserted: number;
  updated: number;
  skipped: number;
  uploaded: number;
  alreadyPresent: number;
  failed: number;
  missingBlobs: number;
  checksumMismatches: number;
  unreferenced: number;
  byPurpose: Record<string, { count: number; bytes: number }>;
  failedIds: { storageId: string; reason: string }[];
  unresolvedOwnership: string[];
};

function emptyCounts(): Counts {
  return {
    inserted: 0,
    updated: 0,
    skipped: 0,
    uploaded: 0,
    alreadyPresent: 0,
    failed: 0,
    missingBlobs: 0,
    checksumMismatches: 0,
    unreferenced: 0,
    byPurpose: {},
    failedIds: [],
    unresolvedOwnership: [],
  };
}

function bumpPurpose(counts: Counts, purpose: string, bytes: number) {
  if (!counts.byPurpose[purpose]) {
    counts.byPurpose[purpose] = { count: 0, bytes: 0 };
  }
  counts.byPurpose[purpose].count += 1;
  counts.byPurpose[purpose].bytes += bytes;
}

export async function runImportFiles(opts: {
  inputPath: string;
  scrubbedPath: string;
  limit?: number;
  dryRun: boolean;
  databaseUrl?: string;
  outDir?: string;
  /** When true, also upload unreferenced blobs as purpose=unknown */
  includeUnreferenced?: boolean;
}) {
  const {
    inputPath,
    scrubbedPath,
    limit,
    dryRun,
    outDir,
    includeUnreferenced = true,
  } = opts;

  if (!(await pathExists(inputPath))) {
    throw new Error(`Export path does not exist: ${inputPath}`);
  }
  if (!(await pathExists(scrubbedPath))) {
    throw new Error(`Scrubbed path does not exist: ${scrubbedPath}`);
  }

  const databaseUrl = opts.databaseUrl ?? process.env.DATABASE_URL;
  if (!dryRun && !databaseUrl) {
    throw new Error("DATABASE_URL is required unless --dry-run is set");
  }

  const prisma = dryRun
    ? null
    : new (await loadPrisma())({
        datasources: { db: { url: databaseUrl } },
      });

  const s3 = dryRun ? null : createS3Client(loadS3Env());
  const buckets = defaultBucketConfig();
  const counts = emptyCounts();

  let runId: string | null = null;

  try {
    const meta = await loadStorageMeta(inputPath);
    const fileIndex = indexBlobFiles(path.join(inputPath, "_storage"));
    const refs = await collectStorageReferences(scrubbedPath);
    const { objects } = aggregateStorageObjects(meta, refs);

    let work = objects.filter((o) =>
      includeUnreferenced ? true : o.referenced
    );
    if (limit !== undefined) work = work.slice(0, limit);

    const userByConvex = new Map<string, string>();
    if (prisma) {
      const users = await prisma.user.findMany({
        select: { id: true, convexId: true },
      });
      for (const u of users) userByConvex.set(u.convexId, u.id);

      const run = await prisma.migrationRun.create({
        data: {
          sourceExportPath: inputPath,
          sourceExportHash: createHash("sha256")
            .update(`files:${inputPath}`)
            .digest("hex")
            .slice(0, 16),
          status: "running",
          dryRun: false,
          notes: "phase3-files",
        },
      });
      runId = run.id;

      // Ensure buckets exist
      if (s3) {
        for (const b of Object.values(buckets)) {
          await ensureBucket(s3, b);
        }
      }
    }

    for (const obj of work) {
      await migrateOneObject({
        obj,
        meta,
        fileIndex,
        inputPath,
        dryRun,
        prisma,
        s3,
        buckets,
        userByConvex,
        counts,
        runId,
      });
    }

    if (prisma && runId) {
      await prisma.migrationRun.update({
        where: { id: runId },
        data: {
          status: "completed",
          completedAt: new Date(),
          fileCounts: {
            uploaded: counts.uploaded,
            alreadyPresent: counts.alreadyPresent,
            failed: counts.failed,
            missingBlobs: counts.missingBlobs,
          },
          insertedCounts: { mediaObjects: counts.inserted },
          updatedCounts: { mediaObjects: counts.updated },
          skippedCounts: { mediaObjects: counts.skipped },
          failureCounts: { total: counts.failed },
        },
      });
    }

    const totalBytes = Object.values(counts.byPurpose).reduce(
      (a, b) => a + b.bytes,
      0
    );

    const report = {
      generatedAt: new Date().toISOString(),
      phase: 3,
      dryRun,
      inputPath,
      scrubbedPath,
      limit: limit ?? null,
      totalStorageObjects: meta.size,
      totalReferencedObjects: objects.filter((o) => o.referenced).length,
      totalUnreferencedObjects: objects.filter((o) => !o.referenced).length,
      processed: work.length,
      inserted: counts.inserted,
      updated: counts.updated,
      skipped: counts.skipped,
      uploaded: counts.uploaded,
      alreadyPresent: counts.alreadyPresent,
      failed: counts.failed,
      missingBlobs: counts.missingBlobs,
      checksumMismatches: counts.checksumMismatches,
      byPurpose: counts.byPurpose,
      totalBytesMigrated: totalBytes,
      unresolvedOwnership: counts.unresolvedOwnership,
      failedIds: counts.failedIds,
    };

    const markdown = [
      "# Phase 3 file import report",
      "",
      `- Generated: ${report.generatedAt}`,
      `- Dry-run: ${dryRun}`,
      `- Total _storage objects: ${report.totalStorageObjects}`,
      `- Referenced: ${report.totalReferencedObjects}`,
      `- Unreferenced: ${report.totalUnreferencedObjects}`,
      `- Uploaded: ${report.uploaded}`,
      `- Already present: ${report.alreadyPresent}`,
      `- Failed: ${report.failed}`,
      `- Missing blobs: ${report.missingBlobs}`,
      `- Checksum mismatches: ${report.checksumMismatches}`,
      `- Total bytes (processed ok): ${report.totalBytesMigrated}`,
      "",
      "## By purpose",
      "",
      ...Object.entries(counts.byPurpose).map(
        ([k, v]) => `- ${k}: count=${v.count} bytes=${v.bytes}`
      ),
      "",
      "## Failures",
      "",
      ...(counts.failedIds.length
        ? counts.failedIds.map((f) => `- ${f.storageId}: ${f.reason}`)
        : ["- none"]),
      "",
      "## Unresolved ownership",
      "",
      ...(counts.unresolvedOwnership.length
        ? counts.unresolvedOwnership.map((id) => `- ${id}`)
        : ["- none"]),
      "",
    ].join("\n");

    if (outDir) {
      await writeFile(
        path.join(outDir, "import-files-report.json"),
        JSON.stringify(report, null, 2),
        "utf8"
      );
      await writeFile(
        path.join(outDir, "import-files-report.md"),
        markdown,
        "utf8"
      );
    }

    return { report, markdown, counts };
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}

async function migrateOneObject(args: {
  obj: AggregatedStorageObject;
  meta: Awaited<ReturnType<typeof loadStorageMeta>>;
  fileIndex: Map<string, string>;
  inputPath: string;
  dryRun: boolean;
  prisma: PrismaClient | null;
  s3: ReturnType<typeof createS3Client> | null;
  buckets: ReturnType<typeof defaultBucketConfig>;
  userByConvex: Map<string, string>;
  counts: Counts;
  runId: string | null;
}) {
  const {
    obj,
    meta,
    fileIndex,
    inputPath,
    dryRun,
    prisma,
    s3,
    buckets,
    userByConvex,
    counts,
    runId,
  } = args;

  const purpose = obj.purpose as MediaPurposeName;
  const m = meta.get(obj.storageId);
  if (!m) {
    counts.failed++;
    counts.failedIds.push({
      storageId: obj.storageId,
      reason: "missing_meta",
    });
    await quarantine(prisma, runId, obj.storageId, "missing_meta");
    return;
  }

  if (!obj.ownershipResolved) {
    counts.unresolvedOwnership.push(obj.storageId);
  }
  if (!obj.referenced) counts.unreferenced++;

  const blob = await resolveBlob(inputPath, m, fileIndex);
  if (!blob.exists || !blob.absolutePath) {
    counts.missingBlobs++;
    counts.failed++;
    counts.failedIds.push({
      storageId: obj.storageId,
      reason: "missing_blob",
    });
    await quarantine(prisma, runId, obj.storageId, "missing_blob");
    if (prisma) {
      await upsertMediaFailed(prisma, {
        obj,
        m,
        purpose,
        buckets,
        userByConvex,
        reason: "missing_blob",
      });
    }
    return;
  }

  const checksumHex = await sha256FileHex(blob.absolutePath);
  if (m.exportSha256Base64) {
    const expected = exportSha256Base64ToHex(m.exportSha256Base64);
    if (expected && expected !== checksumHex) {
      counts.checksumMismatches++;
      counts.failed++;
      counts.failedIds.push({
        storageId: obj.storageId,
        reason: "checksum_mismatch_vs_export_meta",
      });
      await quarantine(
        prisma,
        runId,
        obj.storageId,
        "checksum_mismatch_vs_export_meta"
      );
      return;
    }
  }

  const bucket = bucketForPurpose(purpose, buckets);
  const objectKey = objectKeyFor(obj.storageId, m.contentType);
  const sizeBytes = BigInt(blob.byteSizeOnDisk ?? m.size ?? 0);
  const ownerUserId = obj.ownerConvexUserId
    ? userByConvex.get(obj.ownerConvexUserId) ?? null
    : null;

  if (dryRun || !prisma || !s3) {
    counts.inserted++;
    counts.uploaded++;
    bumpPurpose(counts, purpose, Number(sizeBytes));
    return;
  }

  try {
    const existing = await prisma.mediaObject.findUnique({
      where: { convexStorageId: obj.storageId },
    });

    // Idempotent: if same key+checksum already verified, skip upload
    if (
      existing?.objectKey === objectKey &&
      existing.bucket === bucket &&
      existing.checksumSha256 === checksumHex &&
      (existing.migrationStatus === "verified" ||
        existing.migrationStatus === "uploaded")
    ) {
      const head = await headObject(s3, bucket, objectKey);
      if (head.exists) {
        counts.alreadyPresent++;
        counts.updated++;
        bumpPurpose(counts, purpose, Number(sizeBytes));
        await linkDbRows(prisma, obj, existing.id, purpose);
        return;
      }
    }

    // Refuse overwrite if different checksum on same key
    const headBefore = await headObject(s3, bucket, objectKey);
    if (headBefore.exists && existing?.checksumSha256) {
      if (existing.checksumSha256 !== checksumHex) {
        counts.failed++;
        counts.failedIds.push({
          storageId: obj.storageId,
          reason: "object_key_checksum_conflict",
        });
        await quarantine(
          prisma,
          runId,
          obj.storageId,
          "object_key_checksum_conflict"
        );
        return;
      }
      // same checksum — treat as already present
      counts.alreadyPresent++;
    } else if (!headBefore.exists || existing?.checksumSha256 === checksumHex) {
      await withRetries(() =>
        putFile(s3, {
          bucket,
          key: objectKey,
          filePath: blob.absolutePath!,
          contentType: m.contentType,
          checksumSha256Hex: checksumHex,
        })
      );
      counts.uploaded++;
    }

    const headAfter = await withRetries(() =>
      headObject(s3, bucket, objectKey)
    );
    if (!headAfter.exists) {
      throw new Error("head_after_upload_failed");
    }

    const saved = await prisma.mediaObject.upsert({
      where: { convexStorageId: obj.storageId },
      create: {
        convexStorageId: obj.storageId,
        purpose,
        bucket,
        objectKey,
        contentType: m.contentType,
        sizeBytes,
        checksumSha256: checksumHex,
        ownerUserId,
        convexOwnerUserId: obj.ownerConvexUserId,
        migrationStatus: "verified",
        sourceTable: obj.refs[0]?.table ?? null,
        sourceRecordConvexId: obj.refs[0]?.recordConvexId ?? null,
        sourceRefs: obj.refs,
        migratedAt: new Date(),
        verifiedReadable: true,
        failureReason: null,
      },
      update: {
        purpose,
        bucket,
        objectKey,
        contentType: m.contentType ?? existing?.contentType,
        sizeBytes,
        checksumSha256: checksumHex,
        ownerUserId: ownerUserId ?? existing?.ownerUserId ?? null,
        convexOwnerUserId:
          obj.ownerConvexUserId ?? existing?.convexOwnerUserId ?? null,
        migrationStatus: "verified",
        sourceTable: obj.refs[0]?.table ?? existing?.sourceTable ?? null,
        sourceRecordConvexId:
          obj.refs[0]?.recordConvexId ?? existing?.sourceRecordConvexId ?? null,
        sourceRefs: obj.refs.length
          ? obj.refs
          : existing?.sourceRefs ?? undefined,
        migratedAt: new Date(),
        verifiedReadable: true,
        failureReason: null,
      },
    });

    if (existing) counts.updated++;
    else counts.inserted++;
    bumpPurpose(counts, purpose, Number(sizeBytes));

    await linkDbRows(prisma, obj, saved.id, purpose);
  } catch (error) {
    counts.failed++;
    const reason =
      error instanceof Error ? error.message.slice(0, 180) : "upload_failed";
    counts.failedIds.push({ storageId: obj.storageId, reason });
    await quarantine(prisma, runId, obj.storageId, reason);
    if (prisma) {
      await upsertMediaFailed(prisma, {
        obj,
        m,
        purpose,
        buckets,
        userByConvex,
        reason,
      });
    }
  }
}

async function upsertMediaFailed(
  prisma: PrismaClient,
  args: {
    obj: AggregatedStorageObject;
    m: { contentType: string | null; size: number | null };
    purpose: MediaPurposeName;
    buckets: ReturnType<typeof defaultBucketConfig>;
    userByConvex: Map<string, string>;
    reason: string;
  }
) {
  const { obj, m, purpose, buckets, userByConvex, reason } = args;
  const ownerUserId = obj.ownerConvexUserId
    ? userByConvex.get(obj.ownerConvexUserId) ?? null
    : null;
  await prisma.mediaObject.upsert({
    where: { convexStorageId: obj.storageId },
    create: {
      convexStorageId: obj.storageId,
      purpose,
      bucket: bucketForPurpose(purpose, buckets),
      objectKey: objectKeyFor(obj.storageId, m.contentType),
      contentType: m.contentType,
      sizeBytes: m.size != null ? BigInt(m.size) : null,
      ownerUserId,
      convexOwnerUserId: obj.ownerConvexUserId,
      migrationStatus: "failed",
      sourceTable: obj.refs[0]?.table ?? null,
      sourceRecordConvexId: obj.refs[0]?.recordConvexId ?? null,
      sourceRefs: obj.refs,
      failureReason: reason,
      verifiedReadable: false,
    },
    update: {
      migrationStatus: "failed",
      failureReason: reason,
      verifiedReadable: false,
    },
  });
}

async function linkDbRows(
  prisma: PrismaClient,
  obj: AggregatedStorageObject,
  mediaId: string,
  purpose: MediaPurposeName
) {
  for (const ref of obj.refs) {
    if (ref.table === "profiles" && ref.field === "profileImageId") {
      await prisma.profile.updateMany({
        where: { convexId: ref.recordConvexId },
        data: { profileImageMediaId: mediaId },
      });
    }
    if (ref.table === "messages" && ref.field === "imageId") {
      await prisma.message.updateMany({
        where: { convexId: ref.recordConvexId },
        data: { imageMediaId: mediaId },
      });
    }
    if (ref.table === "supportContacts" && ref.field === "imageId") {
      await prisma.supportContact.updateMany({
        where: { convexId: ref.recordConvexId },
        data: { imageMediaId: mediaId },
      });
    }
    if (ref.table === "userUploads" && ref.field === "storageId") {
      await prisma.userUpload.updateMany({
        where: { convexId: ref.recordConvexId },
        data: { mediaObjectId: mediaId },
      });
    }
    if (ref.table === "evcPaymentProofs" && ref.field === "screenshotId") {
      await prisma.evcPaymentProof.updateMany({
        where: { convexId: ref.recordConvexId },
        data: { screenshotMediaId: mediaId },
      });
    }
  }
  // silence unused when purpose-only unknown uploads
  void purpose;
}

async function quarantine(
  prisma: PrismaClient | null,
  runId: string | null,
  storageId: string,
  reason: string
) {
  if (!prisma || !runId) return;
  await prisma.migrationFailure.create({
    data: {
      runId,
      tableName: "_storage",
      convexId: storageId,
      reasonCode: reason.slice(0, 64),
      safeDetail: `storage ${storageId.slice(0, 8)}…`,
    },
  });
}
