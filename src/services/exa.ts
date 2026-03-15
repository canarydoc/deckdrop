import Exa from 'exa-js';
import { logApiCall } from './supabase.js';

const exa = new Exa(process.env.EXA_API_KEY!);

// Cost estimates (Exa pricing: ~$5/1000 searches, $1/1000 contents)
const SEARCH_COST = 0.005;
const CONTENTS_COST = 0.001;

export async function findSimilar(
  url: string,
  numResults: number,
  jobId: string
): Promise<Array<{ url: string; title?: string; score?: number }>> {
  const start = Date.now();
  const results = await exa.findSimilar(url, {
    numResults,
    excludeSourceDomain: true,
  });
  await logApiCall({
    job_id: jobId,
    service: 'exa',
    step: 'step2-discover',
    model: 'find-similar',
    prompt: url,
    response: JSON.stringify(results.results?.map(r => r.url) ?? []),
    cost_usd: SEARCH_COST,
    duration_ms: Date.now() - start,
  });
  return (results.results ?? []).map(r => ({ url: r.url, title: r.title ?? undefined, score: r.score ?? undefined }));
}

export async function searchCompanies(
  query: string,
  numResults: number,
  jobId: string,
  pipelineStep: string
): Promise<Array<{ url: string; title?: string; score?: number }>> {
  const start = Date.now();
  const results = await exa.search(query, {
    numResults,
    useAutoprompt: true,
  });
  await logApiCall({
    job_id: jobId,
    service: 'exa',
    step: pipelineStep,
    model: 'search',
    prompt: query,
    response: JSON.stringify(results.results?.map(r => r.url) ?? []),
    cost_usd: SEARCH_COST,
    duration_ms: Date.now() - start,
  });
  return (results.results ?? []).map(r => ({ url: r.url, title: r.title ?? undefined, score: r.score ?? undefined }));
}

export async function getContents(
  urls: string[],
  jobId: string
): Promise<Array<{ url: string; text?: string; title?: string }>> {
  if (urls.length === 0) return [];
  const start = Date.now();
  const results = await exa.getContents(urls, { text: { maxCharacters: 3000 } });
  await logApiCall({
    job_id: jobId,
    service: 'exa',
    step: 'step3-enrich',
    model: 'get-contents',
    prompt: urls.join(', '),
    response: `${results.results?.length ?? 0} pages retrieved`,
    cost_usd: urls.length * CONTENTS_COST,
    duration_ms: Date.now() - start,
  });
  return (results.results ?? []).map(r => ({ url: r.url, text: (r as any).text ?? undefined, title: r.title ?? undefined }));
}
