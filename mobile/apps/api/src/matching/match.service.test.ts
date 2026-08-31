import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MatchService } from "./match.service";
import { makePairKey } from "./constants";

describe("MatchService race-safe match creation", () => {
  it("concurrent reciprocal likes create one match via pairKey unique", async () => {
    const a = "11111111-1111-1111-1111-111111111111";
    const b = "22222222-2222-2222-2222-222222222222";
    const pairKey = makePairKey(a, b);
    let creates = 0;
    let existing: { id: string; status: string; pairKey: string } | null = null;

    const tx = {
      match: {
        findUnique: async () => existing,
        create: async ({ data }: { data: { pairKey: string } }) => {
          if (existing) {
            const err = new Error("Unique") as Error & { code: string };
            err.code = "P2002";
            throw err;
          }
          creates += 1;
          existing = {
            id: "match-1",
            status: "active",
            pairKey: data.pairKey,
          };
          return {
            ...existing,
            convexId: "c",
            userAId: a,
            userBId: b,
          };
        },
        update: async () => existing,
      },
      conversation: {
        findUnique: async () =>
          existing
            ? {
                id: "conv-1",
                matchId: existing.id,
                participantUserIds: [a, b],
              }
            : null,
        create: async () => ({
          id: "conv-1",
          participantUserIds: [a, b],
        }),
        update: async () => ({
          id: "conv-1",
          participantUserIds: [a, b],
        }),
      },
    };

    const prisma = {
      profile: {
        findUnique: async ({ where }: { where: { userId: string } }) => ({
          id: "p",
          userId: where.userId,
          banned: false,
          questionnaireComplete: true,
          hasPaid: true,
          approved: true,
          reviewStatus: "approved",
          role: "user",
          gender: where.userId === a ? "male" : "female",
          name: "T",
          profileImageMediaId: "m",
          convexUserId: "cx",
        }),
      },
      block: { findFirst: async () => null, findMany: async () => [] },
      user: {
        findUniqueOrThrow: async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          convexId: `cx_${where.id}`,
        }),
      },
      like: {
        upsert: async () => ({}),
        findUnique: async ({
          where,
        }: {
          where: { fromUserId_toUserId: { fromUserId: string; toUserId: string } };
        }) => {
          // Always reciprocal like present after first action
          if (where.fromUserId_toUserId.fromUserId === b) {
            return { action: "like" };
          }
          return null;
        },
      },
      compatibilityScore: {
        findUnique: async () => ({ score: 85 }),
      },
      profileAuditEvent: { create: async () => ({}) },
      notification: { create: async () => ({}) },
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    };

    const scores = {
      calculateBreakdown: () => ({ total: 85, categories: [] }),
    };
    const media = { createSignedDownloadUrl: async () => ({ url: "x" }) };
    const svc = new MatchService(prisma as never, scores as never, media as never);

    // Seed reverse like by calling act from A then simulate race create twice
    const r1 = await svc.act(a, b, "like");
    assert.equal(r1.matched, true);
    assert.equal(creates, 1);

    // Second create path via transaction race
    const r2 = await (svc as unknown as {
      createOrReactivateMatch: (
        x: string,
        y: string,
        c1: string,
        c2: string
      ) => Promise<{ matchId: string }>;
    }).createOrReactivateMatch(a, b, "cx_a", "cx_b");
    assert.equal(r2.matchId, "match-1");
    assert.equal(creates, 1);
    assert.equal(pairKey.includes(":"), true);
  });

  it("rejects self-like", async () => {
    const uid = "11111111-1111-1111-1111-111111111111";
    const prisma = {
      profile: {
        findUnique: async () => ({
          id: "p",
          userId: uid,
          banned: false,
          questionnaireComplete: true,
          hasPaid: true,
          approved: true,
          reviewStatus: "approved",
          role: "user",
          gender: "male",
        }),
      },
      block: { findFirst: async () => null },
    };
    const svc = new MatchService(
      prisma as never,
      {} as never,
      {} as never
    );
    await assert.rejects(() => svc.act(uid, uid, "like"));
  });

  it("one-sided like opens chat with mutual=false", async () => {
    const a = "11111111-1111-1111-1111-111111111111";
    const b = "22222222-2222-2222-2222-222222222222";
    let existing: { id: string; status: string; pairKey: string; userAId: string; userBId: string; convexId: string } | null =
      null;

    const tx = {
      match: {
        findUnique: async () => existing,
        create: async ({ data }: { data: { pairKey: string; userAId: string; userBId: string } }) => {
          existing = {
            id: "match-1",
            status: "active",
            pairKey: data.pairKey,
            userAId: data.userAId,
            userBId: data.userBId,
            convexId: "c",
          };
          return existing;
        },
        update: async () => existing,
      },
      conversation: {
        findUnique: async () =>
          existing
            ? { id: "conv-1", matchId: existing.id, participantUserIds: [a, b] }
            : null,
        create: async () => ({ id: "conv-1", participantUserIds: [a, b] }),
        update: async () => ({ id: "conv-1", participantUserIds: [a, b] }),
      },
    };

    const prisma = {
      profile: {
        findUnique: async ({ where }: { where: { userId: string } }) => ({
          id: "p",
          userId: where.userId,
          banned: false,
          questionnaireComplete: true,
          hasPaid: true,
          approved: true,
          reviewStatus: "approved",
          role: "user",
          gender: where.userId === a ? "male" : "female",
          name: "T",
          profileImageMediaId: "m",
          convexUserId: "cx",
        }),
      },
      block: { findFirst: async () => null, findMany: async () => [] },
      user: {
        findUniqueOrThrow: async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          convexId: `cx_${where.id}`,
        }),
      },
      like: {
        upsert: async () => ({}),
        findUnique: async () => null, // no reciprocal like
      },
      compatibilityScore: { findUnique: async () => ({ score: 85 }) },
      profileAuditEvent: { create: async () => ({}) },
      notification: { create: async () => ({}) },
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    };

    const svc = new MatchService(
      prisma as never,
      { calculateBreakdown: () => ({ total: 85, categories: [] }) } as never,
      { createSignedDownloadUrl: async () => ({ url: "x" }) } as never
    );

    const r = await svc.act(a, b, "like");
    assert.equal(r.matched, true);
    assert.equal(r.mutual, false);
    assert.equal(r.conversationId, "conv-1");
  });
});
