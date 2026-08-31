-- Daily photo streaks on conversations (both partners send a chat photo per UTC day).
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "streak_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "longest_streak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "streak_last_day" TEXT;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "streak_pending_day" TEXT;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "streak_pending_user_ids" JSONB;
