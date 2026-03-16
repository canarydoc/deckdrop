/**
 * Step 2 — Competitor discovery via Exa.
 *
 * Layer 1 (all parallel):
 *   - findSimilar(25) on company URL
 *   - 3× searchCompanyCategory (Triple Tap descriptions)
 *   - 1× searchWeb (broadest description only — cost-efficient)
 *   - 1× searchCompanyCategory for incumbents/leaders
 *   - 1× searchCompanyCategory for direct "{name} competitors"
 *   = 7 parallel calls
 *
 * Layer 2:
 *   LLM picks top 3 established direct competitors, findSimilar expands.
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
  // Generic news / press release sites
  'lasvegassun.com', 'desmoinesregister.com',
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

function isGoodForExpansion(url: string): boolean {
  if (!isValidCompetitor(url)) return false;
  try {
    const segments = new URL(url).pathname.split('/').filter(s => s.length > 0);
    return segments.length <= 1;
  } catch {
    return false;
  }
}

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
  const maxTotal = parseInt(config.exa_max_competitors_total ?? '55', 10);
  const webSearchEnabled = config.exa_web_search_enabled !== 'false';
  const llmSelectEnabled = config.exa_layer2_llm_select !== 'false';
  const layer2TopN = parseInt(config.exa_layer2_top_n ?? '3', 10);

  // ── Layer 1: all in parallel ──────────────────────────────────────────────
  type EResult = { url: string; title?: string; score?: number; highlights?: string[]; summary?: string };
  const layer1Promises: Promise<EResult[]>[] = [];

  // Each call is wrapped in .catch() so one failed/timed-out Exa call
  // doesn't crash the entire discovery pipeline — it just means fewer results.
  const safe = (p: Promise<EResult[]>): Promise<EResult[]> => p.catch(err => {
    console.warn(`[step2][${jobId}] Exa call failed: ${err.message}`);
    return [] as EResult[];
  });

  // 1. findSimilar on company URL — highest signal source
  if (company.url) {
    layer1Promises.push(safe(findSimilar(company.url, numResults, jobId, config)));
  }

  // 2. searchCompanyCategory per description (all 3 Triple Tap angles)
  for (const desc of company.searchDescriptions) {
    layer1Promises.push(safe(searchCompanyCategory(desc, numResults, jobId, config)));
  }

  // 3. searchWeb on ONE description only (the broadest — index 1: Outcome/Value)
  //    This catches companies outside Exa's company index without tripling cost.
  if (webSearchEnabled && company.searchDescriptions.length > 1) {
    layer1Promises.push(safe(searchWeb(company.searchDescriptions[1], numResults, jobId, config)));
  }

  // 4. Incumbent/leader search — catches established players that startup-focused
  //    descriptions miss (Waystar, AKASA, R1 RCM, etc.)
  const incumbentQuery = `largest established ${company.description.split('.')[0]} companies market leaders`;
  layer1Promises.push(safe(searchCompanyCategory(incumbentQuery, 15, jobId, config)));

  // 5. Direct competitor query — explicitly named comparisons
  layer1Promises.push(
    safe(searchCompanyCategory(`${company.name} competitors alternatives vs`, 15, jobId, config))
  );

  const layer1Results = await Promise.all(layer1Promises);
  const layer1Flat = layer1Results.flat();
  const layer1Ranked = deduplicateAndRank(layer1Flat, company.url);

  console.log(`[step2][${jobId}] Layer 1: ${layer1Flat.length} raw → ${layer1Ranked.length} unique companies`);

  if (layers < 2) return layer1Ranked.slice(0, maxTotal);

  // ── Layer 2: LLM-guided expansion on best competitors ─────────────────────
  let expansionUrls: string[];

  if (llmSelectEnabled && layer1Ranked.length > 0) {
    const candidateList = layer1Ranked
      .filter(c => isGoodForExpansion(c.url))
      .slice(0, 20)
      .map(c => `- ${c.name} (${c.url})`)
      .join('\n');

    try {
      const selectResult = await llmComplete({
        step: 'step2-discover',
        jobId,
        systemPrompt: 'You are a competitive analysis expert. Return valid JSON only.',
        userPrompt: `Index company: ${company.name} (${company.url ?? 'no URL'})
Description: ${company.description}

Candidate competitors:
${candidateList}

Select exactly ${layer2TopN} companies that are the MOST DIRECT competitors — same product category, same buyer, same core problem.

CRITICAL: Only select companies that are ESTABLISHED with real products and real customers. Do NOT select:
- Generic automation/RPA platforms (e.g. flobotics.io, openbots.ai)
- Companies with thin/parked/template websites
- Aggregators, news sites, or consulting firms
- Companies in adjacent but different categories

Return JSON: { "urls": ["url1", "url2", "url3"] }`,
        maxTokens: 256,
      });

      const parsed = JSON.parse(selectResult.text.replace(/```json\n?|\n?```/g, '').trim());
      expansionUrls = (parsed.urls ?? []).filter((u: string) => isGoodForExpansion(u));
    } catch {
      expansionUrls = layer1Ranked
        .filter(c => isGoodForExpansion(c.url))
        .slice(0, layer2TopN)
        .map(c => c.url);
    }
  } else {
    expansionUrls = layer1Ranked
      .filter(c => isGoodForExpansion(c.url))
      .slice(0, layer2TopN)
      .map(c => c.url);
  }

  console.log(`[step2][${jobId}] Layer 2 expansion on: ${expansionUrls.join(', ')}`);

  const layer2Promises = expansionUrls.map(url =>
    findSimilar(toRootUrl(url), numResults, jobId, config).catch(() => [] as any[])
  );
  const layer2Results = await Promise.all(layer2Promises);
  const allResults = [...layer1Flat, ...layer2Results.flat()];

  const final = deduplicateAndRank(allResults, company.url).slice(0, maxTotal);
  console.log(`[step2][${jobId}] Final: ${final.length} competitors after dedup + cap`);

  return final;
}
