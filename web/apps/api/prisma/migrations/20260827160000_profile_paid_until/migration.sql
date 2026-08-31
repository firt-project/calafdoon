-- Waafi/EVC membership period: access until paid_until, then re-pay $4.99.
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "paid_until" TIMESTAMP(3);
