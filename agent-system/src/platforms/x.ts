import { TwitterApi } from "twitter-api-v2";
import { config, isPlatformConfigured } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import type { Post } from "../types.js";
import type { PlatformConnector, PublishResult } from "./types.js";

export const xConnector: PlatformConnector = {
  async publish(post: Post): Promise<PublishResult> {
    if (!isPlatformConfigured("x")) {
      logger.warn("X credentials not configured, dry-run only", { postId: post.id });
      return { platformPostId: `dry-run-x-${Date.now()}`, dryRun: true };
    }
    const client = new TwitterApi({
      appKey: config.x.apiKey()!,
      appSecret: config.x.apiSecret()!,
      accessToken: config.x.accessToken()!,
      accessSecret: config.x.accessSecret()!,
    });
    const text = composeTweetText(post);
    const { data } = await client.v2.tweet(text);
    return { platformPostId: data.id, dryRun: false };
  },

  async fetchMetrics(platformPostId: string) {
    if (!isPlatformConfigured("x")) return { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0 };
    const client = new TwitterApi({
      appKey: config.x.apiKey()!,
      appSecret: config.x.apiSecret()!,
      accessToken: config.x.accessToken()!,
      accessSecret: config.x.accessSecret()!,
    });
    // public_metrics needs the tweet.fields param; organic_metrics/impressions
    // require the account to be part of the elevated/Ads API tier - fall back
    // to public engagement counts, which are available on the standard tier.
    const tweet = await client.v2.singleTweet(platformPostId, { "tweet.fields": ["public_metrics"] });
    const m = tweet.data.public_metrics;
    return {
      impressions: m?.impression_count ?? 0,
      likes: m?.like_count ?? 0,
      comments: m?.reply_count ?? 0,
      shares: m?.retweet_count ?? 0,
      clicks: 0, // X doesn't expose link-click counts on the standard API tier
    };
  },
};

function composeTweetText(post: Post): string {
  const hashtags = post.hashtags.length ? "\n\n" + post.hashtags.map((h) => `#${h}`).join(" ") : "";
  return `${post.content}${hashtags}\n\n${post.ctaUrl}`.slice(0, 280);
}
