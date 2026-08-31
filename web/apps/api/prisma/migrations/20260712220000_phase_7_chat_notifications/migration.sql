-- Phase 7: chat participants, message idempotency, notification source keys

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "participant_user_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill from match endpoints
UPDATE "conversations" c
SET "participant_user_ids" = ARRAY[m.user_a_id::text, m.user_b_id::text]
FROM "matches" m
WHERE c.match_id = m.id
  AND (c.participant_user_ids IS NULL OR cardinality(c.participant_user_ids) = 0);

CREATE INDEX IF NOT EXISTS "conversations_last_message_at_idx" ON "conversations"("last_message_at");

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "messages_conversation_id_idempotency_key_key"
  ON "messages"("conversation_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "source_key" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_source_key_key" ON "notifications"("source_key")
  WHERE "source_key" IS NOT NULL;
