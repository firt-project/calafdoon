-- Phase 5: Nest profile media ordering + profile audit trail
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "additional_image_media_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "private_image_media_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TYPE "ProfileAuditAction" AS ENUM (
  'profile_ensure',
  'profile_update',
  'profile_gender_complete',
  'questionnaire_autosave',
  'questionnaire_update',
  'questionnaire_complete',
  'preferences_upsert',
  'wali_update',
  'photo_sign_upload',
  'photo_confirm',
  'photo_delete',
  'photo_reorder',
  'score_recalc_stub'
);

CREATE TABLE IF NOT EXISTS "profile_audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "profile_id" UUID,
  "action" "ProfileAuditAction" NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "profile_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "profile_audit_events_user_id_created_at_idx" ON "profile_audit_events"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "profile_audit_events_profile_id_created_at_idx" ON "profile_audit_events"("profile_id", "created_at");
CREATE INDEX IF NOT EXISTS "profile_audit_events_action_created_at_idx" ON "profile_audit_events"("action", "created_at");

ALTER TABLE "profile_audit_events"
  ADD CONSTRAINT "profile_audit_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "profile_audit_events"
  ADD CONSTRAINT "profile_audit_events_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
