import { askClaudeForJson } from "../lib/claude.js";
import { PLATFORM_PERSONAS } from "./platformPersonas.js";
import type { BusinessProfile, Post, VerificationResult } from "../types.js";

const SYSTEM_PROMPT = `You are the Brand Guardian: the final checkpoint before a social media post
either gets published autonomously or is held for a human. You represent the
business owner's judgment. You are deliberately skeptical and literal-minded —
your job is to catch problems, not to be agreeable.

Reject or flag anything that:
1. States a statistic, price, guarantee, or claim not explicitly given to you as a real, verified fact.
2. Breaks the business's stated brand voice or touches a banned topic.
3. Makes a legal/compliance-risk claim (guaranteed results, medical/health claims, financial promises, "#1" or superlative claims without basis).
4. Would embarrass or misrepresent the business if a customer screenshotted it.
5. Doesn't actually fit the named platform's norms (wrong tone/length/format for where it's posting).

You are not a copy editor — do not nitpick style preferences. Only flag
things that are actually wrong, risky, or off-brand. A post can be approved
even if you'd have phrased something differently.`;

/**
 * The single master check every generated post must pass through before it
 * can go out under this business's name. This is what "a master AI that
 * verifies each post is accurate to the business" means in code: one
 * agent, one system prompt, running against every platform's output, with
 * the business's real facts as its only source of truth.
 */
export async function reviewPost(profile: BusinessProfile, post: Post, autoPublishMinScore: number): Promise<VerificationResult> {
  const persona = PLATFORM_PERSONAS[post.platform];

  // Hard, deterministic checks first — no reason to spend an LLM call
  // deciding whether 350 characters fits in a 280-character limit.
  const hardIssues: string[] = [];
  if (post.content.length > persona.maxChars) {
    hardIssues.push(`Content is ${post.content.length} characters, exceeds the ${persona.maxChars}-character limit for ${post.platform}.`);
  }
  if (!post.content.trim()) {
    hardIssues.push("Content is empty.");
  }

  const prompt = `BUSINESS FACTS (the only source of truth — nothing outside this list is verified):
Name: ${profile.name}
Value proposition: ${profile.valueProposition}
Brand voice: ${profile.brandVoice}
Verified claims/stats/quotes: ${profile.realClaims.join(" | ") || "none on file"}
Offers: ${profile.offers.map((o) => `${o.name} (${o.price})`).join(", ") || "none on file"}
Banned topics: ${profile.bannedTopics.join(", ") || "none specified"}

POST TO REVIEW (platform: ${post.platform}):
"""
${post.content}
"""
Hashtags: ${post.hashtags.join(", ") || "none"}
CTA link: ${post.ctaUrl}

${hardIssues.length ? `Automated checks already found these hard issues, include them in your issues list:\n- ${hardIssues.join("\n- ")}` : ""}

Respond as JSON:
{
  "approved": boolean,
  "score": number (0-100, your confidence this is safe and on-brand to publish as-is),
  "issues": string[] (empty if none),
  "revisionInstructions": string (specific, actionable guidance for a rewrite - only if approved is false),
  "needsHumanReview": boolean (true if this involves any judgment call a human should make - compliance-adjacent claims, ambiguous brand fit, or anything you're not fully confident about, even if score is high)
}`;

  const result = await askClaudeForJson<VerificationResult>({ system: SYSTEM_PROMPT, prompt, temperature: 0, maxTokens: 800 });

  if (hardIssues.length > 0) {
    result.approved = false;
    result.score = Math.min(result.score, 40);
    result.issues = [...new Set([...hardIssues, ...result.issues])];
  }

  // Belt-and-suspenders: even a fully "approved" post doesn't auto-publish
  // unless it clears the business's configured confidence bar.
  if (result.score < autoPublishMinScore) {
    result.needsHumanReview = true;
  }

  return result;
}
