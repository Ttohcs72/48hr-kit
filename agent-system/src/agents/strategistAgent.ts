import { askClaudeForJson } from "../lib/claude.js";
import type { BusinessProfile, CalendarEntry, ContentPillar, Platform } from "../types.js";
import type { TrendIdea } from "./trendResearchAgent.js";

const PILLAR_SYSTEM_PROMPT = `You are a content strategist who designs the recurring "pillars" (themes) a
business's social presence rotates through, so content stays varied instead
of repeating the same pitch every day. Pillars should mix direct-offer
content with value-first content (education, proof, community) at roughly
an 80/20 ratio in favor of value-first, because accounts that only sell
underperform and get throttled by platform algorithms.`;

export async function generateContentPillars(profile: BusinessProfile, priorLearnings: string[]): Promise<ContentPillar[]> {
  const prompt = `Business: ${profile.name} — ${profile.valueProposition}
Audience: ${profile.targetAudience}
Brand voice: ${profile.brandVoice}
${priorLearnings.length ? `\nWhat we've learned works from past posts:\n- ${priorLearnings.join("\n- ")}` : ""}

Design 5-7 content pillars for this business. Respond as a JSON array:
[{ "name": string, "description": string, "weight": number (1-10, relative frequency) }]`;

  return askClaudeForJson<ContentPillar[]>({ system: PILLAR_SYSTEM_PROMPT, prompt, temperature: 0.5, maxTokens: 1500 }).then((pillars) =>
    pillars.map((p) => ({ ...p, businessSlug: profile.slug }))
  );
}

// Rough, defensible "when this audience is actually scrolling" windows per
// platform. Not a trend lookup — just sane defaults so posts aren't all
// dumped at midnight. Times are hours in 24h format, business's local sense
// of "business hours" is assumed (the orchestrator can shift this to the
// business's actual timezone later).
const POSTING_HOURS: Record<Platform, number[]> = {
  x: [8, 12, 17],
  linkedin: [8, 12],
  facebook: [9, 13, 19],
  instagram: [11, 19],
  tiktok: [7, 19],
  pinterest: [14, 20],
};

const CALENDAR_SYSTEM_PROMPT = `You are a social media content planner. You take a list of content pillars
and platforms and lay out specific, concrete post topics — not vague
placeholders like "Monday motivation" but an actual angle, e.g. "Before/after
story: the $1,800 recovered in 90 minutes (David Thompson case study)."
Vary topics across days, don't repeat the same angle twice in the plan, and
weight pillar selection by each pillar's stated weight.`;

export interface CalendarOptions {
  platforms: Platform[];
  days: number;
  postsPerPlatformPerDay: number;
  startDate?: Date;
}

/**
 * Produces the actual daily, multi-platform posting schedule: which
 * platform, which pillar, what specific topic, and when. This is what turns
 * "post daily multiple times" from an instruction into concrete rows the
 * copywriter agents can each pick up and turn into a real post.
 */
export async function buildContentCalendar(
  profile: BusinessProfile,
  pillars: ContentPillar[],
  trends: TrendIdea[],
  priorLearnings: string[],
  options: CalendarOptions
): Promise<CalendarEntry[]> {
  const startDate = options.startDate ?? new Date();
  const totalPerPlatform = options.days * options.postsPerPlatformPerDay;

  const prompt = `Business: ${profile.name} — ${profile.valueProposition}
Real claims we're allowed to reference (do not invent others): ${profile.realClaims.join(" | ") || "none on file"}

Pillars (name: weight - description):
${pillars.map((p) => `- ${p.name} (weight ${p.weight}): ${p.description}`).join("\n")}

Current trend angles to consider weaving in where relevant:
${trends.map((t) => `- [${t.platform}] ${t.trend} — ${t.whyItFits}`).join("\n") || "none available this run"}
${priorLearnings.length ? `\nWhat's worked before:\n- ${priorLearnings.join("\n- ")}` : ""}

Plan exactly ${totalPerPlatform} post topics for EACH of these platforms: ${options.platforms.join(", ")}
(that's ${options.postsPerPlatformPerDay} per platform per day across ${options.days} day(s), dayOffset 0 = today).
Each entry needs a distinct, specific topic (not a repeat of another entry).

Respond as a JSON array with exactly ${totalPerPlatform * options.platforms.length} entries:
[{ "platform": string, "pillarName": string (must match one of the pillar names above), "topic": string, "dayOffset": number (0-indexed), "slotIndex": number (0-indexed, which post of the day on that platform) }]`;

  interface RawEntry {
    platform: Platform;
    pillarName: string;
    topic: string;
    dayOffset: number;
    slotIndex: number;
  }

  const raw = await askClaudeForJson<RawEntry[]>({ system: CALENDAR_SYSTEM_PROMPT, prompt, temperature: 0.8, maxTokens: 4000 });

  return raw.map((entry) => ({
    businessSlug: profile.slug,
    platform: entry.platform,
    pillarName: entry.pillarName,
    topic: entry.topic,
    scheduledAt: computeScheduledTime(startDate, entry.platform, entry.dayOffset, entry.slotIndex),
    status: "planned" as const,
  }));
}

function computeScheduledTime(startDate: Date, platform: Platform, dayOffset: number, slotIndex: number): string {
  const hours = POSTING_HOURS[platform] ?? [9, 17];
  const hour = hours[slotIndex % hours.length];
  const date = new Date(startDate);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}
