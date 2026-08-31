import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { EvcPaymentProof } from "@prisma/client";
import {
  assertEvcClaimed,
  claimEvcProofReview,
} from "./evc-review-claim";

const PROOF_ID = "proof-uuid-1";
const ACTOR_A = "actor-a";
const ACTOR_B = "actor-b";

function baseProof(over: Partial<EvcPaymentProof> = {}): EvcPaymentProof {
  return {
    id: PROOF_ID,
    convexId: "c1",
    userId: "user-1",
    profileId: "profile-1",
    convexUserId: "cu1",
    convexProfileId: "cp1",
    tier: "basic",
    payerFullName: "Test",
    lastFourDigits: "1234",
    screenshotConvexId: "shot",
    screenshotMediaId: null,
    amountCents: 500,
    status: "pending",
    proofCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
    reviewedAt: null,
    reviewedById: null,
    rejectionReason: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...over,
  } as EvcPaymentProof;
}

function makeDb(initial: EvcPaymentProof) {
  let row: EvcPaymentProof | null = { ...initial };
  let updateCalls = 0;

  const db = {
    evcPaymentProof: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        row && row.id === where.id ? { ...row } : null,
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        if (!row || row.id !== where.id) throw new Error("missing");
        return { ...row };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id?: string; status?: string };
        data: Record<string, unknown>;
      }) => {
        updateCalls += 1;
        if (!row) return { count: 0 };
        if (where.id && row.id !== where.id) return { count: 0 };
        if (where.status && row.status !== where.status) return { count: 0 };
        row = {
          ...row,
          status: (data.status as EvcPaymentProof["status"]) ?? row.status,
          reviewedAt: (data.reviewedAt as Date) ?? row.reviewedAt,
          reviewedById:
            (data.reviewedById as string | null | undefined) ?? row.reviewedById,
          rejectionReason:
            data.rejectionReason !== undefined
              ? (data.rejectionReason as string | null)
              : row.rejectionReason,
          updatedAt: new Date(),
        };
        return { count: 1 };
      },
    },
  };

  return {
    db,
    get row() {
      return row ? { ...row } : null;
    },
    set row(next: EvcPaymentProof | null) {
      row = next ? { ...next } : null;
    },
    updateCalls: () => updateCalls,
  };
}

