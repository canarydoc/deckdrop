/**
 * Admin API routes — powers the dashboard UI.
 */
import { Router } from 'express';
import supabase from '../../services/supabase.js';

const router = Router();

// Simple secret-based auth for admin routes
router.use((req, res, next) => {
  const secret = req.headers['x-admin-secret'] ?? req.query.secret;
  if (secret !== process.env.ADMIN_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
});

// ── Overview stats ────────────────────────────────────────────────────────────
router.get('/stats', async (_req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const [jobs, todayCost, users] = await Promise.all([
    supabase.from('jobs').select('status', { count: 'exact' }),
    supabase.from('jobs').select('total_cost_usd').gte('created_at', today),
    supabase.from('users').select('email, credits', { count: 'exact' }),
  ]);
  const costToday = (todayCost.data ?? []).reduce((s, r) => s + (r.total_cost_usd ?? 0), 0);
  res.json({
    totalJobs: jobs.count ?? 0,
    costToday: costToday.toFixed(4),
    totalUsers: users.count ?? 0,
  });
});

// ── Jobs ──────────────────────────────────────────────────────────────────────
router.get('/jobs', async (req, res) => {
  const limit = parseInt(req.query.limit as string ?? '50', 10);
  const { data } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  res.json(data ?? []);
});

router.get('/jobs/:id', async (req, res) => {
  const [job, apiCalls] = await Promise.all([
    supabase.from('jobs').select('*').eq('id', req.params.id).single(),
    supabase.from('api_calls').select('*').eq('job_id', req.params.id).order('created_at'),
  ]);
  res.json({ job: job.data, apiCalls: apiCalls.data ?? [] });
});

// ── Users ─────────────────────────────────────────────────────────────────────
router.get('/users', async (_req, res) => {
  const { data } = await supabase.from('users').select('*').order('created_at', { ascending: false });
  res.json(data ?? []);
});

router.patch('/users/:email/credits', async (req, res) => {
  const { credits } = req.body;
  const { data, error } = await supabase
    .from('users')
    .update({ credits })
    .eq('email', req.params.email)
    .select()
    .single();
  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json(data);
});

router.post('/users', async (req, res) => {
  const { email, credits } = req.body;
  const { data, error } = await supabase
    .from('users')
    .insert({ email, credits: credits ?? 0 })
    .select()
    .single();
  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json(data);
});

// ── Models ────────────────────────────────────────────────────────────────────
router.get('/models', async (_req, res) => {
  const { data } = await supabase.from('models').select('*').order('provider');
  res.json(data ?? []);
});

router.patch('/models/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('models')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json(data);
});

router.post('/models', async (req, res) => {
  const { data, error } = await supabase.from('models').insert(req.body).select().single();
  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json(data);
});

// ── Pipeline config ───────────────────────────────────────────────────────────
router.get('/config', async (_req, res) => {
  const { data } = await supabase.from('pipeline_config').select('*').order('key');
  res.json(data ?? []);
});

router.patch('/config/:key', async (req, res) => {
  const { data, error } = await supabase
    .from('pipeline_config')
    .update({ value: req.body.value })
    .eq('key', req.params.key)
    .select()
    .single();
  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json(data);
});

// ── Prompts ───────────────────────────────────────────────────────────────────
router.get('/prompts', async (_req, res) => {
  const { data } = await supabase.from('prompts').select('*').order('key');
  res.json(data ?? []);
});

router.patch('/prompts/:key', async (req, res) => {
  const { data, error } = await supabase
    .from('prompts')
    .update({ template: req.body.template })
    .eq('key', req.params.key)
    .select()
    .single();
  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json(data);
});

// ── Test trigger ──────────────────────────────────────────────────────────────
router.post('/test', async (req, res) => {
  const { url, email } = req.body;
  const testEmail = email ?? 'dagnytaggart1997@gmail.com';

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({
      user_email: testEmail,
      status: 'queued',
      input_type: 'url',
      company_url: url,
      total_cost_usd: 0,
    })
    .select()
    .single();

  if (error || !job) {
    res.status(400).json({ error: error?.message ?? 'Failed to create job' });
    return;
  }

  const { runPipeline } = await import('../../pipeline/index.js');
  runPipeline(job).catch(err => console.error(`[test] Job ${job.id} error:`, err.message));

  res.json({ ok: true, jobId: job.id });
});

export default router;
