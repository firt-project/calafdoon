import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VerificationService } from "./verification.service";

describe("selfie retention", () => {
  it("deletes selfie files and records 30 days after the decision, and only then", async () => {
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const rows = [
      { id: "old-approved", mediaId: "m1", status: "approved", reviewedAt: new Date(now - 31 * DAY) },
      { id: "old-rejected", mediaId: "m2", status: "rejected", reviewedAt: new Date(now - 40 * DAY) },
      { id: "recent", mediaId: "m3", status: "approved", reviewedAt: new Date(now - 5 * DAY) },
      { id: "pending", mediaId: "m4", status: "pending", reviewedAt: null },
    ];
    const deletedObjects: string[] = [];
    const deletedMedia: string[] = [];
    const deletedRows: string[] = [];
    const prisma = {
      photoVerification: {
        findMany: async ({ where }: any) =>
          rows.filter((r) => where.status.in.includes(r.status) && r.reviewedAt && r.reviewedAt < where.reviewedAt.lt),
        delete: async ({ where }: any) => void deletedRows.push(where.id),
      },
      mediaObject: {
        findUnique: async ({ where }: any) => ({ id: where.id, bucket: "b", objectKey: `k/${where.id}` }),
        deleteMany: async ({ where }: any) => void deletedMedia.push(where.id),
      },
    };
    const media = { deleteObjectQuietly: async (_b: string, k: string) => void deletedObjects.push(k) };
    const svc = new VerificationService(prisma as never, { get: () => undefined } as never, media as never, {} as never);
    const n = await svc.purgeReviewedSelfies(now);
    assert.equal(n, 2);
    assert.deepEqual(deletedRows.sort(), ["old-approved", "old-rejected"]);
    assert.deepEqual(deletedObjects.sort(), ["k/m1", "k/m2"]);
    assert.deepEqual(deletedMedia.sort(), ["m1", "m2"]);
  });
});
