/**
 * Step 5 — Gap analysis: identify missing info, run follow-up Exa queries, re-synthesize.
 */
import { llmComplete } from '../../services/llm.js';
import { searchCompanies, getContents } from '../../services/exa.js';
import { synthesizeReport } from './step4-synthesize.js';
import type { CompanyInfo, EnrichedCompetitor, PipelineConfig } from '../../types/index.js';

export async function runGapAnalysis(
  draftReport: string,
  company: CompanyInfo,
  competitors: EnrichedCompetitor[],
  config: PipelineConfig,
  jobId: string
): Promise<string> {
  if (config.gap_analysis_enabled === 'false') return draftReport;

  const maxRounds = parseInt(config.gap_analysis_max_rounds ?? '1', 10);
  let report = draftReport;
  let enrichedCompetitors = competitors;

  for (let round = 0; round < maxRounds; round++) {
    // Ask LLM what's missing
    const gapResult = await llmComplete({
      step: 'step5-gap-analysis',
      jobId,
      systemPrompt: 'You are a senior investment analyst reviewing a draft due diligence report. Identify critical gaps or missing information that would materially improve the analysis. Be specific and concise.',
      userPrompt: `Review this draft report and identify up to 5 specific gaps. For each gap, provide one targeted search query to fill it.

Return JSON only: { "gaps": [{ "issue": "...", "search_query": "..." }] }

Draft report:
${report.substring(0, 6000)}`,
      maxTokens: 512,
    });

    let gaps: Array<{ issue: string; search_query: string }> = [];
    try {
      const parsed = JSON.parse(gapResult.text.replace(/```json\n?|\n?```/g, '').trim());
      gaps = parsed.gaps ?? [];
    } catch {
      break;
    }

    if (gaps.length === 0) break;

    // Run follow-up searches in parallel
    const searchResults = await Promise.all(
      gaps.map(g => searchCompanies(g.search_query, 5, jobId, 'step5-gap-analysis').catch(() => []))
    );

    const newUrls = searchResults.flat().map(r => r.url).filter(Boolean);
    const existingUrls = new Set(enrichedCompetitors.map(c => c.url));
    const freshUrls = [...new Set(newUrls)].filter(u => !existingUrls.has(u)).slice(0, 10);

    if (freshUrls.length > 0) {
      const freshContents = await getContents(freshUrls, jobId);
      const freshCompetitors: EnrichedCompetitor[] = freshContents.map(c => ({
        name: c.title ?? c.url,
        url: c.url,
        fullContent: c.text,
      }));
      enrichedCompetitors = [...enrichedCompetitors, ...freshCompetitors];
    }

    // Re-synthesize with enriched data
    report = await synthesizeReport(company, enrichedCompetitors, config, jobId);
  }

  return report;
}
