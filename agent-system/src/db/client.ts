import { createClient } from "@supabase/supabase-js";
import { config } from "../lib/config.js";
import type { AnalyticsSnapshot, BusinessProfile, CalendarEntry, ContentPillar, Platform, Post, VerificationResult } from "../types.js";

/**
 * Every DB read/write the agents need, in one typed place. Agents never
 * import @supabase/supabase-js directly — they call these functions, so the
 * schema shape (snake_case in Postgres, camelCase in TypeScript) only gets
 * translated once, here.
 */
// No generated Database type for this project (there's no build step that
// generates one from schema.sql), so we type the client as `any` here and
// rely on the typed function signatures below (BusinessProfile, Post, etc.)
// as the real type safety boundary instead.
let supabase: ReturnType<typeof createClient<any>> | undefined;
function db(): ReturnType<typeof createClient<any>> {
  if (!supabase) supabase = createClient<any>(config.supabaseUrl(), config.supabaseServiceRoleKey());
  return supabase;
}

export async function upsertBusinessProfile(p: BusinessProfile): Promise<void> {
  const { error } = await db().from("businesses").upsert({
    slug: p.slug,
    name: p.name,
    website_url: p.websiteUrl,
    tagline: p.tagline,
    brand_voice: p.brandVoice,
    target_audience: p.targetAudience,
    value_proposition: p.valueProposition,
    offers: p.offers,
    real_claims: p.realClaims,
    primary_cta_url: p.primaryCtaUrl,
    banned_topics: p.bannedTopics,
    extracted_at: p.extractedAt,
  });
  if (error) throw error;
}

export async function getBusinessProfile(slug: string): Promise<BusinessProfile | null> {
  const { data, error } = await db().from("businesses").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    slug: data.slug,
    name: data.name,
    websiteUrl: data.website_url,
    tagline: data.tagline,
    brandVoice: data.brand_voice,
    targetAudience: data.target_audience,
    valueProposition: data.value_proposition,
    offers: data.offers,
    realClaims: data.real_claims,
    primaryCtaUrl: data.primary_cta_url,
    bannedTopics: data.banned_topics,
    extractedAt: data.extracted_at,
  };
}

export async function replaceContentPillars(businessSlug: string, pillars: ContentPillar[]): Promise<void> {
  const { error: delErr } = await db().from("content_pillars").delete().eq("business_slug", businessSlug);
  if (delErr) throw delErr;
  const { error } = await db()
    .from("content_pillars")
    .insert(pillars.map((p) => ({ business_slug: businessSlug, name: p.name, description: p.description, weight: p.weight })));
  if (error) throw error;
}

export async function getContentPillars(businessSlug: string): Promise<ContentPillar[]> {
  const { data, error } = await db().from("content_pillars").select("*").eq("business_slug", businessSlug);
  if (error) throw error;
  return (data ?? []).map((d) => ({ id: d.id, businessSlug: d.business_slug, name: d.name, description: d.description, weight: d.weight }));
}

export async function insertCalendarEntries(entries: CalendarEntry[]): Promise<CalendarEntry[]> {
  const { data, error } = await db()
    .from("calendar_entries")
    .insert(
      entries.map((e) => ({
        business_slug: e.businessSlug,
        platform: e.platform,
        pillar_name: e.pillarName,
        topic: e.topic,
        scheduled_at: e.scheduledAt,
        status: e.status,
      }))
    )
    .select("*");
  if (error) throw error;
  return (data ?? []).map(rowToCalendarEntry);
}

export async function getPendingCalendarEntries(businessSlug: string): Promise<CalendarEntry[]> {
  const { data, error } = await db()
    .from("calendar_entries")
    .select("*")
    .eq("business_slug", businessSlug)
    .eq("status", "planned")
    .order("scheduled_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToCalendarEntry);
}

export async function markCalendarEntryGenerated(id: string): Promise<void> {
  const { error } = await db().from("calendar_entries").update({ status: "generated" }).eq("id", id);
  if (error) throw error;
}

function rowToCalendarEntry(d: any): CalendarEntry {
  return { id: d.id, businessSlug: d.business_slug, platform: d.platform, pillarName: d.pillar_name, topic: d.topic, scheduledAt: d.scheduled_at, status: d.status };
}

export async function insertPost(p: Post): Promise<Post> {
  const { data, error } = await db()
    .from("posts")
    .insert({
      calendar_entry_id: p.calendarEntryId,
      business_slug: p.businessSlug,
      platform: p.platform,
      content: p.content,
      hashtags: p.hashtags,
      cta_url: p.ctaUrl,
      media_brief: p.mediaBrief,
      media_url: p.mediaUrl,
      status: p.status,
      scheduled_at: p.scheduledAt,
      revision_count: p.revisionCount,
      brand_guardian_score: p.brandGuardianScore,
      brand_guardian_notes: p.brandGuardianNotes,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToPost(data);
}

export async function updatePost(id: string, patch: Partial<Post>): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.content !== undefined) update.content = patch.content;
  if (patch.hashtags !== undefined) update.hashtags = patch.hashtags;
  if (patch.mediaUrl !== undefined) update.media_url = patch.mediaUrl;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.revisionCount !== undefined) update.revision_count = patch.revisionCount;
  if (patch.brandGuardianScore !== undefined) update.brand_guardian_score = patch.brandGuardianScore;
  if (patch.brandGuardianNotes !== undefined) update.brand_guardian_notes = patch.brandGuardianNotes;
  if (patch.platformPostId !== undefined) update.platform_post_id = patch.platformPostId;
  if (patch.publishedAt !== undefined) update.published_at = patch.publishedAt;
  const { error } = await db().from("posts").update(update).eq("id", id);
  if (error) throw error;
}

