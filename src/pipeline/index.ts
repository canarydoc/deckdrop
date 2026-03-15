/**
 * Pipeline orchestrator — runs all steps for a job.
 */
import supabase, {
  updateJobStatus,
  getPipelineConfig,
  deductCredit,
} from '../services/supabase.js';
import { extractCompanyInfo } from './steps/step1-extract.js';
import { discoverCompetitors } from './steps/step2-discover.js';
import { enrichCompetitors } from './steps/step3-enrich.js';
import { synthesizeReport } from './steps/step4-synthesize.js';
import { runGapAnalysis } from './steps/step5-gap-analysis.js';
import { generatePdf } from './steps/step6-pdf.js';
import { sendReportEmail } from '../services/mailersend.js';
import type { Job } from '../types/index.js';

export async function runPipeline(job: Job): Promise<void> {
  console.log(`[pipeline] Starting job ${job.id} for ${job.user_email}`);

  await updateJobStatus(job.id, 'processing');

  try {
    const config = await getPipelineConfig();

    // ── Step 1: Extract ────────────────────────────────────────────────────
    console.log(`[pipeline][${job.id}] Step 1: Extract`);
    const company = await extractCompanyInfo(
      job.company_url ?? '',
      job.deck_markdown,
      job.id
    );
    await updateJobStatus(job.id, 'processing', { company_name: company.name });

    // ── Step 2: Discover competitors ───────────────────────────────────────
    console.log(`[pipeline][${job.id}] Step 2: Discover`);
    const competitors = await discoverCompetitors(company, config, job.id);
    console.log(`[pipeline][${job.id}] Found ${competitors.length} competitors`);

    // ── Step 3: Enrich ─────────────────────────────────────────────────────
    console.log(`[pipeline][${job.id}] Step 3: Enrich`);
    const enriched = await enrichCompetitors(competitors, job.id);

    // ── Step 4: Synthesize ─────────────────────────────────────────────────
    console.log(`[pipeline][${job.id}] Step 4: Synthesize`);
    const draftReport = await synthesizeReport(company, enriched, config, job.id);

    // ── Step 5: Gap analysis ───────────────────────────────────────────────
    console.log(`[pipeline][${job.id}] Step 5: Gap analysis`);
    const finalReport = await runGapAnalysis(draftReport, company, enriched, config, job.id);

    // ── Step 6: Generate PDF ───────────────────────────────────────────────
    console.log(`[pipeline][${job.id}] Step 6: PDF`);
    const pdfBuffer = await generatePdf(finalReport, company.name);

    // Store PDF in Supabase Storage
    const storagePath = `reports/${job.id}.pdf`;
    await supabase.storage.from('reports').upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

    // ── Step 7: Send email ─────────────────────────────────────────────────
    console.log(`[pipeline][${job.id}] Step 7: Email`);
    await sendReportEmail(job.user_email, company.name, pdfBuffer, job.id);

    // ── Calculate total cost ───────────────────────────────────────────────
    const { data: calls } = await supabase
      .from('api_calls')
      .select('cost_usd')
      .eq('job_id', job.id);
    const totalCost = (calls ?? []).reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);

    // ── Deduct credit + mark complete ──────────────────────────────────────
    await deductCredit(job.user_email);
    await updateJobStatus(job.id, 'completed', {
      report_markdown: finalReport,
      report_url: storagePath,
      total_cost_usd: totalCost,
    });

    console.log(`[pipeline][${job.id}] Complete. Cost: $${totalCost.toFixed(4)}`);
  } catch (err: any) {
    console.error(`[pipeline][${job.id}] Failed:`, err.message);
    await updateJobStatus(job.id, 'failed', { error_message: err.message });
    throw err;
  }
}
