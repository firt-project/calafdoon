-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin', 'owner');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('incomplete', 'pending_review', 'approved', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "PhotoVisibility" AS ENUM ('everyone', 'matches', 'private');

-- CreateEnum
CREATE TYPE "LikeAction" AS ENUM ('like', 'pass', 'shortlist');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('active', 'archived', 'unmatched');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('like', 'match', 'message', 'announcement', 'approval', 'payment');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('registration', 'registration_premium', 'premium_upgrade', 'chat');

-- CreateEnum
CREATE TYPE "RegistrationTier" AS ENUM ('basic', 'premium');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('all', 'paid', 'trial', 'unpaid');

-- CreateEnum
CREATE TYPE "StaffInviteStatus" AS ENUM ('pending', 'accepted', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'reviewed', 'dismissed');

-- CreateEnum
CREATE TYPE "ReportPriority" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "SupportTopic" AS ENUM ('photo_upload', 'account', 'payment', 'other', 'contact_form');

-- CreateEnum
CREATE TYPE "SupportSource" AS ENUM ('profile', 'questionnaire', 'contact_page', 'other');

-- CreateEnum
CREATE TYPE "SupportContactStatus" AS ENUM ('open', 'reviewed', 'closed');

-- CreateEnum
CREATE TYPE "SupportAuthorRole" AS ENUM ('member', 'admin', 'visitor');

-- CreateEnum
CREATE TYPE "MemberEmailKind" AS ENUM ('reminder_profile', 'reminder_payment', 'reminder_trial_ending', 'reminder_signup_incomplete', 'request_profile_photo');

-- CreateEnum
CREATE TYPE "EvcStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('profile_main', 'profile_additional', 'profile_private', 'chat_image', 'evc_screenshot', 'support_attachment', 'unknown');

