-- Preferred partner weight range (questionnaire collects a single preferred min weight).
ALTER TABLE "preferences"
  ADD COLUMN "min_weight" INTEGER NOT NULL DEFAULT 45,
  ADD COLUMN "max_weight" INTEGER NOT NULL DEFAULT 150;
