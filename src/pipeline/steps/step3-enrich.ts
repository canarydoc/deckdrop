/**
 * Step 3 — Enrich each competitor with page content via Exa getContents.
 */
import { getContents } from '../../services/exa.js';
import type { Competitor, EnrichedCompetitor } from '../../types/index.js';

export async function enrichCompetitors(
  competitors: Competitor[],
  jobId: string
): Promise<EnrichedCompetitor[]> {
  const urls = competitors.map(c => c.url);

  // Exa getContents in one batch
  const contents = await getContents(urls, jobId);
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
