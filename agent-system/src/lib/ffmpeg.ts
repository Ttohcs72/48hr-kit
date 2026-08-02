import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Joins multiple independently-generated MP4 clips into one file. Used to
 * turn two ~8-second Veo clips into one ~16-second video, since Veo has no
 * "generate exactly 15 seconds" option (see videoGen.ts). Uses ffmpeg's
 * concat *filter* (not the faster concat demuxer) because it re-encodes,
 * which tolerates the clips having slightly different codec parameters -
 * the demuxer's `-c copy` path requires byte-identical codec settings and
 * fails silently or errors otherwise.
 *
 * Requires the `ffmpeg` binary on PATH. It's preinstalled on GitHub
 * Actions' ubuntu-latest runners; for local runs, install it with your
 * package manager (e.g. `brew install ffmpeg` / `apt install ffmpeg`).
 */
export async function concatMp4Clips(clips: Buffer[]): Promise<Buffer> {
  if (clips.length === 0) throw new Error("concatMp4Clips called with no clips");
  if (clips.length === 1) return clips[0];

  const dir = await mkdtemp(join(tmpdir(), "video-stitch-"));
  try {
    const inputArgs: string[] = [];
    const filterInputs: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const path = join(dir, `clip${i}.mp4`);
      await writeFile(path, clips[i]);
      inputArgs.push("-i", path);
      filterInputs.push(`[${i}:v][${i}:a]`);
    }
    const outputPath = join(dir, "output.mp4");
    const filter = `${filterInputs.join("")}concat=n=${clips.length}:v=1:a=1[outv][outa]`;

    try {
      await execFileAsync("ffmpeg", [...inputArgs, "-filter_complex", filter, "-map", "[outv]", "-map", "[outa]", "-y", outputPath]);
    } catch (err) {
      throw new Error(`ffmpeg concat failed - is ffmpeg installed and on PATH? Original error: ${String(err)}`);
    }
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
