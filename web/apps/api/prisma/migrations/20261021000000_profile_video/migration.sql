CREATE TYPE "ProfileVideoStatus" AS ENUM ('created', 'uploading', 'processing', 'ready', 'failed', 'rejected');

CREATE TABLE "profile_videos" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "bunny_video_id" TEXT NOT NULL,
  "status" "ProfileVideoStatus" NOT NULL DEFAULT 'created',
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "duration_sec" INTEGER,
  "encode_progress" INTEGER NOT NULL DEFAULT 0,
  "failure_reason" TEXT,
  "expires_at" TIMESTAMP(3),
  "last_checked_at" TIMESTAMP(3),
  "ready_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "profile_videos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "profile_videos_bunny_video_id_key" ON "profile_videos"("bunny_video_id");
CREATE INDEX "profile_videos_user_id_created_at_idx" ON "profile_videos"("user_id", "created_at");
CREATE INDEX "profile_videos_status_updated_at_idx" ON "profile_videos"("status", "updated_at");
ALTER TABLE "profile_videos" ADD CONSTRAINT "profile_videos_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Database-level guarantees: one active video and one pending upload per member.
CREATE UNIQUE INDEX "profile_videos_one_active_per_user"
  ON "profile_videos"("user_id") WHERE "is_active" = true;
CREATE UNIQUE INDEX "profile_videos_one_pending_per_user"
  ON "profile_videos"("user_id") WHERE "status" IN ('created', 'uploading', 'processing');

CREATE TABLE "bunny_video_cleanup" (
  "bunny_video_id" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bunny_video_cleanup_pkey" PRIMARY KEY ("bunny_video_id")
);
CREATE INDEX "bunny_video_cleanup_next_attempt_at_idx" ON "bunny_video_cleanup"("next_attempt_at");
