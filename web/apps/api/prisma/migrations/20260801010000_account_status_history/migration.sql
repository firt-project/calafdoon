-- Account status history, timestamps, pause/suspend restore fields.
-- All new columns nullable so existing users remain valid.

ALTER TYPE "ReviewStatus" ADD VALUE IF NOT EXISTS 'paused';

DO $$ BEGIN
  CREATE TYPE "AccountStatusEventType" AS ENUM (
    'registered',
    'submitted',
    'approved',
    'rejected',
    'paused',
    'resumed',
    'suspended',
    'unsuspended',
    'banned',
    'unbanned',
    'deleted',
    'restored',
    'appeal_submitted',
    'appeal_reviewed',
    'verification_submitted',
    'verification_approved',
    'verification_rejected',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_active_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "restored_at" TIMESTAMP(3);

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "status_before_ban" "ReviewStatus",
  ADD COLUMN IF NOT EXISTS "status_before_pause" "ReviewStatus",
  ADD COLUMN IF NOT EXISTS "status_before_suspend" "ReviewStatus",
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paused_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resumed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "suspended_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "suspension_expires_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "banned_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "unbanned_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "status_changed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verification_submitted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verification_reviewed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "assigned_reviewer_id" UUID;

CREATE TABLE IF NOT EXISTS "account_status_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "profile_id" UUID,
  "event_type" "AccountStatusEventType" NOT NULL,
  "previous_status" "ReviewStatus",
  "new_status" "ReviewStatus",
  "reason" TEXT,
  "internal_admin_note" TEXT,
  "public_user_message" TEXT,
  "performed_by_admin_id" UUID,
  "performed_by_admin_name" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_status_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "account_status_history_user_id_created_at_idx"
  ON "account_status_history"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "account_status_history_profile_id_created_at_idx"
  ON "account_status_history"("profile_id", "created_at");
CREATE INDEX IF NOT EXISTS "account_status_history_event_type_created_at_idx"
  ON "account_status_history"("event_type", "created_at");
CREATE INDEX IF NOT EXISTS "account_status_history_created_at_idx"
  ON "account_status_history"("created_at");

DO $$ BEGIN
  ALTER TABLE "account_status_history"
    ADD CONSTRAINT "account_status_history_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "account_status_history"
    ADD CONSTRAINT "account_status_history_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "account_status_history"
    ADD CONSTRAINT "account_status_history_performed_by_admin_id_fkey"
    FOREIGN KEY ("performed_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "account_appeals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "profile_id" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "message" TEXT NOT NULL,
  "admin_response" TEXT,
  "reviewed_by_id" UUID,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_appeals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "account_appeals_user_id_submitted_at_idx"
  ON "account_appeals"("user_id", "submitted_at");
CREATE INDEX IF NOT EXISTS "account_appeals_status_submitted_at_idx"
  ON "account_appeals"("status", "submitted_at");

DO $$ BEGIN
  ALTER TABLE "account_appeals"
    ADD CONSTRAINT "account_appeals_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "account_appeals"
    ADD CONSTRAINT "account_appeals_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "account_appeals"
    ADD CONSTRAINT "account_appeals_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "profiles_approved_at_idx" ON "profiles"("approved_at");
CREATE INDEX IF NOT EXISTS "profiles_banned_at_idx" ON "profiles"("banned_at");
CREATE INDEX IF NOT EXISTS "profiles_status_changed_at_idx" ON "profiles"("status_changed_at");
CREATE INDEX IF NOT EXISTS "profiles_submitted_at_idx" ON "profiles"("submitted_at");

-- Best-effort backfill timestamps from existing flags (no fabricated future dates).
UPDATE "profiles"
SET
  "approved_at" = COALESCE("approved_at", "updated_at"),
  "status_changed_at" = COALESCE("status_changed_at", "updated_at")
WHERE "approved" = true AND "review_status" = 'approved';

UPDATE "profiles"
SET
  "rejected_at" = COALESCE("rejected_at", "updated_at"),
  "status_changed_at" = COALESCE("status_changed_at", "updated_at")
WHERE "review_status" = 'rejected';

UPDATE "profiles"
SET
  "banned_at" = COALESCE("banned_at", "updated_at"),
  "status_changed_at" = COALESCE("status_changed_at", "updated_at")
WHERE "banned" = true;

UPDATE "profiles"
SET
  "submitted_at" = COALESCE("submitted_at", "updated_at"),
  "status_changed_at" = COALESCE("status_changed_at", "updated_at")
WHERE "questionnaire_complete" = true AND "submitted_at" IS NULL;

-- Seed one history row per existing profile so timelines are never empty.
INSERT INTO "account_status_history" (
  "id", "user_id", "profile_id", "event_type", "previous_status", "new_status",
  "public_user_message", "performed_by_admin_name", "created_at"
)
SELECT
  gen_random_uuid(),
  p."user_id",
  p."id",
  CASE
    WHEN p."banned" = true THEN 'banned'::"AccountStatusEventType"
    WHEN p."review_status" = 'approved' THEN 'approved'::"AccountStatusEventType"
    WHEN p."review_status" = 'rejected' THEN 'rejected'::"AccountStatusEventType"
    WHEN p."questionnaire_complete" = true THEN 'submitted'::"AccountStatusEventType"
    ELSE 'registered'::"AccountStatusEventType"
  END,
  NULL,
  p."review_status",
  'Account history started from existing membership record.',
  'System',
  COALESCE(p."created_at", CURRENT_TIMESTAMP)
FROM "profiles" p
WHERE NOT EXISTS (
  SELECT 1 FROM "account_status_history" h WHERE h."profile_id" = p."id"
);
