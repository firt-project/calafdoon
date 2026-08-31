-- Phase 3: extend media_objects for MinIO/S3 file migration metadata

CREATE TYPE "MediaMigrationStatus" AS ENUM ('pending', 'uploaded', 'verified', 'failed', 'skipped');

ALTER TABLE "media_objects"
  ADD COLUMN IF NOT EXISTS "bucket" TEXT,
  ADD COLUMN IF NOT EXISTS "convex_owner_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "migration_status" "MediaMigrationStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "source_table" TEXT,
  ADD COLUMN IF NOT EXISTS "source_record_convex_id" TEXT,
  ADD COLUMN IF NOT EXISTS "source_refs" JSONB,
  ADD COLUMN IF NOT EXISTS "migrated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failure_reason" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "media_objects_bucket_object_key_key"
  ON "media_objects"("bucket", "object_key");

CREATE INDEX IF NOT EXISTS "media_objects_migration_status_idx"
  ON "media_objects"("migration_status");

CREATE INDEX IF NOT EXISTS "media_objects_owner_user_id_idx"
  ON "media_objects"("owner_user_id");
