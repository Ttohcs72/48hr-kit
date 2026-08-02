export type Platform = "x" | "linkedin" | "facebook" | "instagram" | "tiktok" | "pinterest";

export const ALL_PLATFORMS: Platform[] = ["x", "linkedin", "facebook", "instagram", "tiktok", "pinterest"];

export type PostStatus =
  | "draft" // just written by a copywriter agent, not yet checked
  | "needs_revision" // Brand Guardian sent it back with notes
  | "needs_human_review" // Brand Guardian is unsure, or auto-publish is off
  | "approved" // Brand Guardian approved, waiting for its scheduled time
  | "published"
  | "failed"
  | "rejected"; // human or Brand Guardian killed it permanently

/** What the Business Analyzer agent extracts from a business's website. This is
 *  the "ground truth" every other agent is checked against. */
export interface BusinessProfile {
  slug: string;
  name: string;
  websiteUrl: string;
  tagline: string;
  brandVoice: string; // e.g. "confident, no-fluff, speaks directly to busy tradespeople"
  targetAudience: string;
  valueProposition: string;
  offers: Array<{ name: string; price: string; description: string }>;
  realClaims: string[]; // verifiable stats/testimonial facts pulled straight from the site, e.g. "40% recovery rate"
  primaryCtaUrl: string;
  bannedTopics: string[]; // things this business should never post about (compliance/legal)
  extractedAt: string;
}

export interface ContentPillar {
  id?: string;
  businessSlug: string;
  name: string; // e.g. "Objection handling", "Social proof", "Educational tips"
  description: string;
  weight: number; // relative frequency in the calendar, 1-10
}

export interface CalendarEntry {
  id?: string;
  businessSlug: string;
  platform: Platform;
  pillarName: string;
  topic: string;
  scheduledAt: string; // ISO timestamp
  status: "planned" | "generated";
}

export interface Post {
  id?: string;
  calendarEntryId?: string;
  businessSlug: string;
  platform: Platform;
  content: string;
  hashtags: string[];
  ctaUrl: string;
  mediaBrief?: string; // description of the image/video that should accompany this post
  mediaUrl?: string; // publicly reachable URL of the actual asset, once one exists (see README "Visual content")
  status: PostStatus;
  scheduledAt: string;
  revisionCount: number;
  brandGuardianScore?: number;
  brandGuardianNotes?: string;
  platformPostId?: string; // ID returned by the platform once published
  publishedAt?: string;
  createdAt?: string;
}

export interface VerificationResult {
  approved: boolean;
  score: number; // 0-100
  issues: string[];
  revisionInstructions?: string;
  needsHumanReview: boolean;
}

export interface AnalyticsSnapshot {
  postId: string;
  platform: Platform;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  capturedAt: string;
}
