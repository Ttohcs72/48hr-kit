import { getPostsDueForPublishing, insertPublishLog, updatePost } from "../db/client.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { getConnector } from "../platforms/index.js";

/**
 * Entry point #3, the one that runs most often (every 30-60 min, see
 * .github/workflows/publish-scheduler.yml). It never writes content or
 * makes judgment calls - by the time a post reaches this script it's
 * already been through the Strategist, a copywriter agent, and Brand
 * Guardian. This script's only job is: is it due, is it approved, then
 * send it to the platform and record what happened.
 *
 * If AUTO_PUBLISH_ENABLED is false, posts never reach "approved" status in
 * the first place (see runContentGeneration.ts) - they sit at
 * needs_human_review until someone clicks Approve in dashboard.html, which
 * flips them to "approved" and lets this script pick them up on its next run.
 */
async function main() {
  const slug = config.businessSlug();
  const duePosts = await getPostsDueForPublishing(slug);
  logger.info("Publishing run starting", { slug, duePosts: duePosts.length });

  let published = 0;
  let failed = 0;

  for (const post of duePosts) {
    try {
      const connector = getConnector(post.platform);
      const result = await connector.publish(post);
      await updatePost(post.id!, { status: "published", platformPostId: result.platformPostId, publishedAt: new Date().toISOString() });
      await insertPublishLog(post.id!, post.platform, "success", result.platformPostId);
      published++;
      logger.info("Post published", { id: post.id, platform: post.platform, dryRun: result.dryRun, platformPostId: result.platformPostId });
    } catch (err) {
      failed++;
      await updatePost(post.id!, { status: "failed" });
      await insertPublishLog(post.id!, post.platform, "failed", undefined, String(err));
      logger.error("Post publish failed", { id: post.id, platform: post.platform, error: String(err) });
    }
  }

  logger.info("Publishing run complete", { published, failed });
}

main().catch((err) => {
  logger.error("Publisher run failed", { error: String(err) });
  process.exit(1);
});
