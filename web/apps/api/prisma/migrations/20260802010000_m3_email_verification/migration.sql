-- M3: email verification tokens + audit actions.
-- Existing users with an email are treated as verified (backfill below).
-- New registrations leave email_verification_time NULL until confirmed.

ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'email_verification_sent';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'email_verification_send_failed';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'email_verification_success';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'email_verification_failure';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'email_verification_resend';

CREATE TABLE "email_verification_tokens" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip_hash" TEXT,
  CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key"
  ON "email_verification_tokens"("token_hash");
CREATE INDEX "email_verification_tokens_user_id_idx"
  ON "email_verification_tokens"("user_id");
CREATE INDEX "email_verification_tokens_expires_at_idx"
  ON "email_verification_tokens"("expires_at");

ALTER TABLE "email_verification_tokens"
  ADD CONSTRAINT "email_verification_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Safe existing-user policy: accounts that already have an email are verified
-- at migration time so production members are not locked out. Newly registered
-- users (post-deploy) keep email_verification_time NULL until they confirm.
UPDATE "users"
SET "email_verification_time" = COALESCE("email_verification_time", "created_at")
WHERE "email" IS NOT NULL
  AND "email_verification_time" IS NULL;
