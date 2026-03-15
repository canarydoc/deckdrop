import express from 'express';
import path from 'path';
import webhookRouter from './routes/webhook.js';
import adminApiRouter from './routes/admin/index.js';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// MailerSend inbound webhook
app.use('/webhook/mailersend', webhookRouter);

// Admin API
app.use('/api/admin', adminApiRouter);

// Admin dashboard (static HTML)
const dashboardPath = path.join(__dirname, '../src/dashboard/public');
app.use('/admin', express.static(dashboardPath));
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(dashboardPath, 'index.html'));
});
app.get('/admin/*', (_req, res) => {
  res.sendFile(path.join(dashboardPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[server] Deckdrop V2 running on port ${PORT}`);
});
