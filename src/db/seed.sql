-- Deckdrop V2 — Seed Data
-- Run AFTER schema.sql

-- ── Models ────────────────────────────────────────────────────────────────────
INSERT INTO models (id, display_name, provider, context_window, max_output_tokens, cost_per_1k_input, cost_per_1k_output, enabled, notes) VALUES
  ('google/gemini-2.5-pro-preview',     'Gemini 2.5 Pro',          'google',    1000000, 8192,  0.00125, 0.01,    TRUE,  'Best for synthesis, deep reasoning'),
  ('google/gemini-2.0-flash-001',       'Gemini 2.0 Flash',        'google',    1000000, 8192,  0.0001,  0.0004,  TRUE,  'Fast, cheap — good for extraction'),
  ('openai/gpt-4o',                     'GPT-4o',                  'openai',    128000,  16384, 0.0025,  0.01,    TRUE,  'Strong all-rounder'),
  ('openai/gpt-4o-mini',                'GPT-4o Mini',             'openai',    128000,  16384, 0.00015, 0.0006,  TRUE,  'Cost-effective for simple steps'),
  ('anthropic/claude-sonnet-4-6',       'Claude Sonnet 4.6',       'anthropic', 200000,  8192,  0.003,   0.015,   TRUE,  'Excellent at structured reports'),
  ('anthropic/claude-haiku-4-5-20251001','Claude Haiku 4.5',       'anthropic', 200000,  8192,  0.0008,  0.004,   TRUE,  'Fastest Anthropic model')
ON CONFLICT (id) DO NOTHING;

-- ── Pipeline Config ────────────────────────────────────────────────────────────
INSERT INTO pipeline_config (key, value, description) VALUES
  -- Models per step
  ('extraction_model',      'google/gemini-2.0-flash-001',   'Model for step 1: extract company info from email'),
  ('discovery_model',       'google/gemini-2.0-flash-001',   'Model for step 2: generate Exa search queries'),
  ('synthesis_model',       'google/gemini-2.5-pro-preview', 'Model for step 4: synthesize full report'),
  ('gap_analysis_model',    'google/gemini-2.0-flash-001',   'Model for step 5: gap analysis & follow-up queries'),

  -- Exa settings
  ('exa_similar_results',   '10',   'Number of results from findSimilar (step 2)'),
  ('exa_search_results',    '8',    'Number of results per keyword search (step 2)'),
  ('exa_layer2_results',    '5',    'Layer 2 findSimilar results per top competitor'),
  ('exa_layer2_top_n',      '5',    'Number of top competitors to run layer 2 on'),

  -- Gap analysis
  ('gap_analysis_enabled',  'true', 'Enable gap analysis step (step 5)'),
  ('gap_analysis_max_rounds','1',   'Max rounds of gap analysis'),

  -- Report
  ('report_max_competitors','15',   'Max competitors to include in final report')
ON CONFLICT (key) DO NOTHING;

-- ── Prompts ────────────────────────────────────────────────────────────────────
INSERT INTO prompts (key, template, description) VALUES

  ('step1_extract', E'You are an expert investment analyst. Extract structured company information from this email.\n\nEMAIL BODY:\n{{email_body}}\n\nDECK CONTENT (if any):\n{{deck_content}}\n\nExtract and return JSON with these fields:\n- company_name: string\n- company_url: string or null\n- description: string (2-3 sentences about what the company does)\n- stage: string (pre-seed/seed/series-a/etc or unknown)\n- sector: string\n- geography: string\n\nOnly return valid JSON, no markdown.', 'Step 1: Extract company info from email'),

  ('step1_descriptions', E'You are an expert at formulating web search queries for competitive research.\n\nCompany: {{company_name}}\nURL: {{company_url}}\nDescription: {{description}}\n\nGenerate 4 distinct keyword descriptions optimized for finding competitors via web search. Each should capture a different angle:\n1. Functional (what it does technically)\n2. Customer/problem (who it serves and what pain it solves)\n3. Category (market category / industry vertical)\n4. Technical stack or approach\n\nReturn JSON array of 4 strings. No markdown.', 'Step 1: Generate Exa query descriptions'),

  ('step4_synthesize', E'You are an expert investment analyst writing a comprehensive due diligence report.\n\nCOMPANY BEING ANALYZED:\nName: {{company_name}}\nURL: {{company_url}}\nDescription: {{description}}\n\nPITCH DECK CONTENT:\n{{deck_content}}\n\nCOMPETITOR RESEARCH:\n{{competitor_research}}\n\nWrite a comprehensive investment due diligence report in Markdown. Structure it with these sections:\n\n# [Company Name] — Investment Due Diligence Report\n\n## Executive Summary\n2-3 paragraph high-level overview, key strengths, risks, and investment thesis.\n\n## Company Analysis\nBusiness model, product/service, go-to-market, team (if known), traction/metrics.\n\n## Market Overview\nMarket size, growth dynamics, tailwinds and headwinds, timing.\n\n## Competitive Landscape\nMarkdown table: | Company | Description | Strengths | Weaknesses | Funding |\n\n## Competitor Deep Dives\nFor each major competitor: what they do, strengths, weaknesses, how the subject company competes.\n\n## Positioning Analysis\nHow the company differentiates. Where it wins, where it loses.\n\n## Market Sizing\nTAM/SAM/SOM estimate with reasoning.\n\n## Investment Considerations\n**Strengths:** bulleted list\n**Risks:** bulleted list\n**Key Questions:** bulleted list for founders\n\nBe analytical, specific, and direct. Use data from the research. Avoid vague language.', 'Step 4: Full report synthesis prompt'),

  ('step5_gap_analysis', E'You are reviewing a draft investment due diligence report to identify gaps.\n\nDRAFT REPORT:\n{{draft_report}}\n\nIdentify 3-5 specific gaps where additional research would meaningfully improve the report. For each gap, provide a targeted Exa search query.\n\nReturn JSON array of objects: [{\"gap\": \"description\", \"query\": \"search query\"}]\n\nOnly return valid JSON.', 'Step 5: Gap analysis prompt')

ON CONFLICT (key) DO NOTHING;

-- ── Test User ─────────────────────────────────────────────────────────────────
INSERT INTO users (email, credits) VALUES
  ('dagnytaggart1997@gmail.com', 100),
  ('alex@deckdrop.io', 999)
ON CONFLICT (email) DO NOTHING;