export async function getPostsDueForPublishing(businessSlug: string): Promise<Post[]> {
  const { data, error } = await db()
    .from("posts")
    .select("*")
    .eq("business_slug", businessSlug)
    .eq("status", "approved")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToPost);
}

export async function getPostsAwaitingMedia(businessSlug: string, platforms: Platform[]): Promise<Post[]> {
  const { data, error } = await db()
    .from("posts")
    .select("*")
    .eq("business_slug", businessSlug)
    .eq("status", "needs_human_review")
    .in("platform", platforms)
    .is("media_url", null)
    .not("media_brief", "is", null);
  if (error) throw error;
  return (data ?? []).map(rowToPost);
}

export async function getPublishedPostsMissingRecentAnalytics(businessSlug: string, olderThanHours = 20): Promise<Post[]> {
  const cutoff = new Date(Date.now() - olderThanHours * 3600_000).toISOString();
  const { data, error } = await db()
    .from("posts")
    .select("*")
    .eq("business_slug", businessSlug)
    .eq("status", "published")
    .lte("published_at", cutoff);
  if (error) throw error;
  return (data ?? []).map(rowToPost);
}

function rowToPost(d: any): Post {
  return {
    id: d.id,
    calendarEntryId: d.calendar_entry_id,
    businessSlug: d.business_slug,
    platform: d.platform,
    content: d.content,
    hashtags: d.hashtags ?? [],
    ctaUrl: d.cta_url,
    mediaBrief: d.media_brief,
    mediaUrl: d.media_url ?? undefined,
    status: d.status,
    scheduledAt: d.scheduled_at,
    revisionCount: d.revision_count,
    brandGuardianScore: d.brand_guardian_score ?? undefined,
    brandGuardianNotes: d.brand_guardian_notes ?? undefined,
    platformPostId: d.platform_post_id ?? undefined,
    publishedAt: d.published_at ?? undefined,
    createdAt: d.created_at,
  };
}

export async function insertVerificationLog(postId: string, result: VerificationResult): Promise<void> {
  const { error } = await db().from("verification_log").insert({
    post_id: postId,
    approved: result.approved,
    score: result.score,
    issues: result.issues,
    revision_instructions: result.revisionInstructions,
    needs_human_review: result.needsHumanReview,
  });
  if (error) throw error;
}

export async function insertPublishLog(postId: string, platform: Platform, status: "success" | "failed", platformPostId?: string, error?: string): Promise<void> {
  const { error: err } = await db().from("publish_log").insert({ post_id: postId, platform, status, platform_post_id: platformPostId, error });
  if (err) throw err;
}

export async function insertAnalyticsSnapshot(s: AnalyticsSnapshot): Promise<void> {
  const { error } = await db().from("analytics_snapshots").insert({
    post_id: s.postId,
    platform: s.platform,
    impressions: s.impressions,
    likes: s.likes,
    comments: s.comments,
    shares: s.shares,
    clicks: s.clicks,
    captured_at: s.capturedAt,
  });
  if (error) throw error;
}

export async function getRecentLearnings(businessSlug: string, limit = 10): Promise<string[]> {
  const { data, error } = await db()
    .from("learnings")
    .select("insight")
    .eq("business_slug", businessSlug)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((d) => d.insight as string);
}

export async function insertLearning(businessSlug: string, insight: string, supportingData?: unknown): Promise<void> {
  const { error } = await db().from("learnings").insert({ business_slug: businessSlug, insight, supporting_data: supportingData ?? null });
  if (error) throw error;
}

export interface PerformingPostSummary {
  postId: string;
  platform: Platform;
  content: string;
  totalEngagement: number;
}

/** Feeds the Strategist agent's feedback loop: "here's what actually worked, plan more like it." */
export async function getTopPerformingPosts(businessSlug: string, limit = 15): Promise<PerformingPostSummary[]> {
  const { data, error } = await db()
    .from("analytics_snapshots")
    .select("post_id, likes, comments, shares, clicks, posts!inner(id, business_slug, content, platform)")
    .eq("posts.business_slug", businessSlug);
  if (error) throw error;
  const byPost = new Map<string, PerformingPostSummary>();
  for (const row of (data ?? []) as any[]) {
    const total = row.likes + row.comments * 2 + row.shares * 3 + row.clicks * 2;
    const existing = byPost.get(row.post_id as string);
    if (!existing || existing.totalEngagement < total) {
      byPost.set(row.post_id as string, {
        postId: row.post_id,
        platform: row.posts.platform,
        content: row.posts.content,
        totalEngagement: total,
      });
    }
  }
  return [...byPost.values()].sort((a, b) => b.totalEngagement - a.totalEngagement).slice(0, limit);
}
