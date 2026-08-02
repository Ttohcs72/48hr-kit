import { askClaudeForJson } from "../lib/claude.js";
import { fetchCleanPageText } from "../lib/webScraper.js";
import type { BusinessProfile } from "../types.js";

const SYSTEM_PROMPT = `You are a senior brand strategist. You read a business's real website content
and extract an honest, structured profile of that business. You are grounding
data for a marketing system, not writing marketing copy yourself — so be literal
and conservative. Every entry in "realClaims" must be a fact, statistic, price,
or testimonial quote you can point to directly in the source text. If you are not
sure something is true, leave it out rather than guess.`;

/**
 * The entry point for "enter any business website and get a content engine."
 * Scrapes the site, asks Claude to distill it into a BusinessProfile, and
 * returns it (the orchestrator script is responsible for saving it to the DB).
 */
export async function analyzeBusinessWebsite(slug: string, websiteUrl: string): Promise<BusinessProfile> {
  const pageText = await fetchCleanPageText(websiteUrl);

  const prompt = `Here is the scraped content of a business's website:\n\n${pageText}\n\n
Extract a BusinessProfile as JSON with exactly these fields:
{
  "name": string,
  "tagline": string,
  "brandVoice": string (2-3 sentences describing tone, e.g. "confident, no-fluff, speaks directly to busy tradespeople, avoids corporate jargon"),
  "targetAudience": string (who this is for, be specific),
  "valueProposition": string (the core promise/outcome this business sells),
  "offers": [{ "name": string, "price": string, "description": string }],
  "realClaims": string[] (verifiable stats, numbers, testimonial quotes found directly in the text - these must be traceable to the source, do not invent any),
  "primaryCtaUrl": string (the main call-to-action link on the page, or the website URL itself if none found),
  "bannedTopics": string[] (topics this business should clearly never post about, inferred from context - e.g. if it's a financial product, avoid guaranteeing income; if health-adjacent, avoid medical claims)
}`;

  const extracted = await askClaudeForJson<Omit<BusinessProfile, "slug" | "websiteUrl" | "extractedAt">>({
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0.2,
    maxTokens: 2000,
  });

  return {
    slug,
    websiteUrl,
    extractedAt: new Date().toISOString(),
    ...extracted,
  };
}
