/**
 * Step 3 — Enrich each competitor with page content via Exa getContents.
 *
 * Adaptive content length: when enriching many competitors (>40), reduce
 * per-company content to keep total context manageable and control costs.
 */
import { getContents } from '../../services/exa.js';
import type { Competitor, EnrichedCompetitor, PipelineConfig } from '../../types/index.js';

export async function enrichCompetitors(
  competitors: Competitor[],
  jobId: string,
  config?: PipelineConfig,
): Promise<EnrichedCompetitor[]> {
  const urls = competitors.map(c => c.url);

  // Adaptive: when enriching many companies, use shorter content extracts
  // to keep total context under control and reduce getContents cost.
  const baseChars = parseInt(config?.exa_max_content_chars ?? '3000', 10);
  const effectiveChars = competitors.length > 40
    ? Math.min(baseChars, 1500)
    : baseChars;

  // Override config temporarily for this call
  const enrichConfig = config ? { ...config, exa_max_content_chars: String(effectiveChars) } : undefined;

  const contents = await getContents(urls, jobId, 'step3-enrich', enrichConfig);
  const contentMap = new Map(contents.map(c => [c.url, c]));

  return competitors.map(comp => {
    const page = contentMap.get(comp.url);
    return {
      ...comp,
      name: page?.title ?? comp.name,
      fullContent: page?.text,
    };
  });
}
