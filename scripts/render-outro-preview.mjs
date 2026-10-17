import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { createCaptionFrames } from "../server/video/caption-frames.mjs";
import { buildVideoFilterParts } from "../server/video/render-video.mjs";
import { ensureOutroFrame, OUTRO_DURATION_SECONDS } from "../server/video/outro-frame.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const previewDirectory = path.join(projectRoot, "tmp", "outro-preview");
const outputPath = path.join(projectRoot, "exports", "星格品牌片尾预览.mp4");
const mainDuration = 1.8;
await mkdir(previewDirectory, { recursive: true });

const frames = await createCaptionFrames({
  directory: previewDirectory,
  title: "正文结束",
  tag: "OUTRO PREVIEW",
  fontStyle: "editorial",
  scenes: [{
    text: "每条视频自动接入品牌片尾",
    start: 0,
    end: mainDuration,
    duration: mainDuration,
    role: "interaction",
    typography: {
      displayLines: ["每条视频自动接入品牌片尾"],
      emphasis: ["品牌片尾"],
      layout: "interaction",
      alignment: "center",
      size: "large",
      effect: "float",
      accentStyle: "gradient",
      transition: "none",
      revealOrder: [0]
    }
  }]
});
const outroFramePath = await ensureOutroFrame({ projectRoot });
const outroInputIndex = 2 + frames.length;
const inputs = [
  "-y", "-hide_banner",
  "-loop", "1", "-framerate", "30", "-i", path.join(projectRoot, "public", "assets", "xingge-avatar.png"),
  "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"
];
for (const frame of frames) inputs.push("-loop", "1", "-framerate", "30", "-i", frame.filePath);
inputs.push("-loop", "1", "-framerate", "30", "-i", outroFramePath);

const filters = buildVideoFilterParts(frames, {
  outroInputIndex,
  mainDuration,
  outroDuration: OUTRO_DURATION_SECONDS
});
const totalDuration = mainDuration + OUTRO_DURATION_SECONDS;
const args = [
  ...inputs,
  "-filter_threads", "4",
  "-filter_complex_threads", "4",
  "-filter_complex", filters.join(";"),
  "-map", "[video]", "-map", "[audio]",
  "-t", totalDuration.toFixed(3), "-r", "30",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
  "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart",
  outputPath
];

await new Promise((resolve, reject) => {
  const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-6000); });
  child.on("error", reject);
  child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr)));
});

console.log(outputPath);
