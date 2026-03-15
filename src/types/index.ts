export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type InputType = 'url' | 'deck' | 'both';

export interface Job {
  id: string;
  user_email: string;
  status: JobStatus;
  input_type: InputType;
  input_url?: string;
  input_company_name?: string;
  input_deck_markdown?: string;
  report_storage_path?: string;
  total_cost_usd: number;
  error_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface User {
  id: string;
  email: string;
  credits: number;
  created_at: string;
}

export interface ApiCallLog {
  job_id: string;
  provider: string;
  model: string;
  endpoint: string;
  pipeline_step: string;
  system_prompt?: string;
  user_prompt?: string;
  response?: string;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  latency_ms?: number;
}

export interface LLMRequest {
  step: string;
  jobId: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  // Override the default model for this step (optional)
  modelOverride?: string;
}

export interface LLMResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
  latencyMs: number;
}

export interface CompanyInfo {
  name: string;
  url?: string;
  description: string;
  searchDescriptions: string[];
  deckMarkdown?: string;
}

export interface Competitor {
  name: string;
  url: string;
  description?: string;
  score?: number; // frequency across queries
}

export interface EnrichedCompetitor extends Competitor {
  fullContent?: string;
  keyFeatures?: string;
  targetCustomer?: string;
  differentiators?: string;
}

export interface PipelineConfig {
  [key: string]: string;
}

export interface ModelConfig {
  id: string;
  provider: string;
  model_id: string;
  display_name: string;
  input_cost_per_1m_usd: number;
  output_cost_per_1m_usd: number;
  context_window_tokens: number;
  enabled: boolean;
  deprecated_at?: string;
  notes?: string;
}
