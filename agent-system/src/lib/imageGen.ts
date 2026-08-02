import { config } from "./config.js";

/**
 * Thin wrapper around OpenAI's Images API. Kept separate from claude.ts
 * because it's a different vendor for a different job — Claude writes and
 * judges text, this generates the actual pixels for Instagram/Pinterest
 * posts. Swap this file alone if you'd rather use a different image model.
 */
export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";

export async function generateImagePng(prompt: string, size: ImageSize = "1024x1024"): Promise<Buffer> {
  const apiKey = config.openaiApiKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY not set - the visual content agent needs it to generate images.");

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size,
      quality: "medium",
      n: 1,
    }),
  });
  const body: any = await res.json();
  if (!res.ok) throw new Error(`Image generation failed: ${JSON.stringify(body)}`);
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error(`Image generation returned no image data: ${JSON.stringify(body)}`);
  return Buffer.from(b64, "base64");
}
