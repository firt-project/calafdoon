import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { StripeWebhookEvent } from "@prisma/client";
import {
  claimStripeWebhookEvent,
  DEFAULT_WEBHOOK_STALE_PROCESSING_MS,
  webhookStaleProcessingMs,
} from "./stripe-webhook-claim";

type Row = StripeWebhookEvent;

function makeMemoryDb() {
  const byEventId = new Map<string, Row>();
  const byId = new Map<string, Row>();
  let seq = 0;
  let createCalls = 0;

  const db = {
    createCalls: () => createCalls,
    rows: byEventId,
    stripeWebhookEvent: {
      create: async ({
        data,
      }: {
        data: {
          stripeEventId: string;
          eventType: string;
          payloadHash: string;
          status: "processing";
        };
      }) => {
        createCalls += 1;
        if (byEventId.has(data.stripeEventId)) {
          const err = Object.assign(new Error("Unique constraint"), {
            code: "P2002",
          });
          throw err;
        }
        const now = new Date();
        const row: Row = {
          id: `row_${++seq}`,
          stripeEventId: data.stripeEventId,
          eventType: data.eventType,
          payloadHash: data.payloadHash,
          status: data.status,
          receivedAt: now,
          processedAt: null,
          error: null,
          retryCount: 0,
          createdAt: now,
          updatedAt: now,
        };
        byEventId.set(row.stripeEventId, row);
        byId.set(row.id, row);
        return { ...row };
      },
      findUnique: async ({
        where,
      }: {
        where: { stripeEventId: string };
      }) => {
        const row = byEventId.get(where.stripeEventId);
        return row ? { ...row } : null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const row = byId.get(where.id);
        if (!row) throw new Error("not found");
        return { ...row };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string;
          OR: Array<Record<string, unknown>>;
        };
        data: {
          status: "processing";
          error: null;
          payloadHash: string;
          eventType: string;
          retryCount: { increment: number };
        };
      }) => {
        const row = byId.get(where.id);
        if (!row) return { count: 0 };
        const matches = where.OR.some((clause) => {
          if ("status" in clause && clause.status === row.status) {
            if (
              clause.status === "processing" &&
              clause.updatedAt &&
              typeof clause.updatedAt === "object" &&
              "lte" in (clause.updatedAt as object)
            ) {
              const lte = (clause.updatedAt as { lte: Date }).lte;
              return row.updatedAt.getTime() <= lte.getTime();
            }
            return true;
          }
          return false;
        });
        if (!matches) return { count: 0 };
        row.status = data.status;
        row.error = data.error;
        row.payloadHash = data.payloadHash;
        row.eventType = data.eventType;
        row.retryCount += data.retryCount.increment;
        row.updatedAt = new Date();
        return { count: 1 };
      },
      /** Test helper: mark completed/failed/processing ages. */
      forceStatus(
        eventId: string,
        status: Row["status"],
        updatedAt?: Date
      ) {
        const row = byEventId.get(eventId);
        assert.ok(row);
        row.status = status;
        if (updatedAt) row.updatedAt = updatedAt;
        if (status === "completed") row.processedAt = new Date();
      },
    },
  };

  return db;
}

