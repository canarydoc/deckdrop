/**
 * Step 2 — Competitor discovery via Exa.
 *
 * Layer 1: findSimilar(25) on company URL + dual search per description
 *          (company-filtered + unfiltered web) — 7 parallel calls total.
 * Layer 2: LLM picks top 2-3 closest direct competitors, then findSimilar
 *          expands on those URLs for deeper discovery.
 *
 * Key invariants:
 * - All URLs pass through a blocklist before entering the dedup map
 * - Layer 2 expansion only runs on clean company homepages
 * - Dedup stores the SHORTEST URL per hostname (closest to root)
 */
import { findSimilar, searchCompanyCategory, searchWeb } from '../../services/exa.js';
import { llmComplete } from '../../services/llm.js';
import type { CompanyInfo, Competitor, PipelineConfig } from '../../types/index.js';

// ── Domains that are never actual company competitors ─────────────────────────
// Includes: database aggregators, market research, health IT media, blog
// aggregators, general news/social, academic journals, app stores.
const BLOCKED_DOMAINS = new Set([
  // Database aggregators
  'cbinsights.com', 'crunchbase.com', 'tracxn.com', 'pitchbook.com', 'preqin.com',
  'angellist.com', 'wellfound.com', 'ycombinator.com', 'workatastartup.com',
  'g2.com', 'capterra.com', 'getapp.com', 'softwareadvice.com', 'trustpilot.com',
  'getlatka.com', 'huntscreens.com', 'parsers.vc', 'ycrm.xyz', 'trac.vc',
  'extruct.ai', 'thecompanycheck.com', 'pitchdeckhunt.com', 'f6s.com',
  'startupblink.com', 'dealroom.co', 'producthunt.com',
  // Market research publishers
  'marketsandmarkets.com', 'marketsandmarketsblog.com', 'grandviewresearch.com',
  'mordorintelligence.com', 'reportprime.com', 'persistencemarketresearch.com',
  'marketresearchfuture.com', 'verifiedmarketresearch.com', 'reportsanddata.com',
  'researchandmarkets.com', 'imarcgroup.com', 'psmarketresearch.com',
  'snsinsider.com', 'consainsights.com', 'knowledge-sourcing.com',
  'fairfieldmarketresearch.com', 'marketiquest.com', 'researchdive.com',
  'media.market.us', 'globenewswire.com', 'businesswire.com',
  'prnewswire.com', 'einpresswire.com', 'biospace.com', 'reportlinker.com',
  'alliedmarketresearch.com', 'transparencymarketresearch.com',
  // Health IT news / media
  'mobihealthnews.com', 'healthcareittoday.com', 'hitconsultant.net',
  'healthcaredive.com', 'fiercehealthcare.com', 'fiercehealthit.com',
  'modernhealthcare.com', 'beckershospitalreview.com', 'medcitynews.com',
  'healthtechmagazine.net', 'hcinnovationgroup.com', 'healthleadersmedia.com',
  // Health IT list/blog aggregators
  'healtharc.io', 'hellorache.com', 'digitalsalutem.com', 'nextdigitalhealth.com',
  'disrupting.healthcare', 'sisgain.com', 'binariks.com', 'spsoft.com',
  'evincedev.com', 'delveinsight.com', 'medibillmd.com', 'plugandplaytechcenter.com',
  'diligenceins.com', 'diff.blog', 'discover-pharma.com', 'intuitionlabs.ai',
  'digitalsalutem.com', 'thewellnesslondon.com', 'blog.prevounce.com',
  // General knowledge / Q&A / social
  'wikipedia.org', 'quora.com', 'reddit.com', 'medium.com',
  'linkedin.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com',
  'substack.com', 'dev.to', 'hackernews.com', 'ycombinator.news',
  // General tech / startup news
  'techcrunch.com', 'forbes.com', 'bloomberg.com', 'wsj.com', 'nytimes.com',
  'businessinsider.com', 'fortune.com', 'wired.com', 'venturewiredaily.com',
  'pulse2.com', 'venturebeat.com', 'fastcompany.com', 'inc.com',
  // Academic
  'pmc.ncbi.nlm.nih.gov', 'pubmed.ncbi.nlm.nih.gov', 'sciencedirect.com',
  'nature.com', 'springer.com', 'ncbi.nlm.nih.gov', 'nih.gov',
  // App stores / misc
  'play.google.com', 'apps.apple.com', 'globalsources.com',
  // Other aggregators seen in runs
  'diligenceins.com', 'reportprime.com', 'marketresearch.com',
  'softwareworld.co', 'marketingscoop.com', 'gethealthie.com',
  'partssource.com', 'brainvire.com', 'forum.facmedicine.com',
  'bestreviews.net', 'cleararchhealth.com', 'blog.optimize.health',
]);

// ── Path patterns that signal an article/list/tag page (not a homepage) ───────
const BLOCKED_PATH_SEGMENTS = new Set([
  'blog', 'blogs', 'news', 'tag', 'tags', 'article', 'articles',
  'insights', 'resources', 'press', 'report', 'reports', 'research',
  'whitepaper', 'whitepapers', 'webinar', 'webinars', 'case-study', 'case-studies',
  'industry-analysis', 'market-research', 'market-analysis', 'industry-reports',
  'topic', 'topics', 'category', 'categories', 'trending',
  'companies', 'company', 'competitors', 'alternatives',
]);

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url.toLowerCase();
  }
}

