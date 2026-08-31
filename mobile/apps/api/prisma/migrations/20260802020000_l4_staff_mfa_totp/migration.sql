-- L4: TOTP MFA for staff accounts

ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'mfa_enroll_start';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'mfa_enroll_confirm';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'mfa_enroll_cancel';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'mfa_disable';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'mfa_login_challenge';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'mfa_login_success';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'mfa_login_failure';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'mfa_recovery_used';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'mfa_recovery_regen';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'mfa_admin_reset';

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "mfa_secret_encrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "mfa_pending_secret_encrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "mfa_enabled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mfa_last_step" BIGINT;

CREATE TABLE IF NOT EXISTS "mfa_recovery_codes" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "code_hash" TEXT NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mfa_recovery_codes_user_id_idx" ON "mfa_recovery_codes"("user_id");

DO $$ BEGIN
  ALTER TABLE "mfa_recovery_codes"
    ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "mfa_login_challenges" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip_hash" TEXT,
  CONSTRAINT "mfa_login_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mfa_login_challenges_token_hash_key"
  ON "mfa_login_challenges"("token_hash");
CREATE INDEX IF NOT EXISTS "mfa_login_challenges_user_id_idx"
  ON "mfa_login_challenges"("user_id");
CREATE INDEX IF NOT EXISTS "mfa_login_challenges_expires_at_idx"
  ON "mfa_login_challenges"("expires_at");

DO $$ BEGIN
  ALTER TABLE "mfa_login_challenges"
    ADD CONSTRAINT "mfa_login_challenges_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
