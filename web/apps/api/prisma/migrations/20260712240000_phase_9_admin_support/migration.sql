-- Phase 9: admin support — audit SetNull, invite token hash, deletion jobs

ALTER TABLE "staff_invites" ADD COLUMN IF NOT EXISTS "token_hash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "staff_invites_token_hash_key" ON "staff_invites"("token_hash");

ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "correlation_id" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "request_id" TEXT;

CREATE INDEX IF NOT EXISTS "audit_logs_action_logged_at_idx" ON "audit_logs"("action", "logged_at");

-- Recreate target FKs with ON DELETE SET NULL (leave audit rows when targets deleted)
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_target_user_id_fkey";
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_target_profile_id_fkey";

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_target_user_id_fkey"
  FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_target_profile_id_fkey"
  FOREIGN KEY ("target_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "deletion_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "target_user_id" UUID,
    "target_profile_id" UUID,
    "actor_user_id" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "plan_json" JSONB NOT NULL,
    "result_json" JSONB,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "deletion_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "deletion_jobs_actor_user_id_created_at_idx" ON "deletion_jobs"("actor_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "deletion_jobs_status_created_at_idx" ON "deletion_jobs"("status", "created_at");

CREATE TABLE IF NOT EXISTS "orphaned_media_objects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "media_object_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "deletion_job_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purged_at" TIMESTAMP(3),
    CONSTRAINT "orphaned_media_objects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "orphaned_media_objects_media_object_id_idx" ON "orphaned_media_objects"("media_object_id");
CREATE INDEX IF NOT EXISTS "orphaned_media_objects_deletion_job_id_idx" ON "orphaned_media_objects"("deletion_job_id");
