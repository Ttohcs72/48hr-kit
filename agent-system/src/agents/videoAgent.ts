import { concatMp4Clips } from "../lib/ffmpeg.js";
import { CLIP_SECONDS, generateVeoClip } from "../lib/videoGen.js";
import { uploadPublicFile } from "../lib/storage.js";
import type { BusinessProfile, Platform, Post } from "../types.js";

/**
 * Turns a copywriter agent's mediaBrief into an actual short video by
 * generating two ~8-second Veo clips (a hook shot, then a payoff/CTA shot -
 * a standard short-form editing pattern, not a workaround dressed up) and
 * stitching them into one ~16-second file, the closest reliable match to
 * "~15 seconds" given Veo has no exact-duration parameter (see
 * lib/videoGen.ts). Pass targetSeconds <= CLIP_SECONDS to generate a
 * single clip instead.
 *
 * Scoped to TikTok only for the *automated* pipeline (see
 * VIDEO_CAPABLE_PLATFORMS below and runVideoGeneration.ts) - Instagram can
 * also accept this exact output as a Reel (src/platforms/meta.ts handles
 * it), but isn't auto-triggered here, to avoid the image agent and this
 * agent racing to claim the same Instagram post. See README "Visual
 * content" for how to point a specific Instagram post at video manually.
 */
export const VIDEO_CAPABLE_PLATFORMS: Platform[] = ["tiktok"];

const DEFAULT_TARGET_SECONDS = 15;

export async function generateVideoForPost(profile: BusinessProfile, post: Post, targetSeconds = DEFAULT_TARGET_SECONDS): Promise<string> {
  if (!post.mediaBrief) throw new Error(`Post ${post.id} has no mediaBrief to generate a video from.`);

  const clipsNeeded = targetSeconds <= CLIP_SECONDS ? 1 : 2;
  const prompts = buildClipPrompts(profile, post, clipsNeeded);

  const clips: Buffer[] = [];
  for (const prompt of prompts) {
    clips.push(await generateVeoClip(prompt, "9:16"));
  }

  const stitched = await concatMp4Clips(clips);
  return uploadPublicFile(stitched, `${post.platform}-${post.id}.mp4`, "video/mp4");
}

function buildClipPrompts(profile: BusinessProfile, post: Post, count: number): string[] {
  const base = `Vertical short-form marketing video for ${profile.name}. Brand voice: ${profile.brandVoice}. Scene: ${post.mediaBrief}. Style: realistic, high-energy, no on-screen text or logos - captions are added separately by the platform post.`;

  if (count === 1) return [base];

  return [
    `${base} This is the OPENING shot: establish the scene and hook the viewer in the first second.`,
    `${base} This is the SECOND, closing shot of the same short video: the payoff or call-to-action moment, same subject/setting as the opening shot for visual continuity.`,
  ];
}
