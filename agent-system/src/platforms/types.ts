import type { AnalyticsSnapshot, Post } from "../types.js";

export interface PublishResult {
  platformPostId: string;
  dryRun: boolean;
}

/** One shared contract every platform connector implements, so the
 *  publisher/analytics orchestrator scripts never branch on platform. */
export interface PlatformConnector {
  publish(post: Post): Promise<PublishResult>;
  fetchMetrics(platformPostId: string): Promise<Omit<AnalyticsSnapshot, "postId" | "platform" | "capturedAt">>;
}