-- CreateEnum
CREATE TYPE "MigrationRunStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "PasswordAlgo" AS ENUM ('lucia_scrypt', 'unknown');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "email" TEXT,
    "email_normalized" TEXT,
    "name" TEXT,
    "image" TEXT,
    "phone" TEXT,
    "email_verification_time" TIMESTAMP(3),
    "phone_verification_time" TIMESTAMP(3),
    "is_anonymous" BOOLEAN,
    "gender" "Gender",
    "must_reset_password" BOOLEAN NOT NULL DEFAULT false,
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_accounts" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "convex_user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "password_hash" TEXT,
    "password_algo" "PasswordAlgo" NOT NULL DEFAULT 'lucia_scrypt',
    "email_verified" BOOLEAN,
    "phone_verified" BOOLEAN,
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "convex_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "age" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "location_lat" DOUBLE PRECISION,
    "location_lng" DOUBLE PRECISION,
    "location_accuracy_m" DOUBLE PRECISION,
    "location_verified_at" TIMESTAMP(3),
    "education" TEXT NOT NULL,
    "occupation" TEXT NOT NULL,
    "religious_level" TEXT NOT NULL,
    "marital_status" TEXT NOT NULL,
    "children" INTEGER NOT NULL,
    "bio" TEXT NOT NULL,
    "profile_image_convex_id" TEXT,
    "profile_image_media_id" UUID,
    "verified" BOOLEAN NOT NULL,
    "role" "UserRole" NOT NULL,
    "phone" TEXT,
    "prayer_frequency" TEXT NOT NULL,
    "spouse_prayer_importance" TEXT,
    "wears_hijab" BOOLEAN,
    "has_beard" BOOLEAN,
    "smokes" TEXT NOT NULL,
    "substance_details" TEXT,
    "drinks_alcohol" TEXT NOT NULL,
    "exercise" TEXT NOT NULL,
    "want_children" TEXT NOT NULL,
    "family_involvement" TEXT,
    "living_situation" TEXT,
    "madhhab" TEXT,
    "polygyny_openness" TEXT,
    "has_current_wife" TEXT,
    "open_to_second_wife" TEXT,
    "accept_man_with_wife" TEXT,
    "accept_previously_married_man" TEXT,
    "accept_future_co_wife" TEXT,
    "languages_spoken" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "citizenship_status" TEXT,
    "financial_readiness" TEXT,
    "marriage_work_preference" TEXT,
    "marriage_timeline" TEXT NOT NULL,
    "ready_to_relocate" TEXT,
    "love_language" TEXT,
    "marry_someone_with_children" TEXT NOT NULL,
    "qualities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hobbies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "questionnaire_complete" BOOLEAN NOT NULL,
    "questionnaire_step" INTEGER,
    "last_saved_at" TIMESTAMP(3),
    "registration_complete" BOOLEAN,
    "has_paid" BOOLEAN NOT NULL,
    "gender_locked" BOOLEAN,
    "trial_ends_at" TIMESTAMP(3),
    "has_personal_support" BOOLEAN,
    "advisor_reviewed" BOOLEAN,
    "additional_image_convex_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "private_image_convex_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "wali_name" TEXT,
    "wali_phone" TEXT,
    "banned" BOOLEAN NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "review_status" "ReviewStatus",
    "photo_visibility" "PhotoVisibility",
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preferences" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "convex_user_id" TEXT NOT NULL,
    "preferred_gender" "Gender" NOT NULL,
    "min_age" INTEGER NOT NULL,
    "max_age" INTEGER NOT NULL,
    "min_height" INTEGER NOT NULL,
    "max_height" INTEGER NOT NULL,
    "preferred_countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accept_children" TEXT NOT NULL,
    "education_level" TEXT NOT NULL,
    "religious_level" TEXT,
    "accept_divorcee" TEXT NOT NULL,
    "accept_widow" TEXT NOT NULL,
    "max_distance" TEXT,
    "qualities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hobbies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "partner_beard" TEXT,
    "partner_hijab_level" TEXT,
    "ready_to_relocate" TEXT,
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compatibility_scores" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "user_a_id" UUID NOT NULL,
    "user_b_id" UUID NOT NULL,
    "convex_user_a" TEXT NOT NULL,
    "convex_user_b" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "score_version" INTEGER NOT NULL DEFAULT 1,
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compatibility_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "likes" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "convex_from_user_id" TEXT NOT NULL,
    "convex_to_user_id" TEXT NOT NULL,
    "action" "LikeAction" NOT NULL,
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "user_a_id" UUID NOT NULL,
    "user_b_id" UUID NOT NULL,
    "convex_user_a" TEXT NOT NULL,
    "convex_user_b" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "status" "MatchStatus" NOT NULL,
    "chat_unlocked" BOOLEAN NOT NULL,
    "seen_at_by_user" JSONB,
    "archived_at" TIMESTAMP(3),
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "match_id" UUID NOT NULL,
    "convex_match_id" TEXT NOT NULL,
    "participant_convex_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_message_at" TIMESTAMP(3) NOT NULL,
    "unread_by_user" JSONB,
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "conversation_id" UUID NOT NULL,
    "convex_conversation_id" TEXT NOT NULL,
    "sender_id" UUID NOT NULL,
    "convex_sender_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "image_convex_id" TEXT,
    "image_media_id" UUID,
    "read" BOOLEAN NOT NULL,
    "message_created_at" TIMESTAMP(3) NOT NULL,
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "convex_user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL,
    "related_user_id" UUID,
    "convex_related_user_id" TEXT,
    "notification_created_at" TIMESTAMP(3) NOT NULL,
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "convex_user_id" TEXT NOT NULL,
    "stripe_session_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "payment_type" "PaymentType",
    "registration_tier" "RegistrationTier",
    "match_id" UUID,
    "convex_match_id" TEXT,
    "status" "PaymentStatus" NOT NULL,
    "payment_created_at" TIMESTAMP(3) NOT NULL,
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "announcement_created_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "convex_created_by" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "audience" "AnnouncementAudience",
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_uploads" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "convex_user_id" TEXT NOT NULL,
    "convex_storage_id" TEXT NOT NULL,
    "media_object_id" UUID,
    "uploaded_at" TIMESTAMP(3) NOT NULL,
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_invites" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'admin',
    "invited_by_id" UUID NOT NULL,
    "convex_invited_by" TEXT NOT NULL,
    "status" "StaffInviteStatus" NOT NULL,
    "invite_created_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "accepted_by_user_id" UUID,
    "convex_accepted_by_user_id" TEXT,
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "convex_blocker_id" TEXT NOT NULL,
    "convex_blocked_id" TEXT NOT NULL,
    "blocked_at" TIMESTAMP(3) NOT NULL,
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reported_user_id" UUID NOT NULL,
    "convex_reporter_id" TEXT NOT NULL,
    "convex_reported_user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL,
    "priority" "ReportPriority",
    "admin_notes" TEXT,
    "resolution" TEXT,
    "report_created_at" TIMESTAMP(3) NOT NULL,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" UUID,
    "convex_reviewed_by" TEXT,
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_contacts" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "user_id" UUID,
    "convex_user_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "topic" "SupportTopic" NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "image_convex_id" TEXT,
    "image_media_id" UUID,
    "source" "SupportSource" NOT NULL,
    "status" "SupportContactStatus" NOT NULL,
    "admin_notes" TEXT,
    "contact_created_at" TIMESTAMP(3) NOT NULL,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" UUID,
    "convex_reviewed_by" TEXT,
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "contact_id" UUID NOT NULL,
    "convex_contact_id" TEXT NOT NULL,
    "author_user_id" UUID,
    "convex_author_user_id" TEXT,
    "author_role" "SupportAuthorRole" NOT NULL,
    "body" TEXT NOT NULL,
    "message_created_at" TIMESTAMP(3) NOT NULL,
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_email_logs" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "convex_user_id" TEXT NOT NULL,
    "kind" "MemberEmailKind" NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_metrics" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'global',
    "total_users" INTEGER NOT NULL,
    "male_users" INTEGER NOT NULL,
    "female_users" INTEGER NOT NULL,
    "approved_male" INTEGER NOT NULL,
    "approved_female" INTEGER NOT NULL,
    "approved_total" INTEGER NOT NULL,
    "paid_basic_members" INTEGER NOT NULL,
    "free_basic_women" INTEGER NOT NULL,
    "paid_premium_count" INTEGER NOT NULL,
    "unpaid_count" INTEGER NOT NULL,
    "trial_count" INTEGER NOT NULL,
    "pending_approval" INTEGER NOT NULL,
    "banned_users" INTEGER NOT NULL,
    "paid_members" INTEGER NOT NULL,
    "member_count" INTEGER NOT NULL,
    "complete_members" INTEGER NOT NULL,
    "trial_members" INTEGER NOT NULL,
    "gender_breakdown" JSONB NOT NULL,
    "review_breakdown" JSONB NOT NULL,
    "country_breakdown" JSONB NOT NULL,
    "monthly_signups" JSONB NOT NULL,
    "metrics_updated_at" TIMESTAMP(3) NOT NULL,
    "rebuild_scheduled_at" TIMESTAMP(3),
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "convex_actor_user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_user_id" UUID,
    "convex_target_user_id" TEXT,
    "target_profile_id" UUID,
    "convex_target_profile_id" TEXT,
    "metadata" TEXT,
    "logged_at" TIMESTAMP(3) NOT NULL,
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evc_payment_proofs" (
    "id" UUID NOT NULL,
    "convex_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "convex_user_id" TEXT NOT NULL,
    "convex_profile_id" TEXT NOT NULL,
    "tier" "RegistrationTier" NOT NULL,
    "payer_full_name" TEXT NOT NULL,
    "last_four_digits" TEXT NOT NULL,
    "screenshot_convex_id" TEXT NOT NULL,
    "screenshot_media_id" UUID,
    "amount_cents" INTEGER NOT NULL,
    "status" "EvcStatus" NOT NULL,
    "proof_created_at" TIMESTAMP(3) NOT NULL,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" UUID,
    "convex_reviewed_by" TEXT,
    "rejection_reason" TEXT,
    "convex_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evc_payment_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_objects" (
    "id" UUID NOT NULL,
    "convex_storage_id" TEXT NOT NULL,
    "purpose" "MediaPurpose" NOT NULL DEFAULT 'unknown',
    "object_key" TEXT,
    "content_type" TEXT,
    "size_bytes" BIGINT,
    "checksum_sha256" TEXT,
    "owner_user_id" UUID,
    "verified_readable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_runs" (
    "id" UUID NOT NULL,
    "source_export_path" TEXT NOT NULL,
    "source_export_hash" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "status" "MigrationRunStatus" NOT NULL DEFAULT 'pending',
    "dry_run" BOOLEAN NOT NULL DEFAULT false,
    "table_counts" JSONB,
    "inserted_counts" JSONB,
    "updated_counts" JSONB,
    "skipped_counts" JSONB,
    "failure_counts" JSONB,
    "orphan_counts" JSONB,
    "file_counts" JSONB,
    "validation_result" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "migration_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_failures" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "table_name" TEXT NOT NULL,
    "convex_id" TEXT,
    "reason_code" TEXT NOT NULL,
    "safe_detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_failures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_convex_id_key" ON "users"("convex_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_normalized_key" ON "users"("email_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "auth_accounts_convex_id_key" ON "auth_accounts"("convex_id");

-- CreateIndex
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts"("user_id");

-- CreateIndex
CREATE INDEX "auth_accounts_convex_user_id_idx" ON "auth_accounts"("convex_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_accounts_provider_provider_account_id_key" ON "auth_accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_convex_id_key" ON "profiles"("convex_id");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE INDEX "profiles_gender_idx" ON "profiles"("gender");

-- CreateIndex
CREATE INDEX "profiles_country_idx" ON "profiles"("country");

-- CreateIndex
CREATE INDEX "profiles_approved_idx" ON "profiles"("approved");

-- CreateIndex
CREATE INDEX "profiles_review_status_idx" ON "profiles"("review_status");

-- CreateIndex
CREATE INDEX "profiles_role_idx" ON "profiles"("role");

-- CreateIndex
CREATE INDEX "profiles_convex_user_id_idx" ON "profiles"("convex_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "preferences_convex_id_key" ON "preferences"("convex_id");

-- CreateIndex
CREATE UNIQUE INDEX "preferences_user_id_key" ON "preferences"("user_id");

-- CreateIndex
CREATE INDEX "preferences_convex_user_id_idx" ON "preferences"("convex_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "compatibility_scores_convex_id_key" ON "compatibility_scores"("convex_id");

-- CreateIndex
CREATE INDEX "compatibility_scores_user_a_id_score_idx" ON "compatibility_scores"("user_a_id", "score");

-- CreateIndex
CREATE INDEX "compatibility_scores_user_b_id_score_idx" ON "compatibility_scores"("user_b_id", "score");

-- CreateIndex
CREATE UNIQUE INDEX "compatibility_scores_user_a_id_user_b_id_key" ON "compatibility_scores"("user_a_id", "user_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "likes_convex_id_key" ON "likes"("convex_id");

-- CreateIndex
CREATE INDEX "likes_to_user_id_idx" ON "likes"("to_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "likes_from_user_id_to_user_id_key" ON "likes"("from_user_id", "to_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "matches_convex_id_key" ON "matches"("convex_id");

-- CreateIndex
CREATE INDEX "matches_user_a_id_idx" ON "matches"("user_a_id");

-- CreateIndex
CREATE INDEX "matches_user_b_id_idx" ON "matches"("user_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "matches_user_a_id_user_b_id_key" ON "matches"("user_a_id", "user_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_convex_id_key" ON "conversations"("convex_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_match_id_key" ON "conversations"("match_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_convex_id_key" ON "messages"("convex_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_message_created_at_idx" ON "messages"("conversation_id", "message_created_at");

-- CreateIndex
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_convex_id_key" ON "notifications"("convex_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_notification_created_at_idx" ON "notifications"("user_id", "notification_created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_idx" ON "notifications"("user_id", "read");

-- CreateIndex
CREATE UNIQUE INDEX "payments_convex_id_key" ON "payments"("convex_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_session_id_key" ON "payments"("stripe_session_id");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "announcements_convex_id_key" ON "announcements"("convex_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_uploads_convex_id_key" ON "user_uploads"("convex_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_uploads_convex_storage_id_key" ON "user_uploads"("convex_storage_id");

-- CreateIndex
CREATE INDEX "user_uploads_user_id_idx" ON "user_uploads"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_invites_convex_id_key" ON "staff_invites"("convex_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_invites_token_key" ON "staff_invites"("token");

-- CreateIndex
CREATE INDEX "staff_invites_email_idx" ON "staff_invites"("email");

-- CreateIndex
CREATE INDEX "staff_invites_status_idx" ON "staff_invites"("status");

-- CreateIndex
CREATE UNIQUE INDEX "blocks_convex_id_key" ON "blocks"("convex_id");

-- CreateIndex
CREATE INDEX "blocks_blocked_id_idx" ON "blocks"("blocked_id");

-- CreateIndex
CREATE UNIQUE INDEX "blocks_blocker_id_blocked_id_key" ON "blocks"("blocker_id", "blocked_id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_convex_id_key" ON "reports"("convex_id");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "reports_reporter_id_reported_user_id_idx" ON "reports"("reporter_id", "reported_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_contacts_convex_id_key" ON "support_contacts"("convex_id");

-- CreateIndex
CREATE INDEX "support_contacts_status_idx" ON "support_contacts"("status");

-- CreateIndex
CREATE INDEX "support_contacts_user_id_idx" ON "support_contacts"("user_id");

-- CreateIndex
CREATE INDEX "support_contacts_contact_created_at_idx" ON "support_contacts"("contact_created_at");

-- CreateIndex
CREATE UNIQUE INDEX "support_messages_convex_id_key" ON "support_messages"("convex_id");

-- CreateIndex
CREATE INDEX "support_messages_contact_id_idx" ON "support_messages"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_email_logs_convex_id_key" ON "member_email_logs"("convex_id");

-- CreateIndex
CREATE INDEX "member_email_logs_user_id_kind_idx" ON "member_email_logs"("user_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "site_metrics_convex_id_key" ON "site_metrics"("convex_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_metrics_key_key" ON "site_metrics"("key");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_convex_id_key" ON "audit_logs"("convex_id");

-- CreateIndex
CREATE INDEX "audit_logs_logged_at_idx" ON "audit_logs"("logged_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_target_user_id_idx" ON "audit_logs"("target_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "evc_payment_proofs_convex_id_key" ON "evc_payment_proofs"("convex_id");

-- CreateIndex
CREATE INDEX "evc_payment_proofs_user_id_idx" ON "evc_payment_proofs"("user_id");

-- CreateIndex
CREATE INDEX "evc_payment_proofs_status_proof_created_at_idx" ON "evc_payment_proofs"("status", "proof_created_at");

-- CreateIndex
CREATE UNIQUE INDEX "media_objects_convex_storage_id_key" ON "media_objects"("convex_storage_id");

-- CreateIndex
CREATE INDEX "media_objects_purpose_idx" ON "media_objects"("purpose");

-- CreateIndex
CREATE INDEX "migration_runs_started_at_idx" ON "migration_runs"("started_at");

-- CreateIndex
CREATE INDEX "migration_failures_run_id_idx" ON "migration_failures"("run_id");

-- CreateIndex
CREATE INDEX "migration_failures_table_name_idx" ON "migration_failures"("table_name");

-- AddForeignKey
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compatibility_scores" ADD CONSTRAINT "compatibility_scores_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compatibility_scores" ADD CONSTRAINT "compatibility_scores_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_uploads" ADD CONSTRAINT "user_uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_uploads" ADD CONSTRAINT "user_uploads_media_object_id_fkey" FOREIGN KEY ("media_object_id") REFERENCES "media_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_contacts" ADD CONSTRAINT "support_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_contacts" ADD CONSTRAINT "support_contacts_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "support_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_email_logs" ADD CONSTRAINT "member_email_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_target_profile_id_fkey" FOREIGN KEY ("target_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evc_payment_proofs" ADD CONSTRAINT "evc_payment_proofs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evc_payment_proofs" ADD CONSTRAINT "evc_payment_proofs_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evc_payment_proofs" ADD CONSTRAINT "evc_payment_proofs_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_objects" ADD CONSTRAINT "media_objects_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_failures" ADD CONSTRAINT "migration_failures_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "migration_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
