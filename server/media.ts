import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";

interface ProbeResult {
  durationSec: number;
  width: number | null;
  height: number | null;
}

export function probe(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const stream = data.streams.find((s) => s.codec_type === "video") ?? data.streams[0];
      const duration = Number(data.format?.duration ?? stream?.duration ?? 0);
      resolve({
        durationSec: Number.isFinite(duration) ? Math.floor(duration) : 0,
        width: stream?.width ?? null,
        height: stream?.height ?? null,
      });
    });
  });
}

interface ThumbArgs {
  inputPath: string;
  outDir: string;
  baseName: string;
  durationSec: number;
}

export function generateThumbnail({
  inputPath,
  outDir,
  baseName,
  durationSec,
}: ThumbArgs): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(outDir, { recursive: true });
    const filename = `${baseName}.jpg`;
    // Pick a frame ~30% in (or 1s in for very short clips) to skip black intro frames.
    const ts = durationSec > 5 ? Math.max(1, Math.floor(durationSec * 0.3)) : Math.min(1, durationSec || 0);

    ffmpeg(inputPath)
      .screenshots({
        timestamps: [ts.toString()],
        filename,
        folder: outDir,
        size: "640x?",
      })
      .on("end", () => resolve(path.join(outDir, filename)))
      .on("error", (err) => reject(err));
  });
}
