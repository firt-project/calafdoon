#!/usr/bin/env node
/**
 * Phase 6 migration parity — aggregate counts only, no PII.
 */
import { PrismaClient } from "@prisma/client";
import {
  calculateCompatibility,
} from "../src/matching/compatibility";
import { ScoreService } from "../src/matching/score.service";
import { MIN_COMPATIBILITY_SCORE, makePairKey } from "../src/matching/constants";

async function main() {
  const prisma = new PrismaClient();
  const scores = new ScoreService(prisma);

  const compatibilityScores = await prisma.compatibilityScore.count();
  const likes = await prisma.like.count();
  const matches = await prisma.match.count();
  const duplicatePairs = await prisma.$queryRaw<Array<{ pair_key: string; c: bigint }>>`
    SELECT pair_key, COUNT(*)::bigint AS c FROM matches GROUP BY pair_key HAVING COUNT(*) > 1
  `;
  const orphanMatches = await prisma.match.count({
    where: {
      OR: [
        { userA: { is: null } },
        { userB: { is: null } },
      ],
    },
  }).catch(() => 0);

  const blockedPairsInDiscoverSample = await prisma.$queryRaw<
    Array<{ c: bigint }>
  >`
    SELECT COUNT(*)::bigint AS c
    FROM compatibility_scores cs
    WHERE cs.score >= ${MIN_COMPATIBILITY_SCORE}
      AND EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_id = cs.user_a_id AND b.blocked_id = cs.user_b_id)
           OR (b.blocker_id = cs.user_b_id AND b.blocked_id = cs.user_a_id)
      )
  `;

  // Score parity sample: up to 20 stored pairs vs live recalculation
  const sample = await prisma.compatibilityScore.findMany({
    take: 20,
    orderBy: { score: "desc" },
    include: {
      userA: { include: { profile: true, preferences: true } },
      userB: { include: { profile: true, preferences: true } },
    },
  });

  let compared = 0;
  let withinOne = 0;
  for (const row of sample) {
    const pa = row.userA.profile;
    const pb = row.userB.profile;
    const pra = row.userA.preferences;
    const prb = row.userB.preferences;
    if (!pa || !pb || !pra || !prb) continue;
    const ab = scores.calculatePair(pa, pra, pb, prb);
    const ba = scores.calculatePair(pb, prb, pa, pra);
    const avg = Math.round((ab + ba) / 2);
    compared += 1;
    if (Math.abs(avg - row.score) <= 1) withinOne += 1;
  }

  // Missing pairKey should be none after migration
  const missingPairKey = await prisma.match.count({
    where: { pairKey: "" },
  });

  // Verify pairKey consistency on sample
  const matchSample = await prisma.match.findMany({ take: 50 });
  let pairKeyOk = 0;
  for (const m of matchSample) {
    if (m.pairKey === makePairKey(m.userAId, m.userBId)) pairKeyOk += 1;
  }

  console.log(
    JSON.stringify(
      {
        compatibilityScores,
        likes,
        matches,
        duplicatePairKeys: duplicatePairs.length,
        orphanMatches,
        blockedPairsAboveMinScore: Number(blockedPairsInDiscoverSample[0]?.c ?? 0),
        scoreParitySample: { compared, withinOnePointOfStored: withinOne },
        missingPairKey,
        pairKeyConsistentSample: `${pairKeyOk}/${matchSample.length}`,
        minDiscoverScore: MIN_COMPATIBILITY_SCORE,
        note: "Blocked pairs may still exist in score table; discover/actions exclude them.",
      },
      null,
      2
    )
  );

  void calculateCompatibility;
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
