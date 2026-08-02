import { analyzeBusinessWebsite } from "../agents/businessAnalyzerAgent.js";
import { upsertBusinessProfile } from "../db/client.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";

/**
 * Entry point #1: point this at any business's website and it produces the
 * structured BusinessProfile every other agent grounds itself in. Run this
 * once when onboarding a new business, and re-run it periodically (monthly
 * is plenty) to pick up site changes - new offers, updated pricing, a new
 * testimonial. It's cheap: one page fetch, one Claude call.
 */
async function main() {
  const slug = config.businessSlug();
  const url = config.businessWebsiteUrl();
  logger.info("Analyzing business website", { slug, url });

  const profile = await analyzeBusinessWebsite(slug, url);
  await upsertBusinessProfile(profile);

  logger.info("Business profile saved", {
    slug,
    name: profile.name,
    offers: profile.offers.length,
    realClaims: profile.realClaims.length,
  });
}

main().catch((err) => {
  logger.error("Business analysis failed", { error: String(err) });
  process.exit(1);
});
