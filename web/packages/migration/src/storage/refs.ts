import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { findTableJsonl, pathExists, readJsonl } from "../lib/jsonl.js";
import {
  pickPurpose,
  type MediaPurposeName,
} from "./purpose.js";

export type StorageMeta = {
  convexStorageId: string;
  contentType: string | null;
  size: number | null;
  /** Convex export sha256 is base64; we also store hex of file bytes. */
  exportSha256Base64: string | null;
  creationTime: number | null;
};

export type StorageReference = {
  purpose: MediaPurposeName;
  ownerConvexUserId: string | null;
  table: string;
  recordConvexId: string;
  field: string;
  storageId: string;
};

export type ResolvedBlob = {
  meta: StorageMeta;
  filename: string | null;
  absolutePath: string | null;
  exists: boolean;
  byteSizeOnDisk: number | null;
};

async function readAllJsonl(file: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  if (!(await pathExists(file))) return rows;
  const rl = readline.createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    rows.push(JSON.parse(t) as Record<string, unknown>);
  }
  return rows;
}

export async function loadStorageMeta(
  inputPath: string
): Promise<Map<string, StorageMeta>> {
  const file = path.join(inputPath, "_storage", "documents.jsonl");
  const map = new Map<string, StorageMeta>();
  for (const row of await readAllJsonl(file)) {
    const id = typeof row._id === "string" ? row._id : null;
    if (!id) continue;
    map.set(id, {
      convexStorageId: id,
      contentType: typeof row.contentType === "string" ? row.contentType : null,
      size: typeof row.size === "number" ? row.size : null,
      exportSha256Base64: typeof row.sha256 === "string" ? row.sha256 : null,
      creationTime:
        typeof row._creationTime === "number" ? row._creationTime : null,
    });
  }
  return map;
}

export function indexBlobFiles(storageDir: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(storageDir)) return map;
  for (const name of readdirSync(storageDir)) {
    if (name === "documents.jsonl" || name.startsWith(".")) continue;
    const id = name.replace(/\.[^.]+$/, "");
    map.set(id, name);
  }
  return map;
}

export async function resolveBlob(
  inputPath: string,
  meta: StorageMeta,
  fileIndex: Map<string, string>
): Promise<ResolvedBlob> {
  const storageDir = path.join(inputPath, "_storage");
  const filename = fileIndex.get(meta.convexStorageId) ?? null;
  const absolutePath = filename ? path.join(storageDir, filename) : null;
  if (!absolutePath) {
    return {
      meta,
      filename: null,
      absolutePath: null,
      exists: false,
      byteSizeOnDisk: null,
    };
  }
  try {
    await access(absolutePath);
    const s = await stat(absolutePath);
    return {
      meta,
      filename,
      absolutePath,
      exists: true,
      byteSizeOnDisk: s.size,
    };
  } catch {
    return {
      meta,
      filename,
      absolutePath,
      exists: false,
      byteSizeOnDisk: null,
    };
  }
}

function addRef(
  refs: StorageReference[],
  purpose: MediaPurposeName,
  owner: string | null | undefined,
  table: string,
  recordId: unknown,
  storageId: unknown,
  field: string
) {
  if (typeof storageId !== "string" || !storageId) return;
  if (typeof recordId !== "string") return;
  refs.push({
    purpose,
    ownerConvexUserId: typeof owner === "string" ? owner : null,
    table,
    recordConvexId: recordId,
    field,
    storageId,
  });
}

/**
 * Collect every known Convex storage reference from scrubbed (or working) export tables.
 */
