import * as cheerio from "cheerio";
import { logger } from "./logger.js";

/** Fetches a page and strips it down to the text Claude actually needs — no
 *  script tags, no CSS, no boilerplate attributes — to keep the prompt small. */
export async function fetchCleanPageText(url: string): Promise<string> {
  logger.info("Fetching business website", { url });
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketingAgentBot/1.0)" } });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();

  const title = $("title").text().trim();
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() ?? "";
  const ogDescription = $('meta[property="og:description"]').attr("content")?.trim() ?? "";
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();

  return [`PAGE TITLE: ${title}`, `META DESCRIPTION: ${metaDescription || ogDescription}`, `BODY TEXT:\n${bodyText}`].join("\n\n").slice(0, 15000);
}
