/**
 * Step 2 — Competitor discovery via Exa.
 * Layer 1: findSimilar + multi-description search (all parallel)
 * Layer 2: findSimilar on top competitors (configurable depth)
 */
import { findSimilar, searchCompanies } from '../../services/exa.js';
import type { CompanyInfo, Competitor, PipelineConfig } from '../../types/index.js';

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url.toLowerCase();
  }
}

function deduplicateAndRank(
  results: Array<{ url: string; title?: string; score?: number }>,
  excludeUrl?: string
): Competitor[] {
  const seen = new Map<string, { url: string; title?: string; count: number }>();
  const excludeNorm = excludeUrl ? normalizeUrl(excludeUrl) : null;

  for (const r of results) {
    const norm = normalizeUrl(r.url);
    if (excludeNorm && norm === excludeNorm) continue;
    if (!norm || norm.length < 4) continue;
    const existing = seen.get(norm);
    if (existing) {
      existing.count++;
    } else {
      seen.set(norm, { url: r.url, title: r.title, count: 1 });
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.count - a.count)
    .map(e => ({ name: e.title ?? e.url, url: e.url, score: e.count }));
}

export async function discoverCompetitors(
  company: CompanyInfo,
  config: PipelineConfig,
  jobId: string
): Promise<Competitor[]> {
  const numResults = parseInt(config.exa_find_similar_results ?? '15', 10);
  const layers = parseInt(config.exa_competitor_layers ?? '2', 10);
  const layer1TopN = parseInt(config.exa_layer1_max_competitors ?? '5', 10);
  const maxTotal = parseInt(config.exa_max_competitors_total ?? '15', 10);

  // ── Layer 1: all in parallel ──────────────────────────────────────────────
  const layer1Promises: Promise<Array<{ url: string; title?: string }>>[] = [];

  if (company.url) {
    layer1Promises.push(findSimilar(company.url, numResults, jobId));
  }

  for (const desc of company.searchDescriptions) {
    layer1Promises.push(searchCompanies(desc, 10, jobId, 'step2-discover'));
  }

  layer1Promises.push(
    searchCompanies(`${company.name} competitors alternative`, 10, jobId, 'step2-discover')
  );

  const layer1Results = await Promise.all(layer1Promises);
  const layer1Flat = layer1Results.flat();
  const layer1Ranked = deduplicateAndRank(layer1Flat, company.url);

  if (layers < 2) return layer1Ranked.slice(0, maxTotal);

  // ── Layer 2: findSimilar on top competitors ───────────────────────────────
  const topCompetitors = layer1Ranked.slice(0, layer1TopN);
  const layer2Promises = topCompetitors.map(c =>
    findSimilar(c.url, 10, jobId).catch(() => [] as any[])
  );
  const layer2Results = await Promise.all(layer2Promises);
  const allResults = [...layer1Flat, ...layer2Results.flat()];

  return deduplicateAndRank(allResults, company.url).slice(0, maxTotal);
}
