/**
 * Step 1 — Extract company info from email body / pitch deck.
 * Generates multiple keyword-rich descriptions for Exa search queries.
 */
import { llmComplete } from '../../services/llm.js';
import type { CompanyInfo } from '../../types/index.js';

const EXTRACT_SYSTEM = `You are an expert analyst. Extract structured company information from the provided email or pitch deck content. Return valid JSON only, no markdown.`;

const DESCRIPTIONS_SYSTEM = `You are an expert market analyst. Generate multiple distinct keyword-rich descriptions of a company for use as search queries to find competitors. Return valid JSON only, no markdown.`;

export async function extractCompanyInfo(
  emailBody: string,
  deckMarkdown: string | undefined,
  jobId: string
): Promise<CompanyInfo> {
  const content = [
    emailBody ? `Email body:\n${emailBody}` : '',
    deckMarkdown ? `Pitch deck content:\n${deckMarkdown.substring(0, 8000)}` : '',
  ].filter(Boolean).join('\n\n');

  const extractResult = await llmComplete({
    step: 'step1-extract',
    jobId,
    systemPrompt: EXTRACT_SYSTEM,
    userPrompt: `Extract company info from this content. Return JSON with fields: name (string), url (string or null), description (string, 2-3 sentences).

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

  // Generate multiple search descriptions
  const descResult = await llmComplete({
    step: 'step1-extract',
    jobId,
    systemPrompt: DESCRIPTIONS_SYSTEM,
    userPrompt: `Company: ${extracted.name}
Description: ${extracted.description}

Generate 4 distinct keyword-rich descriptions for finding competitors via search:
1. Functional (what it does, key verbs and nouns)
2. Customer/problem (who uses it, what pain it solves)
3. Category/market (industry vertical, market category)
4. Technical approach (how it works, key technologies)

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
