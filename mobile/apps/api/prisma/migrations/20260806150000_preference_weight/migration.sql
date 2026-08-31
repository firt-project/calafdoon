-- Preferred partner weight (kg) for shortened questionnaire.
ALTER TABLE "preferences"
  ADD COLUMN IF NOT EXISTS "min_weight" INTEGER NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS "max_weight" INTEGER NOT NULL DEFAULT 150;
