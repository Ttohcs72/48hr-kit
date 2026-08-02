import "dotenv/config";

/**
 * Every other file reads secrets through this module instead of
 * `process.env` directly, so a missing key fails fast with a clear message
 * at startup instead of as a cryptic error deep inside an API call.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env (locally) or add it as a GitHub Actions secret.`
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const config = {
  anthropicApiKey: () => required("ANTHROPIC_API_KEY"),

  supabaseUrl: () => required("SUPABASE_URL"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),

  businessWebsiteUrl: () => required("BUSINESS_WEBSITE_URL"),
  businessSlug: () => required("BUSINESS_SLUG"),

  autoPublishEnabled: () => optional("AUTO_PUBLISH_ENABLED") === "true",
  autoPublishMinScore: () => Number(optional("AUTO_PUBLISH_MIN_SCORE") ?? 90),

  // Comma-separated subset of x,linkedin,facebook,instagram,tiktok,pinterest.
  // Defaults to all six - trim this down to only the platforms you actually
  // have API credentials for, so the calendar doesn't plan content for
  // platforms that can only ever dry-run.
  activePlatforms: () =>
    (optional("ACTIVE_PLATFORMS")?.split(",").map((p) => p.trim()).filter(Boolean) ?? [
      "x",
      "linkedin",
      "facebook",
      "instagram",
      "tiktok",
      "pinterest",
    ]) as import("../types.js").Platform[],

  contentCalendarDays: () => Number(optional("CONTENT_CALENDAR_DAYS") ?? 7),
  postsPerPlatformPerDay: () => Number(optional("POSTS_PER_PLATFORM_PER_DAY") ?? 2),

  x: {
    apiKey: () => optional("X_API_KEY"),
    apiSecret: () => optional("X_API_SECRET"),
    accessToken: () => optional("X_ACCESS_TOKEN"),
    accessSecret: () => optional("X_ACCESS_SECRET"),
  },
  linkedin: {
    accessToken: () => optional("LINKEDIN_ACCESS_TOKEN"),
    organizationUrn: () => optional("LINKEDIN_ORGANIZATION_URN"),
  },
  meta: {
    pageAccessToken: () => optional("META_PAGE_ACCESS_TOKEN"),
    pageId: () => optional("META_PAGE_ID"),
    igBusinessAccountId: () => optional("META_INSTAGRAM_BUSINESS_ACCOUNT_ID"),
  },
  tiktok: {
    accessToken: () => optional("TIKTOK_ACCESS_TOKEN"),
    openId: () => optional("TIKTOK_OPEN_ID"),
  },
  pinterest: {
    accessToken: () => optional("PINTEREST_ACCESS_TOKEN"),
    boardId: () => optional("PINTEREST_BOARD_ID"),
  },
};

/** True once real credentials exist for a platform; otherwise connectors run in dry-run/log-only mode. */
export function isPlatformConfigured(platform: string): boolean {
  switch (platform) {
    case "x":
      return Boolean(config.x.apiKey() && config.x.apiSecret() && config.x.accessToken() && config.x.accessSecret());
    case "linkedin":
      return Boolean(config.linkedin.accessToken() && config.linkedin.organizationUrn());
    case "facebook":
      return Boolean(config.meta.pageAccessToken() && config.meta.pageId());
    case "instagram":
      return Boolean(config.meta.pageAccessToken() && config.meta.igBusinessAccountId());
    case "tiktok":
      return Boolean(config.tiktok.accessToken() && config.tiktok.openId());
    case "pinterest":
      return Boolean(config.pinterest.accessToken() && config.pinterest.boardId());
    default:
      return false;
  }
}
