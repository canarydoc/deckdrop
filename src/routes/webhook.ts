/**
 * MailerSend inbound email webhook.
 * Parses the email, validates the sender, creates a job, queues it.
 */
import { Router } from 'express';
import multer from 'multer';
import supabase, { getUserByEmail } from '../services/supabase.js';
import { runPipeline } from '../pipeline/index.js';
import type { InputType } from '../types/index.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Extract URL from email body text
function extractUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s\])"'>]+/);
  return match?.[0];
}

// Parse PDF/PPTX to markdown text (basic extraction)
async function attachmentToMarkdown(
  buffer: Buffer,
  mimetype: string
): Promise<string> {
  if (mimetype === 'application/pdf' || mimetype.includes('pdf')) {
    const pdfParse = await import('pdf-parse');
    const result = await pdfParse.default(buffer);
    return result.text;
  }
  // PPTX: extract text from XML (basic)
  if (mimetype.includes('presentation') || mimetype.includes('pptx')) {
    const text = buffer.toString('utf8');
    const matches = text.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) ?? [];
    return matches.map(m => m.replace(/<[^>]+>/g, '')).join('\n');
  }
  return '';
}

router.post('/', upload.any(), async (req, res) => {
  // Respond 200 immediately — MailerSend expects fast response
  res.status(200).json({ ok: true });

  try {
    const body = req.body;
    const files = req.files as Express.Multer.File[] | undefined;

    // MailerSend sends email data as form fields
    const senderEmail = (body['sender'] ?? body['from'] ?? '').replace(/.*<|>/g, '').trim().toLowerCase();
    const emailBody = body['text'] ?? body['body-plain'] ?? body['html'] ?? '';
    const subject = body['subject'] ?? '';

    if (!senderEmail) {
      console.warn('[webhook] No sender email found');
      return;
    }

    // Validate user
    const user = await getUserByEmail(senderEmail);
    if (!user) {
      console.warn(`[webhook] Unknown sender: ${senderEmail}`);
      return;
    }
    if (user.credits < 1) {
      console.warn(`[webhook] No credits: ${senderEmail}`);
      // TODO: send "out of credits" email
      return;
    }

    // Extract URL from email body
    const inputUrl = extractUrl(emailBody) ?? extractUrl(subject);

    // Parse attachments
    let deckMarkdown: string | undefined;
    if (files && files.length > 0) {
      for (const file of files) {
        if (file.mimetype.includes('pdf') || file.mimetype.includes('presentation') || file.originalname.endsWith('.pptx')) {
          deckMarkdown = await attachmentToMarkdown(file.buffer, file.mimetype);
          break;
        }
      }
    }

    if (!inputUrl && !deckMarkdown) {
      console.warn(`[webhook] No URL or deck found in email from ${senderEmail}`);
      return;
    }

    const inputType: InputType = inputUrl && deckMarkdown ? 'both'
      : inputUrl ? 'url'
      : 'deck';

    // Create job
    const { data: job, error } = await supabase
      .from('jobs')
      .insert({
        user_email: senderEmail,
        status: 'queued',
        input_type: inputType,
        company_url: inputUrl,
        deck_markdown: deckMarkdown,
        total_cost_usd: 0,
      })
      .select()
      .single();

    if (error || !job) {
      console.error('[webhook] Failed to create job:', error?.message);
      return;
    }

    console.log(`[webhook] Job ${job.id} created for ${senderEmail} (${inputType})`);

    // Run pipeline async (don't await — this takes 10-20 min)
    runPipeline(job).catch(err => {
      console.error(`[pipeline] Job ${job.id} error:`, err.message);
    });

  } catch (err: any) {
    console.error('[webhook] Error:', err.message);
  }
});

export default router;
