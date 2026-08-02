import { askClaudeForJson, askClaudeWithWebSearch, parseJsonResponse } from "../lib/claude.js";
import { logger } from "../lib/logger.js";
import type { BusinessProfile, Platform } from "../types.js";

export interface TrendIdea {
  platform: Platform;
  trend: string;
  whyItFits: string; // why this trend is relevant to THIS business specifically
}

const SYSTEM_PROMPT = `You are a social media trend analyst who tracks what's actually working right
now on X, LinkedIn, Facebook, Instagram, TikTok, and Pinterest — trending
formats, audio, hashtags, and conversation angles — for small/local service
businesses. You only suggest trends that a specific business could credibly
participate in; you never suggest a trend just because it's popular in general.`;

/**
 * Surfaces 2-3 current trend angles per platform, scoped to this specific
 * business's industry and audience. This is what stops the content
 * calendar from being generic evergreen posts and instead riding what's
 * actually getting reach right now.
 */
export async function researchTrends(profile: BusinessProfile, platforms: Platform[]): Promise<TrendIdea[]> {
  const prompt = `Business: ${profile.name}
Industry/audience: ${profile.targetAudience}
Value proposition: ${profile.valueProposition}

For each of these platforms: ${platforms.join(", ")}
Find 2-3 CURRENT trending formats, sounds, hashtags, or conversation angles
(as of today) that this specific business could credibly ride to get
discovery/reach, not generic evergreen advice.

Respond as a JSON array of objects: [{ "platform": string, "trend": string, "whyItFits": string }]`;

  try {
    const raw = await askClaudeWithWebSearch({ system: SYSTEM_PROMPT, prompt, maxTokens: 2000 });
    return parseJsonResponse<TrendIdea[]>(raw);
  } catch (err) {
    // web_search isn't enabled on every Anthropic plan, and even when it is,
    // a flaky search shouldn't take down calendar generation. Fall back to
    // Claude's own knowledge of durable platform best-practices instead.
    logger.warn("Live trend search unavailable, falling back to model knowledge", { error: String(err) });
    return askClaudeForJson<TrendIdea[]>({
      system: SYSTEM_PROMPT,
      prompt: prompt + "\n\n(Live web search is unavailable — use your general knowledge of durable platform best-practices and content formats instead of claiming real-time trends.)",
      maxTokens: 2000,
    });
  }
}