describe("claimStripeWebhookEvent (M6)", () => {
  it("first claim inserts processing and wins", async () => {
    const db = makeMemoryDb();
    const claim = await claimStripeWebhookEvent(db, {
      stripeEventId: "evt_1",
      eventType: "checkout.session.completed",
      payloadHash: "abc",
    });
    assert.equal(claim.outcome, "claimed");
    if (claim.outcome === "claimed") {
      assert.equal(claim.row.status, "processing");
      assert.equal(claim.row.stripeEventId, "evt_1");
    }
    assert.equal(db.rows.size, 1);
  });

  it("sequential duplicate completed returns duplicate_completed", async () => {
    const db = makeMemoryDb();
    await claimStripeWebhookEvent(db, {
      stripeEventId: "evt_2",
      eventType: "checkout.session.completed",
      payloadHash: "h",
    });
    db.stripeWebhookEvent.forceStatus("evt_2", "completed");
    const again = await claimStripeWebhookEvent(db, {
      stripeEventId: "evt_2",
      eventType: "checkout.session.completed",
      payloadHash: "h",
    });
    assert.equal(again.outcome, "duplicate_completed");
    assert.equal(db.rows.size, 1);
  });

  it("concurrent inserts: unique conflict yields one claimed and one busy/duplicate", async () => {
    const db = makeMemoryDb();
    const results = await Promise.all([
      claimStripeWebhookEvent(db, {
        stripeEventId: "evt_race",
        eventType: "checkout.session.completed",
        payloadHash: "h1",
      }),
      claimStripeWebhookEvent(db, {
        stripeEventId: "evt_race",
        eventType: "checkout.session.completed",
        payloadHash: "h1",
      }),
    ]);
    const claimed = results.filter((r) => r.outcome === "claimed");
    const other = results.filter((r) => r.outcome !== "claimed");
    assert.equal(claimed.length, 1);
    assert.equal(other.length, 1);
    assert.ok(
      other[0]!.outcome === "busy" || other[0]!.outcome === "duplicate_completed"
    );
    assert.equal(db.rows.size, 1);
    assert.equal(db.createCalls(), 2);
  });

  it("fresh processing cannot be stolen", async () => {
    const db = makeMemoryDb();
    await claimStripeWebhookEvent(db, {
      stripeEventId: "evt_busy",
      eventType: "checkout.session.completed",
      payloadHash: "h",
    });
    const second = await claimStripeWebhookEvent(db, {
      stripeEventId: "evt_busy",
      eventType: "checkout.session.completed",
      payloadHash: "h",
      now: new Date(),
      staleMs: DEFAULT_WEBHOOK_STALE_PROCESSING_MS,
    });
    assert.equal(second.outcome, "busy");
  });

  it("stale processing can be reclaimed after timeout", async () => {
    const db = makeMemoryDb();
    await claimStripeWebhookEvent(db, {
      stripeEventId: "evt_stale",
      eventType: "checkout.session.completed",
      payloadHash: "h",
    });
    const staleAt = new Date(Date.now() - DEFAULT_WEBHOOK_STALE_PROCESSING_MS - 1000);
    db.stripeWebhookEvent.forceStatus("evt_stale", "processing", staleAt);
    const reclaim = await claimStripeWebhookEvent(db, {
      stripeEventId: "evt_stale",
      eventType: "checkout.session.completed",
      payloadHash: "h2",
      now: new Date(),
      staleMs: DEFAULT_WEBHOOK_STALE_PROCESSING_MS,
    });
    assert.equal(reclaim.outcome, "claimed");
    if (reclaim.outcome === "claimed") {
      assert.equal(reclaim.row.retryCount, 1);
      assert.equal(reclaim.row.payloadHash, "h2");
    }
  });

  it("failed event can be retried via reclaim", async () => {
    const db = makeMemoryDb();
    await claimStripeWebhookEvent(db, {
      stripeEventId: "evt_fail",
      eventType: "checkout.session.completed",
      payloadHash: "h",
    });
    db.stripeWebhookEvent.forceStatus("evt_fail", "failed");
    const retry = await claimStripeWebhookEvent(db, {
      stripeEventId: "evt_fail",
      eventType: "checkout.session.completed",
      payloadHash: "h",
    });
    assert.equal(retry.outcome, "claimed");
    if (retry.outcome === "claimed") {
      assert.equal(retry.row.retryCount >= 1, true);
      assert.equal(retry.row.status, "processing");
    }
  });

  it("two different event IDs claim independently", async () => {
    const db = makeMemoryDb();
    const a = await claimStripeWebhookEvent(db, {
      stripeEventId: "evt_a",
      eventType: "checkout.session.completed",
      payloadHash: "a",
    });
    const b = await claimStripeWebhookEvent(db, {
      stripeEventId: "evt_b",
      eventType: "checkout.session.expired",
      payloadHash: "b",
    });
    assert.equal(a.outcome, "claimed");
    assert.equal(b.outcome, "claimed");
    assert.equal(db.rows.size, 2);
  });

  it("unique violation never surfaces as unhandled throw from claim helper", async () => {
    const db = makeMemoryDb();
    await claimStripeWebhookEvent(db, {
      stripeEventId: "evt_u",
      eventType: "checkout.session.completed",
      payloadHash: "h",
    });
    await assert.doesNotReject(() =>
      claimStripeWebhookEvent(db, {
        stripeEventId: "evt_u",
        eventType: "checkout.session.completed",
        payloadHash: "h",
      })
    );
  });

  it("stale ms helper uses safe defaults", () => {
    const prev = process.env.STRIPE_WEBHOOK_STALE_PROCESSING_MS;
    delete process.env.STRIPE_WEBHOOK_STALE_PROCESSING_MS;
    assert.equal(webhookStaleProcessingMs(), DEFAULT_WEBHOOK_STALE_PROCESSING_MS);
    process.env.STRIPE_WEBHOOK_STALE_PROCESSING_MS = "1000";
    assert.equal(webhookStaleProcessingMs(), DEFAULT_WEBHOOK_STALE_PROCESSING_MS);
    process.env.STRIPE_WEBHOOK_STALE_PROCESSING_MS = "600000";
    assert.equal(webhookStaleProcessingMs(), 600000);
    if (prev === undefined) delete process.env.STRIPE_WEBHOOK_STALE_PROCESSING_MS;
    else process.env.STRIPE_WEBHOOK_STALE_PROCESSING_MS = prev;
  });
});

describe("claimStripeWebhookEvent concurrent simulated instances (M6)", () => {
  it("many parallel claimers produce a single owned row", async () => {
    const db = makeMemoryDb();
    const N = 20;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        claimStripeWebhookEvent(db, {
          stripeEventId: "evt_storm",
          eventType: "checkout.session.completed",
          payloadHash: "storm",
        })
      )
    );
    assert.equal(results.filter((r) => r.outcome === "claimed").length, 1);
    assert.equal(results.filter((r) => r.outcome === "busy").length, N - 1);
    assert.equal(db.rows.size, 1);
  });
});
