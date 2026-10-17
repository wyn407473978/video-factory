import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { createCaptionFrames } from "../server/video/caption-frames.mjs";
import { buildVideoFilterParts } from "../server/video/render-video.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const demoDirectory = path.join(projectRoot, "tmp", "transition-demo");
const outputPath = path.join(projectRoot, "exports", "页面转场修复效果演示.mp4");
const backgroundPath = path.join(projectRoot, "public", "assets", "xingge-avatar.png");
const scenes = [
  {
    text: "镜头推近更自然",
    start: 0,
    end: 2.2,
    duration: 2.2,
    role: "hook",
    typography: {
      displayLines: ["镜头推近更自然"],
      emphasis: ["推近"],
      layout: "hook",
      alignment: "center",
      size: "hero",
      effect: "rise",
      accentStyle: "gradient",
      transition: "zoom",
      revealOrder: [0]
    }
  },
  {
    text: "页面推进更有节奏",
    start: 2.2,
    end: 4.4,
    duration: 2.2,
    role: "analysis",
    typography: {
      displayLines: ["页面推进更有节奏"],
      emphasis: ["推进"],
      layout: "analysis",
      alignment: "center",
      size: "hero",
      effect: "slide",
      accentStyle: "underline",
      transition: "push",
      revealOrder: [0]
    }
  },
  {
    text: "自然切换干净利落",
    start: 4.4,
    end: 6.6,
    duration: 2.2,
    role: "analysis",
    typography: {
      displayLines: ["自然切换干净利落"],
      emphasis: ["自然切换"],
      layout: "analysis",
      alignment: "center",
      size: "hero",
      effect: "float",
      accentStyle: "underline",
      transition: "none",
      revealOrder: [0]
    }
  }
];

await mkdir(demoDirectory, { recursive: true });
await mkdir(path.dirname(outputPath), { recursive: true });
const captionFrames = await createCaptionFrames({
  directory: demoDirectory,
  title: "页面切换效果修复",
  tag: "TRANSITION FIX",
  fontStyle: "editorial",
  scenes,
  concurrency: 3
});

const args = [
  "-y",
  "-hide_banner",
  "-loop", "1",
  "-framerate", "30",
  "-i", backgroundPath,
  "-f", "lavfi",
  "-i", "anullsrc=r=44100:cl=stereo"
];
for (const frame of captionFrames) {
  args.push("-loop", "1", "-framerate", "30", "-i", frame.filePath);
}
args.push(
  "-filter_complex", buildVideoFilterParts(captionFrames).join(";"),
  "-map", "[video]",
  "-map", "1:a:0",
  "-t", "6.6",
  "-r", "30",
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-crf", "20",
  "-pix_fmt", "yuv420p",
  "-c:a", "aac",
  "-b:a", "96k",
  "-movflags", "+faststart",
  outputPath
);

await new Promise((resolve, reject) => {
  const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-6000); });
  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) resolve();
    else reject(new Error(stderr));
  });
});

console.log(outputPath);
