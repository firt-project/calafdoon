-- Phase 8: payment fulfillment tracking, Stripe webhook events, mail delivery

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "fulfilled_at" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "fulfillment_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "payments_fulfillment_key_key" ON "payments"("fulfillment_key");
CREATE INDEX IF NOT EXISTS "payments_user_id_status_idx" ON "payments"("user_id", "status");
CREATE INDEX IF NOT EXISTS "payments_status_payment_created_at_idx" ON "payments"("status", "payment_created_at");

CREATE TYPE "StripeWebhookStatus" AS ENUM ('received', 'processing', 'completed', 'failed');
CREATE TYPE "MailDeliveryStatus" AS ENUM ('queued', 'sent', 'failed', 'skipped');

CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stripe_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "status" "StripeWebhookStatus" NOT NULL DEFAULT 'received',
    "error" TEXT,
    "payload_hash" TEXT NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "stripe_webhook_events_stripe_event_id_key" ON "stripe_webhook_events"("stripe_event_id");
CREATE INDEX IF NOT EXISTS "stripe_webhook_events_status_received_at_idx" ON "stripe_webhook_events"("status", "received_at");
CREATE INDEX IF NOT EXISTS "stripe_webhook_events_event_type_received_at_idx" ON "stripe_webhook_events"("event_type", "received_at");

CREATE TABLE IF NOT EXISTS "mail_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "idempotency_key" TEXT NOT NULL,
    "user_id" UUID,
    "to_hash" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "MailDeliveryStatus" NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mail_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mail_deliveries_idempotency_key_key" ON "mail_deliveries"("idempotency_key");
CREATE INDEX IF NOT EXISTS "mail_deliveries_user_id_created_at_idx" ON "mail_deliveries"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "mail_deliveries_status_created_at_idx" ON "mail_deliveries"("status", "created_at");
