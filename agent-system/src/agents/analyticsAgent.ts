import { askClaudeForJson } from "../lib/claude.js";
import type { PerformingPostSummary } from "../db/client.js";
import type { BusinessProfile } from "../types.js";

const SYSTEM_PROMPT = `You are a performance marketing analyst. You look at which posts actually
drove engagement and extract concrete, reusable insights - not vague
platitudes like "engaging content performs better." Every insight should be
specific enough that a copywriter reading it next week would write a
different post because of it.`;

/**
 * This is the "track the results and improve" loop closing the circle: it
 * reads what actually performed (from analytics_snapshots, via
 * getTopPerformingPosts) and turns it into plain-language lessons the
 * Strategist agent reads before planning the *next* batch of content. The
 * system's writing should visibly change over weeks as this table fills in.
 */
export async function extractLearnings(profile: BusinessProfile, topPosts: PerformingPostSummary[]): Promise<string[]> {
  if (topPosts.length < 3) return []; // not enough signal yet to say anything reliable

  const prompt = `Business: ${profile.name} — ${profile.valueProposition}

Here are the best-performing posts from the last analytics sync, ranked by a
weighted engagement score (highest first):
${topPosts.map((p, i) => `${i + 1}. [${p.platform}, engagement score ${p.totalEngagement}] "${p.content.slice(0, 200)}"`).join("\n")}

What do these posts have in common? Extract 2-4 specific, actionable
insights about what topics, hooks, formats, or angles are working for this
business right now. Respond as a JSON array of strings.`;

  return askClaudeForJson<string[]>({ system: SYSTEM_PROMPT, prompt, temperature: 0.3, maxTokens: 800 });
}