export async function collectStorageReferences(
  scrubbedPath: string
): Promise<StorageReference[]> {
  const refs: StorageReference[] = [];

  const profilesFile = await findTableJsonl(scrubbedPath, "profiles");
  if (profilesFile) {
    for await (const row of readJsonl(profilesFile)) {
      addRef(
        refs,
        "profile_main",
        row.userId as string,
        "profiles",
        row._id,
        row.profileImageId,
        "profileImageId"
      );
      if (Array.isArray(row.additionalImageIds)) {
        for (const id of row.additionalImageIds) {
          addRef(
            refs,
            "profile_additional",
            row.userId as string,
            "profiles",
            row._id,
            id,
            "additionalImageIds"
          );
        }
      }
      if (Array.isArray(row.privateImageIds)) {
        for (const id of row.privateImageIds) {
          addRef(
            refs,
            "profile_private",
            row.userId as string,
            "profiles",
            row._id,
            id,
            "privateImageIds"
          );
        }
      }
    }
  }

  const messagesFile = await findTableJsonl(scrubbedPath, "messages");
  if (messagesFile) {
    for await (const row of readJsonl(messagesFile)) {
      addRef(
        refs,
        "chat_image",
        row.senderId as string,
        "messages",
        row._id,
        row.imageId,
        "imageId"
      );
    }
  }

  const supportFile = await findTableJsonl(scrubbedPath, "supportContacts");
  if (supportFile) {
    for await (const row of readJsonl(supportFile)) {
      addRef(
        refs,
        "support_attachment",
        (row.userId as string) ?? null,
        "supportContacts",
        row._id,
        row.imageId,
        "imageId"
      );
    }
  }

  const supportMsgFile = await findTableJsonl(scrubbedPath, "supportMessages");
  if (supportMsgFile) {
    for await (const row of readJsonl(supportMsgFile)) {
      for (const field of ["imageId", "attachmentId", "storageId"] as const) {
        if (row[field]) {
          addRef(
            refs,
            "support_attachment",
            (row.authorUserId as string) ?? null,
            "supportMessages",
            row._id,
            row[field],
            field
          );
        }
      }
    }
  }

  const evcFile = await findTableJsonl(scrubbedPath, "evcPaymentProofs");
  if (evcFile) {
    for await (const row of readJsonl(evcFile)) {
      addRef(
        refs,
        "evc_screenshot",
        row.userId as string,
        "evcPaymentProofs",
        row._id,
        row.screenshotId,
        "screenshotId"
      );
    }
  }

  const uploadsFile = await findTableJsonl(scrubbedPath, "userUploads");
  if (uploadsFile) {
    for await (const row of readJsonl(uploadsFile)) {
      addRef(
        refs,
        "unknown",
        row.userId as string,
        "userUploads",
        row._id,
        row.storageId,
        "storageId"
      );
    }
  }

  return refs;
}

export type AggregatedStorageObject = {
  storageId: string;
  purpose: MediaPurposeName;
  ownerConvexUserId: string | null;
  ownershipResolved: boolean;
  refs: StorageReference[];
  multiReferenced: boolean;
  referenced: boolean;
};

export function aggregateStorageObjects(
  meta: Map<string, StorageMeta>,
  refs: StorageReference[]
): {
  objects: AggregatedStorageObject[];
  unreferencedIds: string[];
  missingReferencedIds: string[];
} {
  const byId = new Map<string, StorageReference[]>();
  for (const r of refs) {
    if (!byId.has(r.storageId)) byId.set(r.storageId, []);
    byId.get(r.storageId)!.push(r);
  }

  const objects: AggregatedStorageObject[] = [];
  for (const [storageId, list] of byId) {
    const purposes = list.map((r) => r.purpose);
    const purpose = pickPurpose(purposes);
    // Prefer owner from the winning purpose ref; else any non-null owner
    const primary =
      list.find((r) => r.purpose === purpose && r.ownerConvexUserId) ??
      list.find((r) => r.ownerConvexUserId) ??
      list[0];
    const owner = primary?.ownerConvexUserId ?? null;
    objects.push({
      storageId,
      purpose,
      ownerConvexUserId: owner,
      ownershipResolved: owner !== null,
      refs: list,
      multiReferenced: list.length > 1,
      referenced: true,
    });
  }

  const unreferencedIds: string[] = [];
  for (const id of meta.keys()) {
    if (!byId.has(id)) {
      unreferencedIds.push(id);
      objects.push({
        storageId: id,
        purpose: "unknown",
        ownerConvexUserId: null,
        ownershipResolved: false,
        refs: [],
        multiReferenced: false,
        referenced: false,
      });
    }
  }

  const missingReferencedIds = [...byId.keys()].filter((id) => !meta.has(id));

  return { objects, unreferencedIds, missingReferencedIds };
}

export async function sha256FileHex(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

export function exportSha256Base64ToHex(base64: string): string | null {
  try {
    return Buffer.from(base64, "base64").toString("hex");
  } catch {
    return null;
  }
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function withRetries<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseMs?: number } = {}
): Promise<T> {
  const attempts = opts.attempts ?? 5;
  const baseMs = opts.baseMs ?? 200;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i === attempts - 1) break;
      await sleep(baseMs * 2 ** i);
    }
  }
  throw lastError;
}
