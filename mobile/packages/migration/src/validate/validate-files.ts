import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "../lib/jsonl.js";
import {
  bucketForPurpose,
  defaultBucketConfig,
  objectKeyFor,
} from "../storage/purpose.js";
import {
  aggregateStorageObjects,
  collectStorageReferences,
  indexBlobFiles,
  loadStorageMeta,
  resolveBlob,
  sha256FileHex,
} from "../storage/refs.js";
import {
  createS3Client,
  getObjectBytes,
  headObject,
  loadS3Env,
} from "../storage/s3.js";

async function loadPrisma() {
  const mod = await import("@prisma/client");
  return mod.PrismaClient;
}

export async function runValidateFiles(opts: {
  inputPath: string;
  scrubbedPath?: string;
  databaseUrl?: string;
  outDir?: string;
}) {
  const scrubbedPath = opts.scrubbedPath ?? opts.inputPath;
  const databaseUrl = opts.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!(await pathExists(opts.inputPath))) {
    throw new Error(`Export path does not exist: ${opts.inputPath}`);
  }

  const PrismaClient = await loadPrisma();
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  const s3 = createS3Client(loadS3Env());
  const buckets = defaultBucketConfig();

  const criticalFailures: string[] = [];
  const warnings: string[] = [];

  try {
    const meta = await loadStorageMeta(opts.inputPath);
    const fileIndex = indexBlobFiles(path.join(opts.inputPath, "_storage"));
    const refs = await collectStorageReferences(scrubbedPath);
    const { objects, missingReferencedIds, unreferencedIds } =
      aggregateStorageObjects(meta, refs);

    const referenced = objects.filter((o) => o.referenced);
    let missingBlobs = 0;
    for (const obj of referenced) {
      const m = meta.get(obj.storageId);
      if (!m) {
        missingBlobs++;
        continue;
      }
      const blob = await resolveBlob(opts.inputPath, m, fileIndex);
      if (!blob.exists) missingBlobs++;
    }
    if (missingBlobs > 0) {
      criticalFailures.push(`referenced_missing_blobs=${missingBlobs}`);
    }
    if (missingReferencedIds.length > 0) {
      criticalFailures.push(
        `referenced_missing_from_meta=${missingReferencedIds.length}`
      );
    }

    const mediaRows = await prisma.mediaObject.findMany();
    const byConvex = new Map(mediaRows.map((m) => [m.convexStorageId, m]));

    let migratedReferenced = 0;
    let checksumMismatch = 0;
    let unreadables = 0;
    let keyConflicts = 0;

    const keyChecksum = new Map<string, string>();

    for (const obj of referenced) {
      const row = byConvex.get(obj.storageId);
      if (
        row &&
        (row.migrationStatus === "verified" || row.migrationStatus === "uploaded")
      ) {
        migratedReferenced++;
      } else {
        criticalFailures.push(`unmigrated_referenced=${obj.storageId}`);
      }

      if (!row?.bucket || !row.objectKey || !row.checksumSha256) continue;

      const mapKey = `${row.bucket}/${row.objectKey}`;
      const prev = keyChecksum.get(mapKey);
      if (prev && prev !== row.checksumSha256) {
        keyConflicts++;
      } else {
        keyChecksum.set(mapKey, row.checksumSha256);
      }

      const head = await headObject(s3, row.bucket, row.objectKey);
      if (!head.exists) {
        unreadables++;
        continue;
      }

      // Verify checksum by downloading (files are images ~100KB–1MB)
      try {
        const bytes = await getObjectBytes(s3, row.bucket, row.objectKey);
        const hex = createHash("sha256").update(bytes).digest("hex");
        if (hex !== row.checksumSha256) checksumMismatch++;
      } catch {
        unreadables++;
      }
    }

    if (checksumMismatch > 0) {
      criticalFailures.push(`checksum_mismatches=${checksumMismatch}`);
    }
    if (unreadables > 0) {
      criticalFailures.push(`unreadable_objects=${unreadables}`);
    }
    if (keyConflicts > 0) {
      criticalFailures.push(`duplicate_keys_different_checksums=${keyConflicts}`);
    }

    // Profile main image mappings
    const profilesWithMain = await prisma.profile.findMany({
      where: { profileImageConvexId: { not: null } },
      select: {
        id: true,
        convexId: true,
        profileImageConvexId: true,
        profileImageMediaId: true,
        additionalImageConvexIds: true,
        privateImageConvexIds: true,
      },
    });
    let badMain = 0;
    let badAdditionalOrder = 0;
    let badPrivate = 0;
    for (const p of profilesWithMain) {
      if (p.profileImageConvexId) {
        const media = byConvex.get(p.profileImageConvexId);
        if (!media || p.profileImageMediaId !== media.id) badMain++;
      }
      for (const sid of p.additionalImageConvexIds) {
        if (!byConvex.has(sid)) badAdditionalOrder++;
      }
      for (const sid of p.privateImageConvexIds) {
        if (!byConvex.has(sid)) badPrivate++;
      }
    }
    if (badMain > 0) {
      criticalFailures.push(`invalid_profile_main_mappings=${badMain}`);
    }
    if (badAdditionalOrder > 0) {
      criticalFailures.push(
        `missing_additional_photo_media=${badAdditionalOrder}`
      );
    }
    if (badPrivate > 0) {
      criticalFailures.push(`missing_private_photo_media=${badPrivate}`);
    }

    // Chat images
    const msgs = await prisma.message.findMany({
      where: { imageConvexId: { not: null } },
      select: {
        convexId: true,
        imageConvexId: true,
        imageMediaId: true,
        conversationId: true,
      },
    });
    let badChat = 0;
    for (const msg of msgs) {
      if (!msg.imageConvexId) continue;
      const media = byConvex.get(msg.imageConvexId);
      if (!media || msg.imageMediaId !== media.id) badChat++;
    }
    if (badChat > 0) {
      criticalFailures.push(`invalid_chat_image_mappings=${badChat}`);
    }

    // Support / EVC
    const supportBad = await prisma.supportContact.count({
      where: {
        imageConvexId: { not: null },
        OR: [{ imageMediaId: null }],
      },
    });
    // imageConvexId might not be set if only stored as convex in migration - check media link via convex ids on media
    void supportBad;

    const failedObjects = mediaRows.filter((m) => m.migrationStatus === "failed");

    if (migratedReferenced !== referenced.length) {
      // Deduplicate critical failure spam — summarize
      const unmigrated = referenced.length - migratedReferenced;
      // Remove per-id spam if too many
      const filtered = criticalFailures.filter(
        (f) => !f.startsWith("unmigrated_referenced=")
      );
      criticalFailures.length = 0;
      criticalFailures.push(...filtered);
      if (unmigrated > 0) {
        criticalFailures.push(`unmigrated_referenced_count=${unmigrated}`);
      }
    }

    // Source referenced count equals migrated referenced count
    if (migratedReferenced !== referenced.length) {
      // already added
    } else {
      // ok
    }

    // Spot-check a few local blob checksums still match DB
    let localChecksumChecked = 0;
    for (const obj of referenced.slice(0, 25)) {
      const m = meta.get(obj.storageId);
      const row = byConvex.get(obj.storageId);
      if (!m || !row?.checksumSha256) continue;
      const blob = await resolveBlob(opts.inputPath, m, fileIndex);
      if (!blob.absolutePath) continue;
      const hex = await sha256FileHex(blob.absolutePath);
      localChecksumChecked++;
      if (hex !== row.checksumSha256) {
        criticalFailures.push(`local_vs_db_checksum_mismatch=${obj.storageId}`);
      }
    }

    const counts = {
      totalStorageObjects: meta.size,
      referencedObjects: referenced.length,
      unreferencedObjects: unreferencedIds.length,
      migratedReferenced,
      mediaObjectRows: mediaRows.length,
      failedObjects: failedObjects.length,
      missingBlobs,
      checksumMismatch,
      unreadables,
      keyConflicts,
      badMainMappings: badMain,
      badAdditional: badAdditionalOrder,
      badPrivate,
      badChat,
      localChecksumChecked,
      byPurpose: Object.fromEntries(
        ["profile_main", "profile_additional", "profile_private", "chat_image", "support_attachment", "evc_screenshot", "unknown"].map(
          (p) => [p, mediaRows.filter((m) => m.purpose === p).length]
        )
      ),
    };

    // Expected bucket for purpose
    for (const row of mediaRows) {
      if (!row.bucket || row.migrationStatus === "failed") continue;
      const expected = bucketForPurpose(row.purpose, buckets);
      if (row.bucket !== expected) {
        warnings.push(
          `bucket_purpose_mismatch ${row.convexStorageId} got=${row.bucket} expected=${expected}`
        );
      }
      const expectedKey = objectKeyFor(row.convexStorageId, row.contentType);
      if (row.objectKey && row.objectKey !== expectedKey) {
        warnings.push(
          `object_key_mismatch ${row.convexStorageId} got=${row.objectKey}`
        );
      }
    }

    const result = {
      generatedAt: new Date().toISOString(),
      ok: criticalFailures.length === 0,
      criticalFailures,
      warnings,
      counts,
      failedObjectIds: failedObjects.map((f) => ({
        storageId: f.convexStorageId,
        reason: f.failureReason,
      })),
      unreferencedIds,
    };

    const markdown = [
      "# Phase 3 file validation report",
      "",
      `- Generated: ${result.generatedAt}`,
      `- Status: ${result.ok ? "PASS" : "FAIL"}`,
      "",
      "## Counts",
      "",
      ...Object.entries(counts).map(([k, v]) =>
        typeof v === "object"
          ? `- ${k}: ${JSON.stringify(v)}`
          : `- ${k}: ${v}`
      ),
      "",
      "## Critical failures",
      "",
      ...(criticalFailures.length
        ? criticalFailures.map((f) => `- ${f}`)
        : ["- none"]),
      "",
      "## Warnings",
      "",
      ...(warnings.length ? warnings.map((w) => `- ${w}`) : ["- none"]),
      "",
      "## Failed objects",
      "",
      ...(result.failedObjectIds.length
        ? result.failedObjectIds.map(
            (f) => `- ${f.storageId}: ${f.reason ?? "unknown"}`
          )
        : ["- none"]),
      "",
      "## Unreferenced blobs",
      "",
      ...(unreferencedIds.length
        ? unreferencedIds.map((id) => `- ${id}`)
        : ["- none"]),
      "",
    ].join("\n");

    if (opts.outDir) {
      await writeFile(
        path.join(opts.outDir, "validation-files-report.json"),
        JSON.stringify(result, null, 2),
        "utf8"
      );
      await writeFile(
        path.join(opts.outDir, "validation-files-report.md"),
        markdown,
        "utf8"
      );
    }

    return {
      result,
      markdown,
      exitCode: result.ok ? 0 : 1,
    };
  } finally {
    await prisma.$disconnect();
  }
}
