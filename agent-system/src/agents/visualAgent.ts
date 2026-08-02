import { generateImagePng, type ImageSize } from "../lib/imageGen.js";
import { uploadPublicImage } from "../lib/storage.js";
import type { BusinessProfile, Platform, Post } from "../types.js";

/**
 * Turns a copywriter agent's mediaBrief into an actual image. This only
 * covers image-first platforms (Instagram, Pinterest) - TikTok needs real
 * video, which is a different (and much heavier) generation problem, so
 * TikTok posts still wait on a human to attach mediaUrl in dashboard.html.
 * See README "Visual content" for why that line is drawn here.
 *
 * Deliberately not a silent auto-approve step: the generated image lands as
 * mediaUrl on a post that's still status=needs_human_review, so a human
 * sees the actual picture next to the caption in the dashboard and decides
 * whether it's good enough before Approve - that's the "quality review"
 * this agent doesn't try to replace.
 */
export const IMAGE_CAPABLE_PLATFORMS: Platform[] = ["instagram", "pinterest"];

const SIZE_BY_PLATFORM: Partial<Record<Platform, ImageSize>> = {
  instagram: "1024x1024", // square is the safest universal Instagram feed crop
  pinterest: "1024x1536", // Pinterest strongly favors a 2:3 vertical Pin
};

export async function generateVisualForPost(profile: BusinessProfile, post: Post): Promise<string> {
  if (!post.mediaBrief) throw new Error(`Post ${post.id} has no mediaBrief to generate an image from.`);

  const prompt = buildImagePrompt(profile, post);
  const size = SIZE_BY_PLATFORM[post.platform] ?? "1024x1024";
  const png = await generateImagePng(prompt, size);
  return uploadPublicImage(png, `${post.platform}-${post.id}.png`);
}

function buildImagePrompt(profile: BusinessProfile, post: Post): string {
  return [
    `Photo-realistic marketing image for ${profile.name}, a business whose brand voice is: ${profile.brandVoice}.`,
    `Scene to depict: ${post.mediaBrief}`,
    `Style: professional, high-quality marketing photography. No text, logos, or watermarks in the image - captions are added separately.`,
  ].join(" ");
}
