-- Deckdrop V2 — Migration v1
-- Add the few columns that the code uses but weren't in the initial schema

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS input_type TEXT DEFAULT 'url' CHECK (input_type IN ('url', 'deck', 'both')),
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
