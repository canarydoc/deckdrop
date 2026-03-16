/**
 * Admin API routes — powers the dashboard UI.
 */
import { Router } from 'express';
import supabase from '../../services/supabase.js';

const router = Router();

/** Minimal markdown → HTML (handles headers, bold, tables, lists, links, paragraphs) */
function markdownToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = md.split('\n');
  const out: string[] = [];
  let inTable = false;
  let inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    // Table rows
    if (line.startsWith('|')) {
      if (line.replace(/[|\s-]/g, '') === '') continue; // separator row
      if (!inTable) { out.push('<table>'); inTable = true; }
      const cells = line.split('|').filter(c => c.trim() !== '');
      const tag = !out.some(l => l.includes('<tr>')) ? 'th' : 'td';
      out.push('<tr>' + cells.map(c => `<${tag}>${inline(esc(c.trim()))}</${tag}>`).join('') + '</tr>');
      continue;
    }
    if (inTable) { out.push('</table>'); inTable = false; }
    // Lists
    if (/^[*-]\s/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(esc(line.replace(/^[*-]\s+/, '')))}</li>`);
      continue;
    }
    if (inList) { out.push('</ul>'); inList = false; }
    // Headers
    const hm = line.match(/^(#{1,4})\s+(.*)/);
    if (hm) { const n = hm[1].length; out.push(`<h${n}>${inline(esc(hm[2]))}</h${n}>`); continue; }
    // Horizontal rule
    if (/^---+$/.test(line.trim())) { out.push('<hr>'); continue; }
    // Empty line
    if (line.trim() === '') { out.push(''); continue; }
    // Paragraph
    out.push(`<p>${inline(esc(line))}</p>`);
  }
  if (inTable) out.push('</table>');
  if (inList) out.push('</ul>');
  return out.join('\n');
}
function inline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(\d+)\]/g, '<sup>[$1]</sup>')
    .replace(/\[([^\]]+)\]\[([^\]]+)\]/g, '<a href="#">$1</a>');
}

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

router.get('/jobs/:id/report', async (req, res) => {
  const { data: job } = await supabase
    .from('jobs')
    .select('company_name, report_markdown')
    .eq('id', req.params.id)
    .single();
  if (!job?.report_markdown) {
    res.status(404).send('Report not available');
    return;
  }
  const title = job.company_name ?? 'Deckdrop Report';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{max-width:900px;margin:40px auto;padding:0 20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.6;color:#1a1a1a}
h1,h2,h3,h4{margin-top:2em}table{border-collapse:collapse;width:100%;margin:1em 0}
th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;font-size:14px}
th{background:#f5f5f5;font-weight:600}tr:nth-child(even){background:#fafafa}
pre{background:#f5f5f5;padding:12px;border-radius:4px;overflow-x:auto}
a{color:#2563eb}</style></head><body>${markdownToHtml(job.report_markdown)}</body></html>`);
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

// ── Available models from OpenRouter ─────────────────────────────────────────
const PROVIDER_PREFIXES = ['google/gemini', 'openai/gpt-4', 'openai/gpt-5', 'openai/o1', 'openai/o3', 'openai/o4', 'x-ai/grok'];
const EXCLUDE_PATTERNS = [/audio/, /image/, /:free/, /search-preview/, /oss/, /instruct/, /0314/, /1106/, /turbo-preview/, /2024-05/, /2024-08/, /gemma/, /gemini-2\.0-flash-exp/];

router.get('/available-models', async (_req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'No OpenRouter key' }); return; }

  const resp = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const json = await resp.json() as { data: Array<{ id: string; name: string; context_length: number; pricing: { prompt: string; completion: string } }> };

  const models = (json.data ?? [])
    .filter(m => PROVIDER_PREFIXES.some(p => m.id.startsWith(p)))
    .filter(m => !EXCLUDE_PATTERNS.some(rx => rx.test(m.id)))
    .map(m => {
      const inp = parseFloat(m.pricing?.prompt ?? '0') * 1_000_000;
      const out = parseFloat(m.pricing?.completion ?? '0') * 1_000_000;
      const ctx = m.context_length >= 1_000_000 ? `${Math.round(m.context_length / 1_000_000)}M ctx`
        : m.context_length >= 1_000 ? `${Math.round(m.context_length / 1_000)}k ctx` : '';
      const provider = m.id.startsWith('google/') ? 'gemini'
        : m.id.startsWith('openai/') ? 'openai' : 'grok';
      return {
        id: m.id,
        name: m.name ?? m.id,
        provider,
        ctx,
        label: `${m.name ?? m.id} · $${inp.toFixed(2)}/$${out.toFixed(2)} /M`,
        inputCost: inp,
        outputCost: out,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  res.json(models);
});

// ── Test trigger ──────────────────────────────────────────────────────────────
router.post('/test', async (req, res) => {
  const { url, email } = req.body;
  const testEmail = email ?? 'alex@deckdrop.io';

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
