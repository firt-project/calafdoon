import type { Prisma, StripeWebhookEvent } from "@prisma/client";

export const DEFAULT_WEBHOOK_STALE_PROCESSING_MS = 5 * 60 * 1000;

export type WebhookClaimResult =
  | { outcome: "claimed"; row: StripeWebhookEvent }
  | { outcome: "duplicate_completed"; row: StripeWebhookEvent }
  | { outcome: "busy"; row: StripeWebhookEvent };

type WebhookEventDelegate = {
  create(args: {
    data: {
      stripeEventId: string;
      eventType: string;
      payloadHash: string;
      status: "processing";
    };
  }): Promise<StripeWebhookEvent>;
  findUnique(args: {
    where: { stripeEventId: string };
  }): Promise<StripeWebhookEvent | null>;
  updateMany(args: {
    where: Prisma.StripeWebhookEventWhereInput;
    data: Prisma.StripeWebhookEventUpdateManyMutationInput;
  }): Promise<{ count: number }>;
  findUniqueOrThrow(args: {
    where: { id: string };
  }): Promise<StripeWebhookEvent>;
};

function isUniqueViolation(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

export function webhookStaleProcessingMs(): number {
  const n = Number(
    process.env.STRIPE_WEBHOOK_STALE_PROCESSING_MS ??
      DEFAULT_WEBHOOK_STALE_PROCESSING_MS
  );
  if (!Number.isFinite(n) || n < 30_000) {
    return DEFAULT_WEBHOOK_STALE_PROCESSING_MS;
  }
  // Cap at 1 hour — avoid never-reclaiming misconfig.
  return Math.min(Math.floor(n), 60 * 60 * 1000);
}

/**
 * Atomically claim a Stripe webhook event for processing (M6).
 *
 * Uses UNIQUE(stripe_event_id) as the durable claim:
 * - insert wins → this request owns processing
 * - conflict + completed → safe duplicate
 * - conflict + failed/received/stale processing → conditional reclaim
 * - conflict + fresh processing → busy (caller should return retryable 5xx)
 */
export async function claimStripeWebhookEvent(
  db: { stripeWebhookEvent: WebhookEventDelegate },
  opts: {
    stripeEventId: string;
    eventType: string;
    payloadHash: string;
    now?: Date;
    staleMs?: number;
  }
): Promise<WebhookClaimResult> {
  const now = opts.now ?? new Date();
  const staleMs = opts.staleMs ?? webhookStaleProcessingMs();
  const staleCutoff = new Date(now.getTime() - staleMs);

  try {
    const row = await db.stripeWebhookEvent.create({
      data: {
        stripeEventId: opts.stripeEventId,
        eventType: opts.eventType,
        payloadHash: opts.payloadHash,
        status: "processing",
      },
    });
    return { outcome: "claimed", row };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }

  const existing = await db.stripeWebhookEvent.findUnique({
    where: { stripeEventId: opts.stripeEventId },
  });
  if (!existing) {
    // Extremely unlikely race (deleted between conflict and read).
    throw errUniqueMissing(opts.stripeEventId);
  }

  if (existing.status === "completed") {
    return { outcome: "duplicate_completed", row: existing };
  }

  const reclaim = await db.stripeWebhookEvent.updateMany({
    where: {
      id: existing.id,
      OR: [
        { status: "failed" },
        { status: "received" },
        { status: "processing", updatedAt: { lte: staleCutoff } },
      ],
    },
    data: {
      status: "processing",
      error: null,
      payloadHash: opts.payloadHash,
      eventType: opts.eventType,
      retryCount: { increment: 1 },
    },
  });

  if (reclaim.count === 1) {
    const row = await db.stripeWebhookEvent.findUniqueOrThrow({
      where: { id: existing.id },
    });
    return { outcome: "claimed", row };
  }

  const latest = await db.stripeWebhookEvent.findUnique({
    where: { stripeEventId: opts.stripeEventId },
  });
  if (latest?.status === "completed") {
    return { outcome: "duplicate_completed", row: latest };
  }

  return { outcome: "busy", row: latest ?? existing };
}

function errUniqueMissing(stripeEventId: string): Error {
  return new Error(
    `Stripe webhook claim conflict but row missing for ${stripeEventId}`
  );
}
