/**
 * Step 4 — Synthesize all research into a structured Markdown report.
 */
import { llmComplete } from '../../services/llm.js';
import type { CompanyInfo, EnrichedCompetitor, PipelineConfig } from '../../types/index.js';

const SYNTHESIS_SYSTEM = `You are a world-class investment analyst and due diligence expert. Generate a comprehensive, well-structured diligence report in Markdown format. Be specific, analytical, and insightful. Use data from the research provided. Avoid generic statements.`;

function buildResearchContext(
  company: CompanyInfo,
  competitors: EnrichedCompetitor[],
  config: PipelineConfig
): string {
  const maxTokens = parseInt(config.max_context_tokens ?? '80000', 10);

  let ctx = `# INDEX COMPANY\n**Name:** ${company.name}\n`;
  if (company.url) ctx += `**URL:** ${company.url}\n`;
  ctx += `**Description:** ${company.description}\n\n`;
  if (company.deckMarkdown) {
    ctx += `## Pitch Deck Content\n${company.deckMarkdown.substring(0, 6000)}\n\n`;
  }

  ctx += `# COMPETITORS (${competitors.length} found)\n\n`;
  for (const comp of competitors) {
    ctx += `## ${comp.name}\n**URL:** ${comp.url}\n`;
    if (comp.fullContent) {
      // Trim content to stay within context limits
      const maxPerComp = Math.floor((maxTokens * 3) / competitors.length / 10);
      ctx += `${comp.fullContent.substring(0, maxPerComp)}\n`;
    }
    ctx += '\n';
  }

  return ctx;
}

export async function synthesizeReport(
  company: CompanyInfo,
  competitors: EnrichedCompetitor[],
  config: PipelineConfig,
  jobId: string
): Promise<string> {
  const researchContext = buildResearchContext(company, competitors, config);

  const result = await llmComplete({
    step: 'step4-synthesize',
    jobId,
    systemPrompt: SYNTHESIS_SYSTEM,
    userPrompt: `Using the research below, write a comprehensive investment due diligence report for **${company.name}**.

Include these sections:
1. **Executive Summary** (3-5 key takeaways for an investor)
2. **Index Company Analysis** (business model, product, traction, team signals, funding)
3. **Market Overview** (size, growth, dynamics, tailwinds/headwinds)
4. **Competitive Landscape** (table: Competitor | Category | Key Differentiator | Funding Stage)
5. **Competitor Deep Dives** (top 5-8: each with product, positioning, strengths, weaknesses)
6. **Positioning Analysis** (2×2 grid in text: axes most relevant to this market)
7. **Market Sizing** (TAM/SAM/SOM estimates with reasoning)
8. **Investment Considerations** (bull case, bear case, key risks, key questions to ask founders)

---

${researchContext}`,
    maxTokens: 8000,
    temperature: 0.4,
  });

  return result.text;
}