describe("claimEvcProofReview (M7)", () => {
  it("claims a pending proof for approval exactly once", async () => {
    const store = makeDb(baseProof());
    const first = await claimEvcProofReview(store.db, {
      proofId: PROOF_ID,
      actorUserId: ACTOR_A,
      status: "approved",
    });
    assert.equal(first.outcome, "claimed");
    assert.equal(first.proof.status, "approved");
    assert.equal(first.proof.reviewedById, ACTOR_A);

    const second = await claimEvcProofReview(store.db, {
      proofId: PROOF_ID,
      actorUserId: ACTOR_B,
      status: "approved",
    });
    assert.equal(second.outcome, "already_reviewed");
    assert.equal(store.row!.status, "approved");
    assert.equal(store.row!.reviewedById, ACTOR_A);
  });

  it("claims a pending proof for rejection exactly once", async () => {
    const store = makeDb(baseProof());
    const first = await claimEvcProofReview(store.db, {
      proofId: PROOF_ID,
      actorUserId: ACTOR_A,
      status: "rejected",
      rejectionReason: "unclear",
    });
    assert.equal(first.outcome, "claimed");
    assert.equal(first.proof.status, "rejected");
    assert.equal(first.proof.rejectionReason, "unclear");

    const second = await claimEvcProofReview(store.db, {
      proofId: PROOF_ID,
      actorUserId: ACTOR_B,
      status: "rejected",
      rejectionReason: "other",
    });
    assert.equal(second.outcome, "already_reviewed");
    assert.equal(store.row!.rejectionReason, "unclear");
  });

  it("approve vs reject race: only one transition wins", async () => {
    const store = makeDb(baseProof());
    // Simulate concurrent updates with a mutex on the in-memory row.
    let gate: Promise<void> = Promise.resolve();
    const originalUpdate = store.db.evcPaymentProof.updateMany;
    store.db.evcPaymentProof.updateMany = async (args) => {
      const prev = gate;
      let release!: () => void;
      gate = new Promise<void>((r) => {
        release = r;
      });
      await prev;
      try {
        return await originalUpdate(args);
      } finally {
        release();
      }
    };

    const [a, b] = await Promise.all([
      claimEvcProofReview(store.db, {
        proofId: PROOF_ID,
        actorUserId: ACTOR_A,
        status: "approved",
      }),
      claimEvcProofReview(store.db, {
        proofId: PROOF_ID,
        actorUserId: ACTOR_B,
        status: "rejected",
        rejectionReason: "no",
      }),
    ]);

    const outcomes = [a.outcome, b.outcome].sort();
    assert.deepEqual(outcomes, ["already_reviewed", "claimed"]);
    assert.ok(
      store.row!.status === "approved" || store.row!.status === "rejected"
    );
    const winners = [a, b].filter((x) => x.outcome === "claimed");
    assert.equal(winners.length, 1);
    assert.equal(winners[0]!.proof.status, store.row!.status);
  });

  it("20 concurrent approvals: exactly one claim", async () => {
    const store = makeDb(baseProof());
    let chain: Promise<void> = Promise.resolve();
    const originalUpdate = store.db.evcPaymentProof.updateMany;
    store.db.evcPaymentProof.updateMany = async (args) => {
      const prev = chain;
      let release!: () => void;
      chain = new Promise<void>((r) => {
        release = r;
      });
      await prev;
      try {
        return await originalUpdate(args);
      } finally {
        release();
      }
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        claimEvcProofReview(store.db, {
          proofId: PROOF_ID,
          actorUserId: `actor-${i}`,
          status: "approved",
        })
      )
    );

    assert.equal(results.filter((r) => r.outcome === "claimed").length, 1);
    assert.equal(
      results.filter((r) => r.outcome === "already_reviewed").length,
      19
    );
    assert.equal(store.row!.status, "approved");
  });

  it("20 concurrent rejections: exactly one claim", async () => {
    const store = makeDb(baseProof());
    let chain: Promise<void> = Promise.resolve();
    const originalUpdate = store.db.evcPaymentProof.updateMany;
    store.db.evcPaymentProof.updateMany = async (args) => {
      const prev = chain;
      let release!: () => void;
      chain = new Promise<void>((r) => {
        release = r;
      });
      await prev;
      try {
        return await originalUpdate(args);
      } finally {
        release();
      }
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        claimEvcProofReview(store.db, {
          proofId: PROOF_ID,
          actorUserId: `actor-${i}`,
          status: "rejected",
          rejectionReason: "x",
        })
      )
    );

    assert.equal(results.filter((r) => r.outcome === "claimed").length, 1);
    assert.equal(
      results.filter((r) => r.outcome === "already_reviewed").length,
      19
    );
    assert.equal(store.row!.status, "rejected");
  });

  it("already approved returns already_reviewed without mutating", async () => {
    const store = makeDb(
      baseProof({
        status: "approved",
        reviewedById: ACTOR_A,
        reviewedAt: new Date(),
      })
    );
    const res = await claimEvcProofReview(store.db, {
      proofId: PROOF_ID,
      actorUserId: ACTOR_B,
      status: "rejected",
      rejectionReason: "late",
    });
    assert.equal(res.outcome, "already_reviewed");
    assert.equal(store.row!.status, "approved");
    assert.equal(store.updateCalls(), 1); // attempted conditional update, count 0
  });

  it("missing proof throws NotFoundException", async () => {
    const store = makeDb(baseProof());
    store.row = null;
    await assert.rejects(
      () =>
        claimEvcProofReview(store.db, {
          proofId: PROOF_ID,
          actorUserId: ACTOR_A,
          status: "approved",
        }),
      NotFoundException
    );
  });

  it("assertEvcClaimed throws stable already-reviewed message", () => {
    assert.throws(
      () =>
        assertEvcClaimed({
          outcome: "already_reviewed",
          proof: baseProof({ status: "approved" }),
        }),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        assert.match(String(err.message), /already reviewed/i);
        return true;
      }
    );
  });

  it("reject vs approve race: only one transition wins", async () => {
    const store = makeDb(baseProof());
    let gate: Promise<void> = Promise.resolve();
    const originalUpdate = store.db.evcPaymentProof.updateMany;
    store.db.evcPaymentProof.updateMany = async (args) => {
      const prev = gate;
      let release!: () => void;
      gate = new Promise<void>((r) => {
        release = r;
      });
      await prev;
      try {
        return await originalUpdate(args);
      } finally {
        release();
      }
    };

    const [a, b] = await Promise.all([
      claimEvcProofReview(store.db, {
        proofId: PROOF_ID,
        actorUserId: ACTOR_A,
        status: "rejected",
        rejectionReason: "no",
      }),
      claimEvcProofReview(store.db, {
        proofId: PROOF_ID,
        actorUserId: ACTOR_B,
        status: "approved",
      }),
    ]);

    const outcomes = [a.outcome, b.outcome].sort();
    assert.deepEqual(outcomes, ["already_reviewed", "claimed"]);
    assert.equal(
      [a, b].filter((x) => x.outcome === "claimed").length,
      1
    );
  });

  it("already rejected returns already_reviewed without mutating", async () => {
    const store = makeDb(
      baseProof({
        status: "rejected",
        reviewedById: ACTOR_A,
        reviewedAt: new Date(),
        rejectionReason: "bad",
      })
    );
    const res = await claimEvcProofReview(store.db, {
      proofId: PROOF_ID,
      actorUserId: ACTOR_B,
      status: "approved",
    });
    assert.equal(res.outcome, "already_reviewed");
    assert.equal(store.row!.status, "rejected");
    assert.equal(store.row!.rejectionReason, "bad");
  });

  it("rollback: updateMany failure leaves pending untouched", async () => {
    const store = makeDb(baseProof());
    store.db.evcPaymentProof.updateMany = async () => {
      throw new Error("db unavailable");
    };
    await assert.rejects(
      () =>
        claimEvcProofReview(store.db, {
          proofId: PROOF_ID,
          actorUserId: ACTOR_A,
          status: "approved",
        }),
      /db unavailable/
    );
    assert.equal(store.row!.status, "pending");
    assert.equal(store.row!.reviewedById, null);
  });
});
