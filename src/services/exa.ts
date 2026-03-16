import Exa from 'exa-js';
import { logApiCall } from './supabase.js';
import type { PipelineConfig } from '../types/index.js';

const exa = new Exa(process.env.EXA_API_KEY!);

// ── Garbage domains to exclude via Exa's excludeDomains param ────────────────
// Kept short to reduce odds of triggering Exa bugs. Code-side BLOCKED_DOMAINS
// in step2-discover.ts handles the full blocklist as a safety net.
const EXCLUDE_DOMAINS = [
  'cbinsights.com', 'crunchbase.com', 'tracxn.com', 'pitchbook.com',
  'g2.com', 'capterra.com', 'getapp.com', 'softwareadvice.com',
  'marketsandmarkets.com', 'grandviewresearch.com', 'mordorintelligence.com',
  'wikipedia.org', 'linkedin.com', 'twitter.com', 'reddit.com', 'medium.com',
  'techcrunch.com', 'forbes.com', 'bloomberg.com', 'youtube.com',
  'play.google.com', 'apps.apple.com',
];

type ExaResult = { url: string; title?: string; score?: number; highlights?: string[]; summary?: string };

/** Run an Exa call with excludeDomains retry: if it fails/hangs, retry without.
 *  BOTH attempts have a timeout to prevent indefinite hangs. */
async function withExcludeRetry<T>(
  config: PipelineConfig,
  callWithExclude: (excludeDomains?: string[]) => Promise<T>,
): Promise<T> {
  const useExclude = config.exa_use_exclude_domains !== 'false';
  const timeoutMs = parseInt(config.exa_exclude_retry_timeout_ms ?? '15000', 10);

  const withTimeout = (promise: Promise<T>, label: string): Promise<T> =>
    Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`exa_timeout_${label}`)), timeoutMs)
      ),
    ]);

  if (!useExclude) {
    return withTimeout(callWithExclude(undefined), 'no_exclude');
  }

  try {
    return await withTimeout(callWithExclude(EXCLUDE_DOMAINS), 'with_exclude');
  } catch (err) {
    console.warn(`[exa] excludeDomains failed (${(err as Error).message}), retrying without`);
    return withTimeout(callWithExclude(undefined), 'retry_no_exclude');
  }
}

// ── findSimilar ──────────────────────────────────────────────────────────────

export async function findSimilar(
  url: string,
  numResults: number,
  jobId: string,
  config: PipelineConfig,
  step = 'step2-discover',
): Promise<ExaResult[]> {
  const start = Date.now();
  const category = config.exa_category || 'company';
  const highlightsQuery = config.exa_highlights_query || '';
  const numSentences = parseInt(config.exa_highlights_sentences ?? '6', 10);

  const results = await withExcludeRetry(config, (excludeDomains) =>
    exa.findSimilar(url, {
      numResults,
      excludeSourceDomain: true,
      category: category as any,
      ...(excludeDomains ? { excludeDomains } : {}),
      ...(highlightsQuery ? {
        contents: {
          highlights: { query: highlightsQuery, numSentences },
        },
      } : {}),
    })
  );

  await logApiCall({
    job_id: jobId,
    service: 'exa',
    step,
    model: 'find-similar',
    prompt: url,
    response: JSON.stringify(results.results?.map(r => r.url) ?? []),
    cost_usd: results.costDollars?.total ?? 0,
    duration_ms: Date.now() - start,
  });

  return (results.results ?? []).map(r => ({
    url: r.url,
    title: r.title ?? undefined,
    score: r.score ?? undefined,
    highlights: (r as any).highlights ?? undefined,
  }));
}

// ── searchCompanyCategory — WITH category filter + highlights ────────────────

