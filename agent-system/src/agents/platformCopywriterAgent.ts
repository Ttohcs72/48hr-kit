import { askClaudeForJson } from "../lib/claude.js";
import type { BusinessProfile, CalendarEntry, Post } from "../types.js";
import { PLATFORM_PERSONAS } from "./platformPersonas.js";
import type { TrendIdea } from "./trendResearchAgent.js";

interface DraftResponse {
  content: string;
  hashtags: string[];
  mediaBrief?: string;
}

/**
 * Turns one calendar entry (platform + pillar + topic) into an actual,
 * platform-native post draft. This is called once per calendar entry, for
 * whichever platform that entry targets — the "team of platform experts"
 * is really one agent wearing a different, detailed persona per platform
 * (see platformPersonas.ts), which is far easier to keep consistent and
 * improve over time than six near-duplicate agent files.
 */
export async function writePlatformPost(profile: BusinessProfile, entry: CalendarEntry, relevantTrend: TrendIdea | undefined, revisionNotes?: string): Promise<Post> {
  const persona = PLATFORM_PERSONAS[entry.platform];

  const system = `${persona.expertiseSummary}

You are writing for this specific business — stay strictly inside its real
facts, never invent statistics, prices, or claims that aren't given to you.
Brand voice to match: ${profile.brandVoice}
Never post about: ${profile.bannedTopics.join(", ") || "no specific restrictions given"}`;

  const prompt = `Business: ${profile.name} — ${profile.valueProposition}
Real claims you may reference (do not invent others): ${profile.realClaims.join(" | ") || "none on file, keep claims generic and unquantified"}
Primary link to drive traffic to: ${profile.primaryCtaUrl}

Content pillar: ${entry.pillarName}
Topic for this specific post: ${entry.topic}
${relevantTrend ? `Trend angle to weave in if it fits naturally: ${relevantTrend.trend} (${relevantTrend.whyItFits})` : ""}
${revisionNotes ? `\nA reviewer sent this back with feedback — address it directly:\n${revisionNotes}` : ""}

Platform: ${entry.platform}
Hard character limit: ${persona.maxChars}
Hashtag guidance: ${persona.hashtagGuidance}
CTA style: ${persona.ctaStyle}

Write ONE post. Respond as JSON:
{
  "content": string (the actual post text, under ${persona.maxChars} characters, do NOT include hashtags inline unless that's platform convention - put them in the hashtags array),
  "hashtags": string[] (without the # symbol),
  ${persona.needsMediaBrief ? '"mediaBrief": string (a concrete, shootable description of the photo/video that should accompany this post)' : ""}
}`;

  const draft = await askClaudeForJson<DraftResponse>({ system, prompt, temperature: 0.85, maxTokens: 1200 });

  return {
    calendarEntryId: entry.id,
    businessSlug: profile.slug,
    platform: entry.platform,
    content: draft.content,
    hashtags: draft.hashtags ?? [],
    ctaUrl: profile.primaryCtaUrl,
    mediaBrief: draft.mediaBrief,
    status: "draft",
    scheduledAt: entry.scheduledAt,
    revisionCount: revisionNotes ? 1 : 0,
  };
}
