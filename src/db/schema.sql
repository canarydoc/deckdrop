-- Deckdrop V2 — Supabase Schema
-- Run this in the Supabase SQL editor

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT UNIQUE NOT NULL,
  credits      INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Jobs ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),
  user_email      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','processing','completed','failed')),
  company_name    TEXT,
  company_url     TEXT,
  email_body      TEXT,
  deck_markdown   TEXT,
  report_markdown TEXT,
  report_url      TEXT,
  total_cost_usd  NUMERIC(10,6),
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jobs_status_idx      ON jobs(status);
CREATE INDEX IF NOT EXISTS jobs_user_email_idx  ON jobs(user_email);
CREATE INDEX IF NOT EXISTS jobs_created_at_idx  ON jobs(created_at DESC);

-- ── API Call Log ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_calls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID REFERENCES jobs(id),
  service         TEXT NOT NULL,    -- 'llm' | 'exa' | 'mailersend'
  step            TEXT,             -- pipeline step name
  model           TEXT,             -- model id if LLM
  prompt          TEXT,
  response        TEXT,
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  cost_usd        NUMERIC(10,6),
  duration_ms     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_calls_job_id_idx ON api_calls(job_id);

-- ── Models ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS models (
  id                  TEXT PRIMARY KEY,     -- e.g. 'google/gemini-2.5-pro-preview'
  display_name        TEXT NOT NULL,
  provider            TEXT NOT NULL,        -- 'google' | 'openai' | 'anthropic' etc
  context_window      INTEGER,
  max_output_tokens   INTEGER,
  cost_per_1k_input   NUMERIC(10,6),
  cost_per_1k_output  NUMERIC(10,6),
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Pipeline Config ────────────────────────────────────────────────────────────
-- Key-value store for all pipeline parameters
CREATE TABLE IF NOT EXISTS pipeline_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Prompts ────────────────────────────────────────────────────────────────────
-- Editable prompt templates, referenced by key in pipeline steps
CREATE TABLE IF NOT EXISTS prompts (
  key         TEXT PRIMARY KEY,
  template    TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Storage ───────────────────────────────────────────────────────────────────
-- Create 'reports' bucket manually in Supabase Dashboard > Storage
-- or via:
--   INSERT INTO storage.buckets (id, name, public) VALUES ('reports', 'reports', false);

-- ── Updated-at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER pipeline_config_updated_at
  BEFORE UPDATE ON pipeline_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER prompts_updated_at
  BEFORE UPDATE ON prompts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
