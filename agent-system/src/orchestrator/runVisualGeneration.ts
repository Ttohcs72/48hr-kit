import { generateVisualForPost, IMAGE_CAPABLE_PLATFORMS } from "../agents/visualAgent.js";
import { getBusinessProfile, getPostsAwaitingMedia, updatePost } from "../db/client.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";

/**
 * Entry point #5, run on its own schedule after content generation (see
 * .github/workflows/visual-generation.yml). Finds posts on image-capable
 * platforms that are waiting on media, generates one, and attaches it -
 * the post stays at needs_human_review either way, so a human still signs
 * off on the picture+caption together before it can be approved.
 *
 * If OPENAI_API_KEY isn't set, this script logs a warning and exits
 * cleanly - it's an optional stage, not a hard dependency of the pipeline.
 */
async function main() {
  if (!config.openaiApiKey()) {
    logger.warn("OPENAI_API_KEY not set, skipping visual generation run (posts needing media will keep waiting for manual mediaUrl uploads).");
    return;
  }

  const slug = config.businessSlug();
  const profile = await getBusinessProfile(slug);
  if (!profile) {
    logger.warn("No business profile on file, nothing to generate visuals for", { slug });
    return;
  }

  const posts = await getPostsAwaitingMedia(slug, IMAGE_CAPABLE_PLATFORMS);
  logger.info("Visual generation run starting", { slug, posts: posts.length });

  let generated = 0;
  let failed = 0;

  for (const post of posts) {
    try {
      const mediaUrl = await generateVisualForPost(profile, post);
      await updatePost(post.id!, { mediaUrl, mediaType: "image" });
      generated++;
      logger.info("Image generated and attached", { postId: post.id, platform: post.platform, mediaUrl });
    } catch (err) {
      failed++;
      logger.error("Failed to generate image for post", { postId: post.id, platform: post.platform, error: String(err) });
    }
  }

  logger.info("Visual generation run complete", { generated, failed });
}

main().catch((err) => {
  logger.error("Visual generation run failed", { error: String(err) });
  process.exit(1);
});
