import { extractLearnings } from "../agents/analyticsAgent.js";
import { getBusinessProfile, getPublishedPostsMissingRecentAnalytics, getTopPerformingPosts, insertAnalyticsSnapshot, insertLearning } from "../db/client.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { getConnector } from "../platforms/index.js";

/**
 * Entry point #4, run daily (see .github/workflows/analytics-sync.yml).
 * Pulls fresh engagement numbers for everything published more than ~20h
 * ago, then closes the feedback loop: it looks at what's performed best
 * across the business's whole history so far and writes plain-language
 * "learnings" that the Strategist agent reads before planning the next
 * batch of content (runContentGeneration.ts). This is the "track the
 * results and improve" half of the system.
 */
async function main() {
  const slug = config.businessSlug();
  const profile = await getBusinessProfile(slug);
  if (!profile) {
    logger.warn("No business profile on file, nothing to sync analytics for", { slug });
    return;
  }

  const posts = await getPublishedPostsMissingRecentAnalytics(slug);
  logger.info("Analytics sync starting", { slug, posts: posts.length });

  for (const post of posts) {
    if (!post.platformPostId) continue;
    try {
      const connector = getConnector(post.platform);
      const metrics = await connector.fetchMetrics(post.platformPostId);
      await insertAnalyticsSnapshot({ postId: post.id!, platform: post.platform, capturedAt: new Date().toISOString(), ...metrics });
      logger.info("Analytics captured", { postId: post.id, platform: post.platform, ...metrics });
    } catch (err) {
      logger.warn("Failed to fetch analytics for post", { postId: post.id, platform: post.platform, error: String(err) });
    }
  }

  const topPosts = await getTopPerformingPosts(slug);
  const insights = await extractLearnings(profile, topPosts);
  for (const insight of insights) {
    await insertLearning(slug, insight, { basedOnPosts: topPosts.length });
  }
  logger.info("Analytics sync complete", { snapshotsAttempted: posts.length, newLearnings: insights.length });
}

main().catch((err) => {
  logger.error("Analytics sync failed", { error: String(err) });
  process.exit(1);
});
