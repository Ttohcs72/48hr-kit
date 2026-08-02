import { config, isPlatformConfigured } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import type { Post } from "../types.js";
import type { PlatformConnector, PublishResult } from "./types.js";

const API_BASE = "https://open.tiktokapis.com/v2";

export const tiktokConnector: PlatformConnector = {
  async publish(post: Post): Promise<PublishResult> {
    if (!isPlatformConfigured("tiktok")) {
      logger.warn("TikTok credentials not configured, dry-run only", { postId: post.id });
      return { platformPostId: `dry-run-tiktok-${Date.now()}`, dryRun: true };
    }
    if (!post.mediaUrl) {
      throw new Error("TikTok post has no mediaUrl - TikTok is video-only, cannot publish without a video asset. See README 'Visual content'.");
    }
    const caption = composeCaption(post);
    // PULL_FROM_URL requires the video to sit at a publicly-fetchable HTTPS
    // URL that TikTok's servers download from directly - see README for the
    // "verified domain" step TikTok's app review requires for this to work.
    const res = await fetch(`${API_BASE}/post/publish/video/init/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.tiktok.accessToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        post_info: {
          title: caption,
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: { source: "PULL_FROM_URL", video_url: post.mediaUrl },
      }),
    });
    const body: any = await res.json();
    if (!res.ok || body.error?.code !== "ok") throw new Error(`TikTok publish failed: ${JSON.stringify(body)}`);
    // TikTok's publish is async - init returns a publish_id, the video
    // appears once TikTok finishes pulling/processing it. We store the
    // publish_id as the platformPostId and resolve the real video id later
    // during analytics sync via the status-check endpoint.
    return { platformPostId: body.data.publish_id, dryRun: false };
  },

  async fetchMetrics(publishIdOrVideoId: string) {
    if (!isPlatformConfigured("tiktok")) return { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0 };
    const res = await fetch(`${API_BASE}/video/query/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.tiktok.accessToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        filters: { video_ids: [publishIdOrVideoId] },
      }),
    });
    const body: any = await res.json();
    if (!res.ok || !body.data?.videos?.length) {
      logger.warn("TikTok analytics fetch failed or video not yet processed", { body });
      return { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0 };
    }
    const video = body.data.videos[0];
    return {
      impressions: video.view_count ?? 0,
      likes: video.like_count ?? 0,
      comments: video.comment_count ?? 0,
      shares: video.share_count ?? 0,
      clicks: 0, // not exposed for organic posts
    };
  },
};

function composeCaption(post: Post): string {
  const hashtags = post.hashtags.length ? " " + post.hashtags.map((h) => `#${h}`).join(" ") : "";
  return `${post.content}${hashtags}`;
}
