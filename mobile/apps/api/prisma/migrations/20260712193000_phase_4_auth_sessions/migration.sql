-- Phase 4: local NestJS auth sessions, password reset tokens, audit events

-- Alter PasswordAlgo to include argon2id (preferred for new/changed passwords)
ALTER TYPE "PasswordAlgo" ADD VALUE IF NOT EXISTS 'argon2id';

CREATE TYPE "AuthAuditAction" AS ENUM (
  'login_success',
  'login_failure',
  'logout',
  'logout_all',
  'password_change',
  'password_reset_request',
  'password_reset_success',
  'password_reset_failure',
  'session_revoked',
  'rehash_success',
  'rehash_failure'
);

CREATE TABLE "sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "absolute_expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "ip_hash" TEXT,
  "user_agent_hash" TEXT,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "password_reset_tokens" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip_hash" TEXT,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "auth_audit_events" (
  "id" UUID NOT NULL,
  "user_id" UUID,
  "action" "AuthAuditAction" NOT NULL,
  "metadata" JSONB,
  "ip_hash" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_audit_events_user_id_created_at_idx" ON "auth_audit_events"("user_id", "created_at");
CREATE INDEX "auth_audit_events_action_created_at_idx" ON "auth_audit_events"("action", "created_at");

ALTER TABLE "auth_audit_events"
  ADD CONSTRAINT "auth_audit_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
