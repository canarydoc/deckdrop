/**
 * LLM abstraction layer — all pipeline LLM calls go through here.
 * Uses OpenRouter (OpenAI-compatible) so model/provider swaps are config-only.
 */
import OpenAI from 'openai';
import { logApiCall, getPipelineConfig, getPrompt } from './supabase.js';
import type { LLMRequest, LLMResponse } from '../types/index.js';

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api/v1',
  timeout: 120_000, // 2 min timeout — prevents indefinite hangs
  defaultHeaders: {
    'HTTP-Referer': 'https://deckdrop.io',
    'X-Title': 'Deckdrop',
  },
});

// Map pipeline step names to pipeline_config keys
const STEP_MODEL_KEYS: Record<string, string> = {
  'step1-extract':      'extraction_model',
  'step2-discover':     'extraction_model',
  'step4-synthesize':   'synthesis_model',
  'step5-gap-analysis': 'gap_analysis_model',
  'step6-pdf':          'extraction_model',
};

export async function llmComplete(req: LLMRequest): Promise<LLMResponse> {
  const start = Date.now();

  const config = await getPipelineConfig();
  const modelKey = STEP_MODEL_KEYS[req.step] ?? 'synthesis_model';
  const model = req.modelOverride ?? config[modelKey] ?? 'google/gemini-2.5-flash-lite';

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (req.systemPrompt) messages.push({ role: 'system', content: req.systemPrompt });
  messages.push({ role: 'user', content: req.userPrompt });

  const completion = await openai.chat.completions.create({
    model,
    messages,
    max_tokens: req.maxTokens ?? 4096,
    temperature: req.temperature ?? 0.3,
  });

  const latencyMs = Date.now() - start;
  const choice = completion.choices[0];
  const text = choice.message.content ?? '';
  const inputTokens = completion.usage?.prompt_tokens ?? 0;
  const outputTokens = completion.usage?.completion_tokens ?? 0;

  // OpenRouter returns cost in the response if available
  const costUsd = (completion as any).usage?.cost ?? 0;

  await logApiCall({
    job_id: req.jobId,
    service: 'llm',
    step: req.step,
    model,
    prompt: req.userPrompt,
    response: text,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: costUsd,
    duration_ms: latencyMs,
  });

  return { text, inputTokens, outputTokens, costUsd, model, latencyMs };
}

// Convenience: get a prompt template from DB and interpolate variables
export async function getFilledPrompt(
  key: string,
  vars: Record<string, string> = {}
): Promise<string> {
  let template = await getPrompt(key);
  for (const [k, v] of Object.entries(vars)) {
    template = template.replaceAll(`{{${k}}}`, v);
  }
  return template;
}
