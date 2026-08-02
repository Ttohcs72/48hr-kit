import { analyzeBusinessWebsite } from "../agents/businessAnalyzerAgent.js";
import { reviewPost } from "../agents/brandGuardianAgent.js";
import { writePlatformPost } from "../agents/platformCopywriterAgent.js";
import { PLATFORM_PERSONAS } from "../agents/platformPersonas.js";
import { generateContentPillars, buildContentCalendar } from "../agents/strategistAgent.js";
import { researchTrends, type TrendIdea } from "../agents/trendResearchAgent.js";
import {
  getBusinessProfile,
  getRecentLearnings,
  insertCalendarEntries,
  insertPost,
  insertVerificationLog,
  markCalendarEntryGenerated,
  replaceContentPillars,
  upsertBusinessProfile,
} from "../db/client.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import type { CalendarEntry, Post, PostStatus } from "../types.js";

const MAX_REVISIONS = 2;

/**
 * Entry point #2, the one that runs on a schedule (see
 * .github/workflows/content-pipeline.yml): Strategist plans a calendar,
 * the right platform-expert copywriter drafts each post, Brand Guardian
 * checks every single one, and only posts that clear the bar are marked
 * "approved" for the publisher to pick up later. Nothing here calls a
 * platform API - this script only ever writes drafts and decisions to the
 * database.
 */
async function main() {
  const slug = config.businessSlug();

  let profile = await getBusinessProfile(slug);
  if (!profile) {
    logger.info("No business profile on file yet, running Business Analyzer first", { slug });
    profile = await analyzeBusinessWebsite(slug, config.businessWebsiteUrl());
    await upsertBusinessProfile(profile);
  }

  const priorLearnings = await getRecentLearnings(slug);
  const platforms = config.activePlatforms();

  logger.info("Generating content pillars", { slug, learningsUsed: priorLearnings.length });
  const pillars = await generateContentPillars(profile, priorLearnings);
  await replaceContentPillars(slug, pillars);

  logger.info("Researching trends", { platforms });
  const trends = await researchTrends(profile, platforms);

  logger.info("Building content calendar", {
    days: config.contentCalendarDays(),
    postsPerPlatformPerDay: config.postsPerPlatformPerDay(),
  });
  const plannedEntries = await buildContentCalendar(profile, pillars, trends, priorLearnings, {
    platforms,
    days: config.contentCalendarDays(),
    postsPerPlatformPerDay: config.postsPerPlatformPerDay(),
  });
  const savedEntries = await insertCalendarEntries(plannedEntries);
  logger.info("Calendar entries saved", { count: savedEntries.length });

  let approved = 0;
  let needsHuman = 0;
  let failed = 0;

  for (const entry of savedEntries) {
    try {
      const finalStatus = await generateAndVerifyPost(profile, entry, trends);
      if (finalStatus === "approved") approved++;
      else needsHuman++;
      await markCalendarEntryGenerated(entry.id!);
    } catch (err) {
      failed++;
      logger.error("Failed to generate/verify post for calendar entry", { entryId: entry.id, error: String(err) });
    }
  }

  logger.info("Content generation run complete", { total: savedEntries.length, approved, needsHuman, failed });
}

async function generateAndVerifyPost(
  profile: NonNullable<Awaited<ReturnType<typeof getBusinessProfile>>>,
  entry: CalendarEntry,
  trends: TrendIdea[]
): Promise<PostStatus> {
  const relevantTrend = trends.find((t) => t.platform === entry.platform);
  let revisionNotes: string | undefined;

  for (let attempt = 0; attempt <= MAX_REVISIONS; attempt++) {
    const draft = await writePlatformPost(profile, entry, relevantTrend, revisionNotes);
    const verification = await reviewPost(profile, draft, config.autoPublishMinScore());
    const notes = [verification.issues.join("; "), verification.revisionInstructions].filter(Boolean).join(" | ");

    if (verification.approved && !verification.needsHumanReview) {
      return savePost(draft, "approved", verification.score, notes, entry, attempt);
    }
    if (attempt === MAX_REVISIONS) {
      // Ran out of automatic revision attempts. This is not a failure of the
      // pipeline - it's the safety net working as designed: an uncertain
      // post goes to a human instead of either getting force-published or
      // silently deleted.
      return savePost(draft, "needs_human_review", verification.score, notes, entry, attempt);
    }
    revisionNotes = verification.revisionInstructions ?? verification.issues.join("; ");
    logger.info("Post sent back for revision", { platform: entry.platform, topic: entry.topic, attempt, score: verification.score });
  }
  // Unreachable, but keeps TypeScript happy about the loop always returning.
  return "needs_human_review";
}

async function savePost(draft: Post, status: PostStatus, score: number, notes: string, entry: CalendarEntry, revisionCount: number): Promise<PostStatus> {
  // Platforms that live on visuals (Instagram, TikTok, Pinterest) can be
  // Brand-Guardian-approved on copy alone and still be unpublishable until
  // a real image/video exists - see README "Visual content" for why this
  // system doesn't generate that asset itself, and dashboard.html for where
  // a human attaches mediaUrl.
  const persona = PLATFORM_PERSONAS[entry.platform];
  const finalStatus: PostStatus = persona.needsMediaBrief && !draft.mediaUrl && status === "approved" ? "needs_human_review" : status;

  const saved = await insertPost({
    ...draft,
    status: finalStatus,
    brandGuardianScore: score,
    brandGuardianNotes: notes,
    revisionCount,
  });
  await insertVerificationLog(saved.id!, {
    approved: finalStatus === "approved",
    score,
    issues: notes ? [notes] : [],
    needsHumanReview: finalStatus === "needs_human_review",
  });
  logger.info("Post saved", { id: saved.id, platform: entry.platform, status: finalStatus, score });
  return finalStatus;
}

main().catch((err) => {
  logger.error("Content generation run failed", { error: String(err) });
  process.exit(1);
});
