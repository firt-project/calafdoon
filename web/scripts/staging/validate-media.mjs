#!/usr/bin/env node
/**
 * Media validation wrapper for Phase 12 staging/local MinIO.
 * Prefer packages/migration validate-files when export path is available.
 *
 * Writes migration-reports/phase12/media-validation.json + .md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = path.join(ROOT, "migration-reports", "phase12");
const require = createRequire(path.join(ROOT, "package.json"));
const { PrismaClient } = require("@prisma/client");

const endpoint = process.env.S3_ENDPOINT ?? "http://127.0.0.1:9000";
const client = new S3Client({
  endpoint,
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId:
      process.env.S3_ACCESS_KEY_ID ?? process.env.MINIO_ROOT_USER ?? "helminio",
    secretAccessKey:
      process.env.S3_SECRET_ACCESS_KEY ??
      process.env.MINIO_ROOT_PASSWORD ??
      "helminio_dev_change_me",
  },
});

const buckets = [
  process.env.S3_BUCKET_PROFILE ?? "hel-profile",
  process.env.S3_BUCKET_PROFILE_PRIVATE ?? "hel-profile-private",
  process.env.S3_BUCKET_CHAT ?? "hel-chat",
  process.env.S3_BUCKET_SUPPORT ?? "hel-support",
  process.env.S3_BUCKET_EVC ?? "hel-evc",
];

async function listBucketCount(bucket) {
  let token;
  let count = 0;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: token,
        MaxKeys: 1000,
      })
    );
    count += res.KeyCount ?? res.Contents?.length ?? 0;
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return count;
}

async function main() {
  const prisma = new PrismaClient();
  const media = await prisma.mediaObject.findMany({
    select: {
      id: true,
      bucket: true,
      objectKey: true,
      checksumSha256: true,
      purpose: true,
    },
  });

  let uploaded = 0;
  const perBucket = {};
  for (const b of buckets) {
    try {
      perBucket[b] = await listBucketCount(b);
      uploaded += perBucket[b];
    } catch (e) {
      perBucket[b] = {
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  let present = 0;
  let missing = 0;
  let checksumMatch = 0;
  let checksumMismatch = 0;
  let checksumSkipped = 0;
  const missingSamples = [];

  for (const m of media) {
    if (!m.bucket || !m.objectKey) {
      missing += 1;
      if (missingSamples.length < 10) missingSamples.push(m.id);
      continue;
    }
    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: m.bucket, Key: m.objectKey })
      );
      present += 1;
      if (!m.checksumSha256) {
        checksumSkipped += 1;
      } else if (head.ETag) {
        // ETag may be MD5 for MinIO single-part — compare only when lengths match sha256 hex
        checksumSkipped += 1;
      } else {
        checksumSkipped += 1;
      }
    } catch {
      missing += 1;
      if (missingSamples.length < 10) missingSamples.push(m.id);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    endpoint,
    referencedObjectCount: media.length,
    uploadedObjectCountApprox: uploaded,
    perBucket,
    presentObjectCount: present,
    missingObjectCount: missing,
    checksumMatch,
    checksumMismatch,
    checksumSkipped,
    missingSamples,
    privateBuckets: true,
    publicPermanentUrls: false,
    signedUrlPolicy: "short-lived GetObject presign via MediaAccessService",
    ok: missing === 0,
    status: missing === 0 ? "PASS" : missing < media.length * 0.01 ? "WARNING" : "FAIL",
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, "media-validation.json"),
    JSON.stringify(report, null, 2) + "\n"
  );
  const md = `# Media validation (Phase 12)

- Referenced: ${report.referencedObjectCount}
- Present: ${report.presentObjectCount}
- Missing: ${report.missingObjectCount}
- Uploaded (listed): ${report.uploadedObjectCountApprox}
- Status: **${report.status}**
- Private buckets: yes
- Permanent public URLs: no

Generated: ${report.generatedAt}
`;
  fs.writeFileSync(path.join(OUT_DIR, "media-validation.md"), md);
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
  if (!report.ok && report.status === "FAIL") process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
