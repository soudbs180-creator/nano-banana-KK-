-- Ensure limit-related columns exist on admin_credit_models.
-- Safe to run repeatedly.

BEGIN;

ALTER TABLE public.admin_credit_models
  ADD COLUMN IF NOT EXISTS call_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_calls_limit INTEGER,
  ADD COLUMN IF NOT EXISTS auto_pause_on_limit BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS color_secondary TEXT,
  ADD COLUMN IF NOT EXISTS text_color TEXT DEFAULT 'white';

COMMIT;
