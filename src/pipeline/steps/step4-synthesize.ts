/**
 * Step 4 — Synthesize all research into a structured investment memo.
 */
import { llmComplete } from '../../services/llm.js';
import type { CompanyInfo, EnrichedCompetitor, PipelineConfig } from '../../types/index.js';

const SYNTHESIS_SYSTEM = `You are a senior analyst at a bulge-bracket investment bank writing an internal due diligence memo. Your mandate: rigorous, skeptical analysis that helps investors avoid bad decisions — not marketing copy. Rules:
- Never use words like "innovative," "cutting-edge," "revolutionary," or "game-changing"
- Distinguish between what is KNOWN from evidence and what is ASSUMED
- Surface risks the founders likely downplay
- Be precise about market sizing — call out inflated TAM claims
- Dense, tight prose. No filler sentences.
- Format output as clean Markdown with tables`;

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

  ctx += `# DISCOVERED COMPETITORS & ECOSYSTEM (${competitors.length} total)\n\n`;
  for (const comp of competitors) {
    ctx += `## ${comp.name}\n**URL:** ${comp.url}\n`;
    if (comp.fullContent) {
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
    userPrompt: `Write a rigorous investment due diligence memo for **${company.name}**.

The reader is a sophisticated investor or IC member. Assume they are skeptical, time-constrained, and have seen hundreds of pitches. Your job is to give them what they need to form an independent view — especially the risks and gaps that founders won't volunteer.

Use the research below. Every section should be substantiated by evidence from the research, not inference.

---

## ${company.name} — Investment Due Diligence Memo
_Prepared by Deckdrop Research | ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}_

---

### EXECUTIVE SUMMARY
3–5 bullet points. Lead with: what this company IS (precisely), what the market looks like, what the key bet is, and what the single biggest risk to the thesis is. No cheerleading.

---

### COMPANY OVERVIEW
**Business model:** How exactly does it make money? Pricing structure, buyer vs. user, contract structure if discernible.
**Product:** What specifically does it do? What does it explicitly NOT do? Where does it fit in a workflow?
**Go-to-market:** How does it acquire customers? Any visible distribution advantages or disadvantages?
**Traction signals:** What can be inferred from public data (headcount growth, customer logos, reviews, job postings, press)?
**Team signals:** Founders' backgrounds and relevance to this problem. Any notable gaps?
**Funding:** Stage, investors, valuation signals if available.

---

### MARKET ANALYSIS
**Market definition:** Define the market precisely. Call out any tendency to claim a larger TAM than actually addressable.
**Size estimates:** Provide TAM / SAM / SOM with explicit methodology. Flag where estimates are speculative.
**Growth dynamics:** What's driving or could drive growth? Be specific.
**Key tailwinds:** Structural, regulatory, or behavioral trends that help.
**Key headwinds:** Structural, competitive, or timing factors that could limit growth or create problems.

---

### COMPETITIVE LANDSCAPE

#### Tier 1 — Direct Competitors
Companies solving the same core problem for the same customer segment.

| Company | URL | Business Model | Differentiation vs. ${company.name} | Scale/Funding |
|---------|-----|----------------|--------------------------------------|---------------|
[Fill in table for all direct competitors found]

**Deep Dives (Tier 1):**
For each Tier 1 competitor, write 3–5 sentences: what they do precisely, who their customer is, their competitive strengths, their weaknesses, and how they directly threaten or validate ${company.name}'s thesis.

#### Tier 2 — Adjacent & Ecosystem Players
Companies in adjacent categories, potential substitutes, or platform players that could expand into this space.

| Company | Category | Relevance / Risk |
|---------|----------|-----------------|
[Fill in table for all adjacent players found]

Brief 1–2 line characterization of each.

#### Platform & Big Tech Risk
Explicitly assess: could Google, Microsoft, Salesforce, or any dominant platform player make this product redundant or commoditize it within 3–5 years?

#### Competitive Positioning
Using the most relevant 2 axes for this market, where does ${company.name} sit relative to competitors? Is their claimed differentiation defensible or easily replicated?

---

### INVESTMENT CONSIDERATIONS

#### Bull Case
What needs to be true for this to be a strong return? What evidence supports those assumptions?

#### Bear Case
The most likely paths to loss of capital. Be specific.

#### Key Risks
- **Market risk:** Is the market real and large enough?
- **Technology/product risk:** Any moat concerns, build vs. buy, commoditization?
- **Regulatory risk:** Any pending or probable regulatory changes that could help or hurt?
- **Competitive moat risk:** How durable is any current advantage?
- **Business model risk:** Unit economics, CAC/LTV concerns, pricing power?
- **Team/execution risk:** Any visible gaps or red flags?
- **Timing risk:** Too early, too late, or well-timed?

#### Critical Questions for Founders
5–7 specific, hard questions that an investor MUST ask before committing capital. Make them specific to this company and market — not generic VC boilerplate.

---

### RED FLAGS & BLIND SPOTS
What this research cannot determine from public data alone. What hidden facts — if discovered — would materially change the thesis in either direction. Any structural issues that could make this a bad investment that aren't obvious from the surface.

---

${researchContext}`,
    maxTokens: 12000,
    temperature: 0.3,
  });

  return result.text;
}
