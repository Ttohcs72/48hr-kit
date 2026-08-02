import { config, isPlatformConfigured } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import type { Post } from "../types.js";
import type { PlatformConnector, PublishResult } from "./types.js";

const API_BASE = "https://api.pinterest.com/v5";

export const pinterestConnector: PlatformConnector = {
  async publish(post: Post): Promise<PublishResult> {
    if (!isPlatformConfigured("pinterest")) {
      logger.warn("Pinterest credentials not configured, dry-run only", { postId: post.id });
      return { platformPostId: `dry-run-pinterest-${Date.now()}`, dryRun: true };
    }
    if (!post.mediaUrl) {
      throw new Error("Pinterest post has no mediaUrl - Pins require an image. See README 'Visual content'.");
    }
    const res = await fetch(`${API_BASE}/pins`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.pinterest.accessToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        board_id: config.pinterest.boardId(),
        title: post.content.slice(0, 100),
        description: composeDescription(post),
        link: post.ctaUrl,
        media_source: { source_type: "image_url", url: post.mediaUrl },
      }),
    });
    const body: any = await res.json();
    if (!res.ok) throw new Error(`Pinterest publish failed: ${JSON.stringify(body)}`);
    return { platformPostId: body.id, dryRun: false };
  },

  async fetchMetrics(pinId: string) {
    if (!isPlatformConfigured("pinterest")) return { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0 };
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const metricTypes = "IMPRESSION,SAVE,OUTBOUND_CLICK,PIN_CLICK";
    const url = `${API_BASE}/pins/${pinId}/analytics?start_date=${start}&end_date=${end}&metric_types=${metricTypes}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${config.pinterest.accessToken()}` } });
    const body: any = await res.json();
    if (!res.ok) {
      logger.warn("Pinterest analytics fetch failed", { body });
      return { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0 };
    }
    const totals = body.all?.summary_metrics ?? {};
    return {
      impressions: totals.IMPRESSION ?? 0,
      likes: 0, // Pinterest's core metric is SAVE, not "likes" - mapped to shares below
      comments: 0,
      shares: totals.SAVE ?? 0,
      clicks: (totals.OUTBOUND_CLICK ?? 0) + (totals.PIN_CLICK ?? 0),
    };
  },
};

function composeDescription(post: Post): string {
  const hashtags = post.hashtags.length ? " " + post.hashtags.map((h) => `#${h}`).join(" ") : "";
  return `${post.content}${hashtags}`;
}
