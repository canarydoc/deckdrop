import { createClient } from '@supabase/supabase-js';
import type { ApiCallLog, PipelineConfig } from '../types/index.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default supabase;

// ── Job helpers ───────────────────────────────────────────────────────────────

export async function getNextQueuedJob() {
  const { data } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  return data;
}

export async function updateJobStatus(
  jobId: string,
  status: string,
  extra: Record<string, unknown> = {}
) {
  const patch: Record<string, unknown> = { status, ...extra };
  if (status === 'processing') patch.started_at = new Date().toISOString();
  if (status === 'completed' || status === 'failed') patch.completed_at = new Date().toISOString();

  await supabase.from('jobs').update(patch).eq('id', jobId);
}

// ── User / credit helpers ─────────────────────────────────────────────────────

export async function getUserByEmail(email: string) {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();
  return data;
}

export async function deductCredit(email: string) {
  const { data: user } = await supabase
    .from('users')
    .select('credits')
    .eq('email', email)
    .single();
  if (!user || user.credits < 1) throw new Error('Insufficient credits');
  await supabase
    .from('users')
    .update({ credits: user.credits - 1 })
    .eq('email', email);
}

// ── API call logging ──────────────────────────────────────────────────────────

export async function logApiCall(log: ApiCallLog) {
  await supabase.from('api_calls').insert(log);
}

// ── Config helpers ────────────────────────────────────────────────────────────

export async function getPipelineConfig(): Promise<PipelineConfig> {
  const { data } = await supabase.from('pipeline_config').select('key, value');
  const config: PipelineConfig = {};
  for (const row of data ?? []) config[row.key] = row.value;
  return config;
}

export async function getPrompt(key: string): Promise<string> {
  const { data } = await supabase
    .from('prompts')
    .select('content')
    .eq('key', key)
    .single();
  return data?.content ?? '';
}
