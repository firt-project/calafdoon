-- Phase 6: matching pair key, score timestamps, list indexes

ALTER TABLE "compatibility_scores" ADD COLUMN IF NOT EXISTS "last_calculated_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "compatibility_scores_score_version_idx" ON "compatibility_scores"("score_version");

CREATE INDEX IF NOT EXISTS "likes_from_user_id_action_idx" ON "likes"("from_user_id", "action");
CREATE INDEX IF NOT EXISTS "likes_to_user_id_action_idx" ON "likes"("to_user_id", "action");

-- Backfill deterministic pair_key before adding NOT NULL / UNIQUE
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "pair_key" TEXT;

UPDATE "matches"
SET "pair_key" = CASE
  WHEN "user_a_id"::text < "user_b_id"::text
    THEN "user_a_id"::text || ':' || "user_b_id"::text
  ELSE "user_b_id"::text || ':' || "user_a_id"::text
END
WHERE "pair_key" IS NULL OR "pair_key" = '';

-- Deduplicate any rare collisions by appending id (should be none)
UPDATE "matches" m
SET "pair_key" = m."pair_key" || ':' || m."id"::text
WHERE m."id" IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY pair_key ORDER BY created_at) AS rn
    FROM matches
  ) d WHERE rn > 1
);

ALTER TABLE "matches" ALTER COLUMN "pair_key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "matches_pair_key_key" ON "matches"("pair_key");

DROP INDEX IF EXISTS "matches_user_a_id_idx";
DROP INDEX IF EXISTS "matches_user_b_id_idx";
CREATE INDEX IF NOT EXISTS "matches_user_a_id_status_idx" ON "matches"("user_a_id", "status");
CREATE INDEX IF NOT EXISTS "matches_user_b_id_status_idx" ON "matches"("user_b_id", "status");
CREATE INDEX IF NOT EXISTS "matches_status_archived_at_idx" ON "matches"("status", "archived_at");
