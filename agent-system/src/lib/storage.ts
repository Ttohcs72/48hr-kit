import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const BUCKET = "post-media";

let client: ReturnType<typeof createClient<any>> | undefined;
function storage() {
  if (!client) client = createClient<any>(config.supabaseUrl(), config.supabaseServiceRoleKey());
  return client;
}

/**
 * Uploads a generated image to a public Supabase Storage bucket and
 * returns its public URL. Platform APIs (Instagram, Pinterest) need a
 * stable, publicly-fetchable URL to pull the image from - they can't
 * accept raw bytes or a signed URL that might expire before they fetch it.
 *
 * One-time setup this depends on: create a PUBLIC bucket named
 * "post-media" in the Supabase dashboard (Storage -> New bucket -> toggle
 * Public). Not done automatically here because bucket creation isn't part
 * of schema.sql's plain-SQL migration.
 */
export async function uploadPublicImage(buffer: Buffer, filename: string): Promise<string> {
  const path = `${Date.now()}-${filename}`;
  const { error } = await storage().storage.from(BUCKET).upload(path, buffer, { contentType: "image/png", upsert: false });
  if (error) throw new Error(`Failed to upload image to Supabase Storage bucket "${BUCKET}": ${error.message}. Has the bucket been created and set to public?`);
  const { data } = storage().storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
