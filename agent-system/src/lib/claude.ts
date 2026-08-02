import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { logger } from "./logger.js";

/**
 * Every agent in this system (Business Analyzer, Strategist, the platform
 * copywriters, Brand Guardian) is just a different system prompt fired
 * through this one wrapper. Centralizing it here means retries, the model
 * choice, and JSON-parsing all live in one place instead of six.
 */
let client: Anthropic | undefined;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey() });
  return client;
}

// Claude Sonnet 5: strong enough for brand judgment, cheap enough to run
// many times a day across a whole content calendar.
const MODEL = "claude-sonnet-5";

export interface AskOptions {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export async function askClaude({ system, prompt, maxTokens = 2000, temperature = 0.7 }: AskOptions): Promise<string> {
  const anthropic = getClient();
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: "user", content: prompt }],
      });
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") throw new Error("Claude returned no text content");
      return textBlock.text;
    } catch (err) {
      lastError = err;
      logger.warn("Claude call failed, retrying", { attempt, error: String(err) });
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  throw lastError;
}

/**
 * Asks Claude for strict JSON and parses it. Agents downstream (DB writes,
 * platform APIs) need structured data, not prose, so every "creative" agent
 * in this system is instructed to answer only in JSON and this helper
 * enforces that with one retry-with-correction if parsing fails.
 */
export async function askClaudeForJson<T>(options: AskOptions): Promise<T> {
  const jsonInstruction =
    "\n\nRespond with ONLY valid JSON. No markdown code fences, no commentary before or after.";
  const raw = await askClaude({ ...options, prompt: options.prompt + jsonInstruction });
  try {
    return JSON.parse(stripCodeFences(raw)) as T;
  } catch {
    logger.warn("Claude JSON parse failed, asking it to correct itself");
    const corrected = await askClaude({
      system: options.system,
      prompt: `You previously replied with invalid JSON:\n\n${raw}\n\nReturn ONLY the corrected, valid JSON object. No commentary.`,
      maxTokens: options.maxTokens,
      temperature: 0,
    });
    return JSON.parse(stripCodeFences(corrected)) as T;
  }
}

export function parseJsonResponse<T>(raw: string): T {
  return JSON.parse(stripCodeFences(raw)) as T;
}

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
}

/**
 * Same as askClaude, but grants Claude's hosted web_search tool so it can
 * ground its answer in what's actually trending right now instead of
 * whatever it last saw in training. This is what the Trend Research agent
 * uses. Anthropic executes the search server-side and hands back a normal
 * text response, so no manual tool-loop is needed here.
 *
 * Not every Anthropic account/plan has web_search enabled. If the call
 * fails for that reason, callers should catch it and fall back to
 * askClaude() using the model's own knowledge instead of hard-failing the
 * whole pipeline over a trends lookup.
 */
export async function askClaudeWithWebSearch({ system, prompt, maxTokens = 2000 }: AskOptions): Promise<string> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 } as any],
  });
  const textBlocks = response.content.filter((b) => b.type === "text") as Array<{ type: "text"; text: string }>;
  if (textBlocks.length === 0) throw new Error("Claude web-search call returned no text content");
  return textBlocks.map((b) => b.text).join("\n");
}
