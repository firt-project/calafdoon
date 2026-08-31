import {
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";

export type S3EnvConfig = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export function loadS3Env(
  env: NodeJS.ProcessEnv = process.env
): S3EnvConfig {
  const endpoint = env.S3_ENDPOINT ?? "http://127.0.0.1:9000";
  const region = env.S3_REGION ?? "us-east-1";
  const accessKeyId = env.S3_ACCESS_KEY_ID ?? env.MINIO_ROOT_USER;
  const secretAccessKey =
    env.S3_SECRET_ACCESS_KEY ?? env.MINIO_ROOT_PASSWORD;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (or MINIO_ROOT_*) are required"
    );
  }
  return {
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    forcePathStyle:
      env.S3_FORCE_PATH_STYLE === undefined
        ? true
        : env.S3_FORCE_PATH_STYLE === "true" || env.S3_FORCE_PATH_STYLE === "1",
  };
}

export function createS3Client(cfg: S3EnvConfig = loadS3Env()): S3Client {
  return new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: cfg.forcePathStyle,
  });
}

export async function ensureBucket(client: S3Client, bucket: string) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

export async function headObject(
  client: S3Client,
  bucket: string,
  key: string
): Promise<{ exists: boolean; contentLength?: number; etag?: string }> {
  try {
    const res = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    );
    return {
      exists: true,
      contentLength: res.ContentLength,
      etag: res.ETag,
    };
  } catch {
    return { exists: false };
  }
}

export async function putFile(
  client: S3Client,
  opts: {
    bucket: string;
    key: string;
    filePath: string;
    contentType: string | null;
    checksumSha256Hex: string;
  }
) {
  const body = createReadStream(opts.filePath);
  await client.send(
    new PutObjectCommand({
      Bucket: opts.bucket,
      Key: opts.key,
      Body: body,
      ContentType: opts.contentType ?? "application/octet-stream",
      Metadata: {
        "sha256-hex": opts.checksumSha256Hex,
        "migrated-from": "convex-storage",
      },
    })
  );
}

/** Read object bytes for checksum verification (small/medium files). */
export async function getObjectBytes(
  client: S3Client,
  bucket: string,
  key: string
): Promise<Buffer> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const res = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  const stream = res.Body;
  if (!stream) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  // @ts-expect-error Body is a Readable in Node
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function readLocalFile(filePath: string): Promise<Buffer> {
  return readFile(filePath);
}
