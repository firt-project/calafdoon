ALTER TYPE "MediaPurpose" ADD VALUE IF NOT EXISTS 'verification_selfie';
CREATE TYPE "PhotoVerificationStatus" AS ENUM ('pending', 'approved', 'rejected');
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "photo_verified" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS "photo_verifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "media_id" UUID NOT NULL,
  "prompt" TEXT NOT NULL,
  "status" "PhotoVerificationStatus" NOT NULL DEFAULT 'pending',
  "reject_reason" TEXT,
  "reviewed_by_id" UUID,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "photo_verifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "photo_verifications_user_id_created_at_idx" ON "photo_verifications"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "photo_verifications_status_created_at_idx" ON "photo_verifications"("status", "created_at");
ALTER TABLE "photo_verifications" ADD CONSTRAINT "photo_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
