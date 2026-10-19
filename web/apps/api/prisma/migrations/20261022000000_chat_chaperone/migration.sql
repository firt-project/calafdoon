CREATE TYPE "ChaperoneStatus" AS ENUM ('pending', 'active', 'declined', 'revoked');

CREATE TABLE "chat_chaperones" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL,
  "invited_by_id" UUID NOT NULL,
  "guardian_name" TEXT NOT NULL,
  "relationship" TEXT NOT NULL,
  "status" "ChaperoneStatus" NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMP(3),
  "accepted_at" TIMESTAMP(3),
  "last_viewed_at" TIMESTAMP(3),
  "view_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_chaperones_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "chat_chaperones_conversation_id_status_idx" ON "chat_chaperones"("conversation_id", "status");
ALTER TABLE "chat_chaperones" ADD CONSTRAINT "chat_chaperones_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_chaperones" ADD CONSTRAINT "chat_chaperones_invited_by_id_fkey"
  FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- One open (pending or active) guardian per member per conversation.
CREATE UNIQUE INDEX "chat_chaperones_one_open_per_member"
  ON "chat_chaperones"("conversation_id", "invited_by_id") WHERE "status" IN ('pending', 'active');
