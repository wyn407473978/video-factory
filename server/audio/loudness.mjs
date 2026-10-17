import { spawn } from "node:child_process";

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      const error = new Error(`FFmpeg 响度处理失败（退出码 ${code}）`);
      error.details = stderr.slice(-4000);
      reject(error);
    });
  });
}

export function parseLoudnessAnalysis(output) {
  const content = String(output);
  const inputIndex = content.lastIndexOf('"input_i"');
  if (inputIndex < 0) throw new Error("无法读取旁白响度分析结果");
  const start = content.lastIndexOf("{", inputIndex);
  const end = content.indexOf("}", inputIndex);
  if (start < 0 || end < 0) throw new Error("无法读取旁白响度分析结果");
  const payload = JSON.parse(content.slice(start, end + 1));
  const required = ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"];
  if (required.some((key) => !Number.isFinite(Number(payload[key])))) {
    throw new Error("旁白响度分析结果不完整");
  }
  return payload;
}

export async function normalizeAudioLoudness({
  inputPath,
  outputPath,
  targetIntegrated = -16,
  targetTruePeak = -1.5,
  targetRange = 11
}) {
  const target = `I=${targetIntegrated}:TP=${targetTruePeak}:LRA=${targetRange}`;
  const analysis = await runFfmpeg([
    "-hide_banner",
    "-i",
    inputPath,
    "-af",
    `loudnorm=${target}:print_format=json`,
    "-f",
    "null",
    "-"
  ]).then(({ stderr }) => parseLoudnessAnalysis(stderr));

  const measured = [
    `measured_I=${analysis.input_i}`,
    `measured_TP=${analysis.input_tp}`,
    `measured_LRA=${analysis.input_lra}`,
    `measured_thresh=${analysis.input_thresh}`,
    `offset=${analysis.target_offset}`,
    "linear=true",
    "print_format=summary"
  ].join(":");

  await runFfmpeg([
    "-y",
    "-hide_banner",
    "-i",
    inputPath,
    "-af",
    `loudnorm=${target}:${measured}`,
    "-ar",
    "32000",
    "-ac",
    "1",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "192k",
    outputPath
  ]);

  return {
    inputIntegrated: Number(analysis.input_i),
    inputTruePeak: Number(analysis.input_tp),
    targetIntegrated,
    targetTruePeak,
    targetRange
  };
}
