import { config, isPlatformConfigured } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import type { Post } from "../types.js";
import type { PlatformConnector, PublishResult } from "./types.js";

const LINKEDIN_VERSION = "202409"; // LinkedIn requires a versioned API date header; bump periodically per their changelog.
const BASE_URL = "https://api.linkedin.com/rest";

export const linkedinConnector: PlatformConnector = {
  async publish(post: Post): Promise<PublishResult> {
    if (!isPlatformConfigured("linkedin")) {
      logger.warn("LinkedIn credentials not configured, dry-run only", { postId: post.id });
      return { platformPostId: `dry-run-linkedin-${Date.now()}`, dryRun: true };
    }
    const commentary = composeCommentary(post);
    const res = await fetch(`${BASE_URL}/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.linkedin.accessToken()}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: config.linkedin.organizationUrn(),
        commentary,
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });
    if (!res.ok) throw new Error(`LinkedIn publish failed: ${res.status} ${await res.text()}`);
    // LinkedIn returns the created post's URN in the x-restli-id response header, not the body.
    const postUrn = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id") ?? "unknown";
    return { platformPostId: postUrn, dryRun: false };
  },

  async fetchMetrics(platformPostId: string) {
    if (!isPlatformConfigured("linkedin")) return { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0 };
    // Requires the r_organization_social / Community Management API analytics
    // scope in addition to posting scope. See README for the exact product
    // to request in the LinkedIn developer portal.
    const url = `${BASE_URL}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${config.linkedin.organizationUrn()}&shares[0]=${encodeURIComponent(platformPostId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${config.linkedin.accessToken()}`, "LinkedIn-Version": LINKEDIN_VERSION },
    });
    if (!res.ok) {
      logger.warn("LinkedIn analytics fetch failed", { status: res.status });
      return { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0 };
    }
    const body: any = await res.json();
    const stats = body.elements?.[0]?.totalShareStatistics ?? {};
    return {
      impressions: stats.impressionCount ?? 0,
      likes: stats.likeCount ?? 0,
      comments: stats.commentCount ?? 0,
      shares: stats.shareCount ?? 0,
      clicks: stats.clickCount ?? 0,
    };
  },
};

function composeCommentary(post: Post): string {
  const hashtags = post.hashtags.length ? "\n\n" + post.hashtags.map((h) => `#${h}`).join(" ") : "";
  return `${post.content}${hashtags}\n\n${post.ctaUrl}`;
}
