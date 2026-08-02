import { config } from "./config.js";
import { logger } from "./logger.js";

/**
 * Thin wrapper around Google's Veo video model via the Gemini API. Chosen
 * over OpenAI's Sora because Sora's Videos API is being shut down
 * (deprecated March 2026, all endpoints stop accepting requests
 * 2026-09-24, no successor announced as of this writing) - a bad
 * foundation for something meant to run unattended indefinitely.
 *
 * Two things worth knowing before you flip this on:
 * 1. Veo generation is a paid/billed Gemini API feature, not available on
 *    the free tier - check current requirements at ai.google.dev before
 *    assuming a free key will work.
 * 2. This is a long-running operation: expect 45-90+ seconds per 8-second
 *    clip, sometimes more. This module polls rather than assuming a fixed
 *    wait, but that means a full run can take several minutes.
 */
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "veo-3.1-generate-preview"; // check ai.google.dev/gemini-api/docs/veo for the current model id if this 404s - preview ids get promoted/renamed over time

// Veo's fixed per-call clip length as of this writing - there is no reliable
// "give me exactly N seconds" parameter across versions, so callers stitch
// multiple clips instead of asking for one long one.
export const CLIP_SECONDS = 8;

interface VeoOperation {
  name: string;
  done?: boolean;
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{ video?: { uri?: string } }>;
    };
  };
  error?: { message: string };
}

/** Generates one ~8-second clip and returns the raw MP4 bytes. */
export async function generateVeoClip(prompt: string, aspectRatio: "9:16" | "16:9" = "9:16"): Promise<Buffer> {
  const apiKey = config.geminiApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY not set - the video content agent needs it to generate video with Veo.");

  const startRes = await fetch(`${API_BASE}/models/${MODEL}:generateVideos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ prompt, config: { aspectRatio } }),
  });
  const startBody: any = await startRes.json();
  if (!startRes.ok) throw new Error(`Veo video generation failed to start: ${JSON.stringify(startBody)}`);

  const operationName: string | undefined = startBody.name;
  if (!operationName) throw new Error(`Veo did not return an operation name: ${JSON.stringify(startBody)}`);

  const operation = await pollUntilDone(operationName, apiKey);
  if (operation.error) throw new Error(`Veo generation failed: ${operation.error.message}`);

  const videoUri = operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!videoUri) throw new Error(`Veo operation completed but returned no video URI: ${JSON.stringify(operation)}`);

  const separator = videoUri.includes("?") ? "&" : "?";
  const fileRes = await fetch(`${videoUri}${separator}key=${apiKey}`);
  if (!fileRes.ok) throw new Error(`Failed to download generated video: ${fileRes.status} ${await fileRes.text()}`);
  return Buffer.from(await fileRes.arrayBuffer());
}

async function pollUntilDone(operationName: string, apiKey: string): Promise<VeoOperation> {
  const pollIntervalMs = 10_000;
  const maxAttempts = 60; // ~10 minutes ceiling per clip

  let operation: VeoOperation = { name: operationName, done: false };
  for (let attempt = 0; !operation.done && attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const res = await fetch(`${API_BASE}/${operationName}`, { headers: { "x-goog-api-key": apiKey } });
    operation = (await res.json()) as VeoOperation;
    logger.info("Polling Veo operation", { operationName, done: operation.done, attempt });
  }
  if (!operation.done) throw new Error(`Veo generation for operation ${operationName} did not finish within the poll window.`);
  return operation;
}