/** Returns true if the URL is a plausible company homepage, not an article/database page. */
function isValidCompetitor(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname.toLowerCase();

    if (BLOCKED_DOMAINS.has(host)) return false;

    const segments = path.split('/').filter(s => s.length > 0);
    for (const seg of segments) {
      if (BLOCKED_PATH_SEGMENTS.has(seg)) return false;
      if (/\d/.test(seg)) return false;
      if (seg.split('-').length >= 5) return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * For Layer 2 expansion: only pass URLs that are clean root/near-root domains.
 * Running findSimilar on an article URL returns more articles; on a homepage it
 * returns similar companies.
 */
function isGoodForExpansion(url: string): boolean {
  if (!isValidCompetitor(url)) return false;
  try {
    const segments = new URL(url).pathname.split('/').filter(s => s.length > 0);
    return segments.length <= 1;
  } catch {
    return false;
  }
}

/** Root URL for a hostname, used for findSimilar calls. */
function toRootUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}/`;
  } catch {
    return url;
  }
}

function deduplicateAndRank(
  results: Array<{ url: string; title?: string; score?: number; highlights?: string[]; summary?: string }>,
  excludeUrl?: string
): Competitor[] {
  const seen = new Map<string, { url: string; title?: string; count: number }>();
  const excludeNorm = excludeUrl ? normalizeUrl(excludeUrl) : null;

  for (const r of results) {
    if (!isValidCompetitor(r.url)) continue;

    const norm = normalizeUrl(r.url);
    if (excludeNorm && norm === excludeNorm) continue;
    if (!norm || norm.length < 4) continue;

    const existing = seen.get(norm);
    if (existing) {
      existing.count++;
      if (r.url.length < existing.url.length) {
        existing.url = r.url;
        if (r.title) existing.title = r.title;
      }
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
  const numResults = parseInt(config.exa_find_similar_results ?? '25', 10);
  const layers = parseInt(config.exa_competitor_layers ?? '2', 10);
  const maxTotal = parseInt(config.exa_max_competitors_total ?? '35', 10);
  const webSearchEnabled = config.exa_web_search_enabled !== 'false';
  const llmSelectEnabled = config.exa_layer2_llm_select !== 'false';
  const layer2TopN = parseInt(config.exa_layer2_top_n ?? '3', 10);

  // ── Layer 1: all in parallel ──────────────────────────────────────────────
  // 1 findSimilar + (3 descriptions × 2 search variants) = 7 parallel calls
  const layer1Promises: Promise<Array<{ url: string; title?: string; score?: number; highlights?: string[]; summary?: string }>>[] = [];

  // Primary: findSimilar on company URL — highest signal source
  if (company.url) {
    layer1Promises.push(findSimilar(company.url, numResults, jobId, config));
  }

  // Dual search per description: company-filtered + unfiltered web
  for (const desc of company.searchDescriptions) {
    // WITH category:"company" + highlights
    layer1Promises.push(searchCompanyCategory(desc, numResults, jobId, config));

    // WITHOUT category + summary (catches companies Exa's index misses)
    if (webSearchEnabled) {
      layer1Promises.push(searchWeb(desc, numResults, jobId, config));
    }
  }

  const layer1Results = await Promise.all(layer1Promises);
  const layer1Flat = layer1Results.flat();
  const layer1Ranked = deduplicateAndRank(layer1Flat, company.url);

  if (layers < 2) return layer1Ranked.slice(0, maxTotal);

  // ── Layer 2: LLM-guided or frequency-based expansion ─────────────────────
  let expansionUrls: string[];

  if (llmSelectEnabled && layer1Ranked.length > 0) {
    // Ask LLM to pick the closest direct competitors for expansion
    const candidateList = layer1Ranked
      .filter(c => isGoodForExpansion(c.url))
      .slice(0, 15)
      .map(c => `- ${c.name} (${c.url})`)
      .join('\n');

    try {
      const selectResult = await llmComplete({
        step: 'step2-discover',
        jobId,
        systemPrompt: 'You are a competitive analysis expert. Select the companies that are the most direct competitors. Return valid JSON only.',
        userPrompt: `Given the index company: ${company.name} (${company.url ?? 'no URL'})
Description: ${company.description}

Candidate competitors:
${candidateList}

Select the ${layer2TopN} companies that are the MOST DIRECT competitors — same product category, same buyer, same problem. Exclude aggregators, news sites, and tangentially related companies.

Return JSON: { "urls": ["url1", "url2", "url3"] }`,
        maxTokens: 256,
      });

      const parsed = JSON.parse(selectResult.text.replace(/```json\n?|\n?```/g, '').trim());
      expansionUrls = (parsed.urls ?? []).filter((u: string) => isGoodForExpansion(u));
    } catch {
      // Fallback to frequency-based
      expansionUrls = layer1Ranked
        .filter(c => isGoodForExpansion(c.url))
        .slice(0, layer2TopN)
        .map(c => c.url);
    }
  } else {
    // Frequency-based fallback
    expansionUrls = layer1Ranked
      .filter(c => isGoodForExpansion(c.url))
      .slice(0, layer2TopN)
      .map(c => c.url);
  }

  // Run findSimilar on selected expansion URLs
  const layer2Promises = expansionUrls.map(url =>
    findSimilar(toRootUrl(url), numResults, jobId, config).catch(() => [] as any[])
  );
  const layer2Results = await Promise.all(layer2Promises);
  const allResults = [...layer1Flat, ...layer2Results.flat()];

  return deduplicateAndRank(allResults, company.url).slice(0, maxTotal);
}
