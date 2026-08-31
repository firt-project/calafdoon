import type { EvcPaymentProof, Prisma } from "@prisma/client";
import { BadRequestException, NotFoundException } from "@nestjs/common";

export type EvcReviewClaimResult =
  | { outcome: "claimed"; proof: EvcPaymentProof }
  | { outcome: "already_reviewed"; proof: EvcPaymentProof };

type EvcProofDelegate = {
  findUnique(args: {
    where: { id: string };
  }): Promise<EvcPaymentProof | null>;
  updateMany(args: {
    where: Prisma.EvcPaymentProofWhereInput;
    data: Prisma.EvcPaymentProofUncheckedUpdateManyInput;
  }): Promise<{ count: number }>;
  findUniqueOrThrow(args: {
    where: { id: string };
  }): Promise<EvcPaymentProof>;
};

/**
 * M7: atomically claim an EVC proof for approve/reject.
 * Only one concurrent reviewer can transition pending → approved|rejected.
 * Pattern mirrors M6 Stripe webhook claim (conditional updateMany, count === 1).
 */
export async function claimEvcProofReview(
  db: { evcPaymentProof: EvcProofDelegate },
  opts: {
    proofId: string;
    actorUserId: string;
    status: "approved" | "rejected";
    rejectionReason?: string | null;
    now?: Date;
  }
): Promise<EvcReviewClaimResult> {
  const existing = await db.evcPaymentProof.findUnique({
    where: { id: opts.proofId },
  });
  if (!existing) {
    throw new NotFoundException("Payment proof not found");
  }

  const now = opts.now ?? new Date();
  const data: Prisma.EvcPaymentProofUncheckedUpdateManyInput = {
    status: opts.status,
    reviewedAt: now,
    reviewedById: opts.actorUserId,
  };
  if (opts.status === "rejected") {
    data.rejectionReason = opts.rejectionReason ?? null;
  }

  const claimed = await db.evcPaymentProof.updateMany({
    where: { id: opts.proofId, status: "pending" },
    data,
  });

  if (claimed.count === 1) {
    const proof = await db.evcPaymentProof.findUniqueOrThrow({
      where: { id: opts.proofId },
    });
    return { outcome: "claimed", proof };
  }

  const latest = await db.evcPaymentProof.findUnique({
    where: { id: opts.proofId },
  });
  if (!latest) {
    throw new NotFoundException("Payment proof not found");
  }
  return { outcome: "already_reviewed", proof: latest };
}

export function assertEvcClaimed(
  result: EvcReviewClaimResult
): asserts result is { outcome: "claimed"; proof: EvcPaymentProof } {
  if (result.outcome !== "claimed") {
    throw new BadRequestException("This payment was already reviewed.");
  }
}
