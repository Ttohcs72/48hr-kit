import { generateVideoForPost, VIDEO_CAPABLE_PLATFORMS } from "../agents/videoAgent.js";
import { getBusinessProfile, getPostsAwaitingMedia, updatePost } from "../db/client.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";

/**
 * Entry point #6, run on its own schedule after content generation (see
 * .github/workflows/video-generation.yml). Finds TikTok posts waiting on
 * media and generates a ~15-second video for each. Like the image
 * pipeline, the post stays at needs_human_review afterward - a human
 * previews the actual generated video in dashboard.html before approving.
 *
 * Video generation is slow (each ~8-second clip can take several minutes,
 * and most posts here need two), so this can be a long-running job -
 * budget more workflow time than the image generation step.
 *
 * If GEMINI_API_KEY isn't set, this script logs a warning and exits
 * cleanly - it's an optional stage, not a hard dependency of the pipeline.
 */
async function main() {
  if (!config.geminiApiKey()) {
    logger.warn("GEMINI_API_KEY not set, skipping video generation run (TikTok posts needing media will keep waiting for manual mediaUrl uploads).");
    return;
  }

  const slug = config.businessSlug();
  const profile = await getBusinessProfile(slug);
  if (!profile) {
    logger.warn("No business profile on file, nothing to generate video for", { slug });
    return;
  }

  const posts = await getPostsAwaitingMedia(slug, VIDEO_CAPABLE_PLATFORMS);
  logger.info("Video generation run starting", { slug, posts: posts.length });

  let generated = 0;
  let failed = 0;

  for (const post of posts) {
    try {
      const mediaUrl = await generateVideoForPost(profile, post);
      await updatePost(post.id!, { mediaUrl, mediaType: "video" });
      generated++;
      logger.info("Video generated and attached", { postId: post.id, platform: post.platform, mediaUrl });
    } catch (err) {
      failed++;
      logger.error("Failed to generate video for post", { postId: post.id, platform: post.platform, error: String(err) });
    }
  }

  logger.info("Video generation run complete", { generated, failed });
}

main().catch((err) => {
  logger.error("Video generation run failed", { error: String(err) });
  process.exit(1);
});