export async function searchCompanyCategory(
  query: string,
  numResults: number,
  jobId: string,
  config: PipelineConfig,
  step = 'step2-discover',
): Promise<ExaResult[]> {
  const start = Date.now();
  const category = config.exa_category || 'company';
  const searchType = config.exa_search_type || 'auto';
  const userLocation = config.exa_user_location || 'US';
  const highlightsQuery = config.exa_highlights_query || '';
  const numSentences = parseInt(config.exa_highlights_sentences ?? '6', 10);

  const results = await withExcludeRetry(config, (excludeDomains) =>
    exa.search(query, {
      numResults,
      type: searchType as any,
      category: category as any,
      ...(userLocation ? { userLocation } : {}),
      ...(excludeDomains ? { excludeDomains } : {}),
      ...(highlightsQuery ? {
        contents: {
          highlights: { query: highlightsQuery, numSentences },
        },
      } : {}),
    })
  );

  await logApiCall({
    job_id: jobId,
    service: 'exa',
    step,
    model: 'search-company',
    prompt: query,
    response: JSON.stringify(results.results?.map(r => r.url) ?? []),
    cost_usd: results.costDollars?.total ?? 0,
    duration_ms: Date.now() - start,
  });

  return (results.results ?? []).map(r => ({
    url: r.url,
    title: r.title ?? undefined,
    score: r.score ?? undefined,
    highlights: (r as any).highlights ?? undefined,
  }));
}

// ── searchWeb — WITHOUT category filter + summary ───────────────────────────

export async function searchWeb(
  query: string,
  numResults: number,
  jobId: string,
  config: PipelineConfig,
  step = 'step2-discover',
): Promise<ExaResult[]> {
  const start = Date.now();
  const searchType = config.exa_search_type || 'auto';
  const userLocation = config.exa_user_location || 'US';
  const summaryQuery = config.exa_summary_query || '';

  const results = await withExcludeRetry(config, (excludeDomains) =>
    exa.search(query, {
      numResults,
      type: searchType as any,
      ...(userLocation ? { userLocation } : {}),
      ...(excludeDomains ? { excludeDomains } : {}),
      ...(summaryQuery ? {
        contents: {
          summary: { query: summaryQuery },
        },
      } : {}),
    })
  );

  await logApiCall({
    job_id: jobId,
    service: 'exa',
    step,
    model: 'search-web',
    prompt: query,
    response: JSON.stringify(results.results?.map(r => r.url) ?? []),
    cost_usd: results.costDollars?.total ?? 0,
    duration_ms: Date.now() - start,
  });

  return (results.results ?? []).map(r => ({
    url: r.url,
    title: r.title ?? undefined,
    score: r.score ?? undefined,
    summary: (r as any).summary ?? undefined,
  }));
}

// ── getContents ──────────────────────────────────────────────────────────────

export async function getContents(
  urls: string[],
  jobId: string,
  step = 'step3-enrich',
  config?: PipelineConfig,
): Promise<Array<{ url: string; text?: string; title?: string }>> {
  if (urls.length === 0) return [];
  const start = Date.now();
  const maxChars = parseInt(config?.exa_max_content_chars ?? '3000', 10);
  const subpages = parseInt(config?.exa_subpages ?? '0', 10);
  const subpageTarget = config?.exa_subpage_target?.split(',').map(s => s.trim()).filter(Boolean);

  const results = await exa.getContents(urls, {
    text: { maxCharacters: maxChars },
    ...(subpages > 0 ? { subpages } : {}),
    ...(subpages > 0 && subpageTarget?.length ? { subpageTarget } : {}),
  });

  await logApiCall({
    job_id: jobId,
    service: 'exa',
    step,
    model: 'get-contents',
    prompt: urls.join(', '),
    response: `${results.results?.length ?? 0} pages retrieved`,
    cost_usd: results.costDollars?.total ?? 0,
    duration_ms: Date.now() - start,
  });

  return (results.results ?? []).map(r => ({
    url: r.url,
    text: (r as any).text ?? undefined,
    title: r.title ?? undefined,
  }));
}
