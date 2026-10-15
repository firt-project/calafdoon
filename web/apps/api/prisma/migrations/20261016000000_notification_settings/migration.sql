CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "user_id" UUID NOT NULL,
  "push_messages" BOOLEAN NOT NULL DEFAULT true,
  "push_likes" BOOLEAN NOT NULL DEFAULT true,
  "push_matches" BOOLEAN NOT NULL DEFAULT true,
  "push_announcements" BOOLEAN NOT NULL DEFAULT true,
  "email_announcements" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "conversation_mutes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_mutes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_mutes_user_id_conversation_id_key" ON "conversation_mutes"("user_id", "conversation_id");
ALTER TABLE "conversation_mutes" ADD CONSTRAINT "conversation_mutes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
