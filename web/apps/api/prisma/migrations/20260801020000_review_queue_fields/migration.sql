-- Extend account status for review queue / request-changes / assignment.

ALTER TYPE "ReviewStatus" ADD VALUE IF NOT EXISTS 'changes_requested';

ALTER TYPE "AccountStatusEventType" ADD VALUE IF NOT EXISTS 'changes_requested';
ALTER TYPE "AccountStatusEventType" ADD VALUE IF NOT EXISTS 'resubmitted';
ALTER TYPE "AccountStatusEventType" ADD VALUE IF NOT EXISTS 'reviewer_assigned';

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "assigned_reviewer_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "review_started_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "review_completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "changes_requested_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "changes_deadline_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resubmitted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "allow_resubmission" BOOLEAN;

CREATE INDEX IF NOT EXISTS "profiles_assigned_reviewer_id_idx"
  ON "profiles"("assigned_reviewer_id");
CREATE INDEX IF NOT EXISTS "profiles_changes_requested_at_idx"
  ON "profiles"("changes_requested_at");
