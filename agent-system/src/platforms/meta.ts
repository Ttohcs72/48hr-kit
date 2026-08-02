import { config, isPlatformConfigured } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import type { Post } from "../types.js";
import type { PlatformConnector, PublishResult } from "./types.js";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export const facebookConnector: PlatformConnector = {
  async publish(post: Post): Promise<PublishResult> {
    if (!isPlatformConfigured("facebook")) {
      logger.warn("Facebook credentials not configured, dry-run only", { postId: post.id });
      return { platformPostId: `dry-run-facebook-${Date.now()}`, dryRun: true };
    }
    const message = composeCaption(post);
    const params = new URLSearchParams({
      message,
      link: post.ctaUrl,
      access_token: config.meta.pageAccessToken()!,
    });
    const res = await fetch(`${GRAPH_BASE}/${config.meta.pageId()}/feed`, { method: "POST", body: params });
    const body: any = await res.json();
    if (!res.ok) throw new Error(`Facebook publish failed: ${JSON.stringify(body)}`);
    return { platformPostId: body.id, dryRun: false };
  },

  async fetchMetrics(platformPostId: string) {
    if (!isPlatformConfigured("facebook")) return { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0 };
    const fields = "insights.metric(post_impressions,post_clicks).as(insights){values}";
    const url = `${GRAPH_BASE}/${platformPostId}?fields=likes.summary(true),comments.summary(true),shares,${fields}&access_token=${config.meta.pageAccessToken()}`;
    const res = await fetch(url);
    const body: any = await res.json();
    if (!res.ok) {
      logger.warn("Facebook analytics fetch failed", { body });
      return { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0 };
    }
    const insightValue = (metric: string) => body.insights?.data?.find((d: any) => d.name === metric)?.values?.[0]?.value ?? 0;
    return {
      impressions: insightValue("post_impressions"),
      likes: body.likes?.summary?.total_count ?? 0,
      comments: body.comments?.summary?.total_count ?? 0,
      shares: body.shares?.count ?? 0,
      clicks: insightValue("post_clicks"),
    };
  },
};

export const instagramConnector: PlatformConnector = {
  async publish(post: Post): Promise<PublishResult> {
    if (!isPlatformConfigured("instagram")) {
      logger.warn("Instagram credentials not configured, dry-run only", { postId: post.id });
      return { platformPostId: `dry-run-instagram-${Date.now()}`, dryRun: true };
    }
    if (!post.mediaUrl) {
      // Instagram has no text-only post type - the Graph API rejects a
      // media container with no image_url/video_url. This is a hard
      // platform limitation, not something Brand Guardian can wave through.
      throw new Error("Instagram post has no mediaUrl - cannot publish without an image/video asset attached. See README 'Visual content'.");
    }
    const caption = composeCaption(post);
    const igUserId = config.meta.igBusinessAccountId()!;
    const token = config.meta.pageAccessToken()!;
    const isVideo = post.mediaType === "video";

    const containerRes = await fetch(`${GRAPH_BASE}/${igUserId}/media`, {
      method: "POST",
      body: new URLSearchParams(
        isVideo
          ? { media_type: "REELS", video_url: post.mediaUrl, caption, access_token: token }
          : { image_url: post.mediaUrl, caption, access_token: token }
      ),
    });
    const container: any = await containerRes.json();
    if (!containerRes.ok) throw new Error(`Instagram media container failed: ${JSON.stringify(container)}`);

    if (isVideo) {
      // Unlike an image container (ready instantly), Instagram downloads
      // and processes video server-side - publishing before it's ready
      // fails, so we poll status_code the same way the TikTok connector
      // waits on its own async pipeline.
      await waitForReelsContainerReady(container.id, token);
    }

    const publishRes = await fetch(`${GRAPH_BASE}/${igUserId}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: container.id, access_token: token }),
    });
    const published: any = await publishRes.json();
    if (!publishRes.ok) throw new Error(`Instagram publish failed: ${JSON.stringify(published)}`);
    return { platformPostId: published.id, dryRun: false };
  },

  async fetchMetrics(platformPostId: string) {
    if (!isPlatformConfigured("instagram")) return { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0 };
    const url = `${GRAPH_BASE}/${platformPostId}/insights?metric=impressions,likes,comments,shares,reach&access_token=${config.meta.pageAccessToken()}`;
    const res = await fetch(url);
    const body: any = await res.json();
    if (!res.ok) {
      logger.warn("Instagram analytics fetch failed", { body });
      return { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0 };
    }
    const metricValue = (metric: string) => body.data?.find((d: any) => d.name === metric)?.values?.[0]?.value ?? 0;
    return {
      impressions: metricValue("impressions"),
      likes: metricValue("likes"),
      comments: metricValue("comments"),
      shares: metricValue("shares"),
      clicks: 0, // Instagram doesn't expose link-click counts on organic posts (captions can't hold links anyway)
    };
  },
};

async function waitForReelsContainerReady(containerId: string, token: string): Promise<void> {
  const maxAttempts = 30; // ~5 minutes
  const pollIntervalMs = 10_000;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`${GRAPH_BASE}/${containerId}?fields=status_code&access_token=${token}`);
    const body: any = await res.json();
    if (body.status_code === "FINISHED") return;
    if (body.status_code === "ERROR" || body.status_code === "EXPIRED") {
      throw new Error(`Instagram Reels container ${containerId} failed processing: ${JSON.stringify(body)}`);
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error(`Instagram Reels container ${containerId} did not finish processing within the poll window.`);
}

function composeCaption(post: Post): string {
  const hashtags = post.hashtags.length ? "\n\n" + post.hashtags.map((h) => `#${h}`).join(" ") : "";
  return `${post.content}${hashtags}`;
}
