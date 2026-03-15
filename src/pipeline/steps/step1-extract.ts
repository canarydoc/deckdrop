/**
 * Step 1 — Extract company info from URL / email body / pitch deck.
 *
 * Critical: if only a URL is provided with no other context, we scrape the
 * company homepage first. Without real content, the LLM cannot generate
 * accurate search descriptions and the entire downstream competitor
 * discovery will target the wrong category.
 */
import { llmComplete } from '../../services/llm.js';
import { getContents } from '../../services/exa.js';
import type { CompanyInfo } from '../../types/index.js';

const EXTRACT_SYSTEM = `You are an expert analyst. Extract structured company information from the provided content. Return valid JSON only, no markdown.`;

const DESCRIPTIONS_SYSTEM = `You are an expert market analyst. Generate multiple distinct keyword-rich descriptions of a company for use as search queries to find competitors. Be precise about the category — use the company's actual product/service, not a generic sector. Return valid JSON only, no markdown.`;

export async function extractCompanyInfo(
  urlOrEmailBody: string,
  deckMarkdown: string | undefined,
  jobId: string
): Promise<CompanyInfo> {
  // ── Scrape company homepage if we only have a URL ──────────────────────────
  // When no deck is provided, we must fetch the actual website content.
  // Without this, the LLM hallucinates the company category from the name
  // alone, poisoning all downstream search queries.
  let scrapedContent = '';
  const trimmed = (urlOrEmailBody ?? '').trim();
  const isJustUrl = /^https?:\/\/\S+$/.test(trimmed);

  if (isJustUrl && !deckMarkdown) {
    try {
      const pages = await getContents([trimmed], jobId, 'step1-extract');
      if (pages[0]?.text) {
        scrapedContent = pages[0].text.substring(0, 5000);
      }
    } catch {
      // Non-fatal — continue with URL only
    }
  }

  // Also attempt scraping if URL is embedded in a longer email body
  if (!scrapedContent && !deckMarkdown) {
    const urlInBody = trimmed.match(/https?:\/\/(?!mail\.google|docs\.google|drive\.google)\S+/);
    if (urlInBody) {
      try {
        const pages = await getContents([urlInBody[0]], jobId, 'step1-extract');
        if (pages[0]?.text) {
          scrapedContent = pages[0].text.substring(0, 4000);
        }
      } catch {
        // Non-fatal
      }
    }
  }

  const content = [
    scrapedContent ? `Company website content:\n${scrapedContent}` : '',
    urlOrEmailBody ? `Email / URL provided:\n${urlOrEmailBody}` : '',
    deckMarkdown ? `Pitch deck content:\n${deckMarkdown.substring(0, 8000)}` : '',
  ].filter(Boolean).join('\n\n---\n\n');

  // ── Extract structured company info ────────────────────────────────────────
  const extractResult = await llmComplete({
    step: 'step1-extract',
    jobId,
    systemPrompt: EXTRACT_SYSTEM,
    userPrompt: `Extract company info. Return JSON: { "name": string, "url": string|null, "description": "2-3 precise sentences describing what the company ACTUALLY does — its product, business model, and customer. Do not generalize to a broad sector." }

Content:
${content}`,
    maxTokens: 512,
  });

  let extracted: { name: string; url?: string; description: string };
  try {
    extracted = JSON.parse(extractResult.text.replace(/```json\n?|\n?```/g, '').trim());
  } catch {
    extracted = { name: 'Unknown Company', description: extractResult.text.substring(0, 500) };
  }

  // ── Generate search descriptions for competitor discovery ─────────────────
  const descResult = await llmComplete({
    step: 'step1-extract',
    jobId,
    systemPrompt: DESCRIPTIONS_SYSTEM,
    userPrompt: `Company: ${extracted.name}
Description: ${extracted.description}

Generate 4 distinct, precise keyword-rich descriptions for finding DIRECT COMPETITORS via search. Each must describe a company that would compete with ${extracted.name} for the same customers solving the same problem. Be specific to the exact product category — not the broad industry.

1. Functional (exact verbs + nouns of what it does)
2. Customer/problem (precise buyer + pain point it solves)
3. Category/market (exact product category, not broad sector)
4. Technology/approach (how it works technically)

Return JSON: { "descriptions": ["...", "...", "...", "..."] }`,
    maxTokens: 512,
  });

  let searchDescriptions: string[] = [];
  try {
    const parsed = JSON.parse(descResult.text.replace(/```json\n?|\n?```/g, '').trim());
    searchDescriptions = parsed.descriptions ?? [];
  } catch {
    searchDescriptions = [extracted.description];
  }

  return {
    name: extracted.name,
    url: extracted.url,
    description: extracted.description,
    searchDescriptions,
    deckMarkdown,
  };
}
