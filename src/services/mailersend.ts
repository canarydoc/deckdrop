import { logApiCall } from './supabase.js';

const API_KEY = process.env.MAILERSEND_API_KEY!;
const FROM_EMAIL = process.env.MAILERSEND_FROM_EMAIL ?? 'add@ai.deckdrop.io';
const FROM_NAME = process.env.MAILERSEND_FROM_NAME ?? 'Deckdrop';
const CC_EMAIL = 'inbox@deckdrop.io';

export async function sendReportEmail(
  toEmail: string,
  companyName: string,
  pdfBuffer: Buffer,
  jobId: string
): Promise<void> {
  const start = Date.now();

  const pdfBase64 = pdfBuffer.toString('base64');
  const filename = `deckdrop-${companyName.toLowerCase().replace(/\s+/g, '-')}-report.pdf`;

  const body = {
    from: { email: FROM_EMAIL, name: FROM_NAME },
    to: [{ email: toEmail }],
    cc: [{ email: CC_EMAIL }],
    subject: `Your Deckdrop report: ${companyName}`,
    html: `
      <p>Hi,</p>
      <p>Your Deckdrop due diligence report for <strong>${companyName}</strong> is attached.</p>
      <p>The report includes:</p>
      <ul>
        <li>Company analysis</li>
        <li>Competitive landscape</li>
        <li>Market overview and sizing</li>
        <li>Investment considerations</li>
      </ul>
      <p>Questions? Reply to this email.</p>
      <p>— Deckdrop</p>
    `,
    attachments: [{ filename, content: pdfBase64, disposition: 'attachment' }],
  };

  const resp = await fetch('https://api.mailersend.com/v1/email', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  await logApiCall({
    job_id: jobId,
    provider: 'mailersend',
    model: 'email',
    endpoint: 'send',
    pipeline_step: 'step7-email',
    user_prompt: `To: ${toEmail}, Subject: Deckdrop report: ${companyName}`,
    response: `HTTP ${resp.status}`,
    cost_usd: 0.001,
    latency_ms: Date.now() - start,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`MailerSend error ${resp.status}: ${err}`);
  }
}
