/**
 * Step 5 — Gap analysis: identify blind spots, run follow-up Exa queries, re-synthesize.
 * Focus: investor-critical gaps — risks, missing competitors, regulatory exposure.
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
    // Ask LLM to identify critical investment gaps — focused on what an investor needs
    const gapResult = await llmComplete({
      step: 'step5-gap-analysis',
      jobId,
      systemPrompt: `You are a senior investment analyst doing a final review of a due diligence memo before it goes to an investment committee. Your job is to identify critical blind spots that could cause an investor to make a bad decision. Focus on:
1. Competitors or market players not mentioned that an investor would expect to see
2. Regulatory, legal, or compliance risks not addressed
3. Structural headwinds or market dynamics that are missing
4. Customer / churn / unit economics concerns not explored
5. Recent funding, acquisitions, or pivots in this space not captured`,
      userPrompt: `Review this draft due diligence memo for ${company.name} and identify up to 6 critical gaps. Each gap should be something that — if left unaddressed — could cause an investor to badly misjudge the risk or opportunity.

For each gap, provide one precise search query to find the missing information. Prefer queries that surface competitor data, regulatory issues, or market developments.

Return JSON only:
{ "gaps": [{ "issue": "...", "search_query": "..." }] }

Draft report:
${report.substring(0, 8000)}`,
      maxTokens: 768,
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
      gaps.map(g => searchCompanies(g.search_query, 10, jobId, 'step5-gap-analysis').catch(() => []))
    );

    const newUrls = searchResults.flat().map(r => r.url).filter(Boolean);
    const existingUrls = new Set(enrichedCompetitors.map(c => c.url));
    const freshUrls = [...new Set(newUrls)].filter(u => !existingUrls.has(u)).slice(0, 15);

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
