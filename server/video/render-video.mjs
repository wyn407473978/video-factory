import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { availableParallelism, cpus } from "node:os";
import path from "node:path";
import {
  allocateSceneTimings,
  sanitizeFilename,
  speechRateForPace,
  splitScript
} from "./script-utils.mjs";
import { createCaptionFrames } from "./caption-frames.mjs";
import {
  generateMiniMaxSpeech,
  hasMiniMaxApiKey,
  normalizeMiniMaxEmotion,
  normalizeMiniMaxVoiceId
} from "../audio/minimax.mjs";
import { normalizeAudioLoudness } from "../audio/loudness.mjs";
import { ensureOutroFrame, OUTRO_DURATION_SECONDS } from "./outro-frame.mjs";
import {
  createUnifiedSpeechSegment,
  planEmotionCurve
} from "../../shared/emotion-director.mjs";
import {
  hasDeepSeekApiKey,
  requestDeepSeekStoryboard,
  validateStoryboard
} from "../ai/deepseek-storyboard.mjs";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      options.onStderr?.(chunk.toString());
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      const error = new Error(`${command} 执行失败（退出码 ${code}）`);
      error.details = stderr.slice(-5000);
      reject(error);
    });
  });
}

async function mediaDuration(filePath) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath
  ]);
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("无法读取配音时长");
  }
  return duration;
}

function parseFfmpegProgress(line, duration, onProgress) {
  const matches = [...line.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/gu)];
  const match = matches.at(-1);
  if (!match) return;
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  const ratio = Math.max(0, Math.min(1, seconds / duration));
  onProgress?.({ progress: Math.round(48 + ratio * 48), stage: "正在多线程渲染视频" });
}

function clampInteger(value, minimum, maximum, fallback) {
  const number = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

export function resolveRenderConcurrency(options = {}) {
  const detectedCores = typeof availableParallelism === "function"
    ? availableParallelism()
    : cpus().length;
  const cores = clampInteger(options.cores, 1, 64, detectedCores || 4);
  const ffmpegThreads = clampInteger(
    options.ffmpegThreads ?? process.env.VIDEO_RENDER_THREADS,
    1,
    16,
    Math.max(2, Math.min(12, cores))
  );
  const filterThreads = clampInteger(
    options.filterThreads ?? process.env.VIDEO_FILTER_THREADS,
    1,
    12,
    Math.max(2, Math.min(8, Math.ceil(cores / 2)))
  );
  const captionConcurrency = clampInteger(
    options.captionConcurrency ?? process.env.CAPTION_RENDER_CONCURRENCY,
    1,
    8,
    Math.max(2, Math.min(6, Math.ceil(cores / 3)))
  );
  return { cores, ffmpegThreads, filterThreads, captionConcurrency };
}

function overlayMotion(frame, visualStart = Number(frame.start)) {
  const start = Number(visualStart).toFixed(3);
  const entranceDuration = Math.min(0.62, Math.max(0.34, Number(frame.fadeDuration || 0.22) * 2.25));
  const endOfEntrance = (Number(visualStart) + entranceDuration).toFixed(3);
  const progress = `(t-${start})/${entranceDuration.toFixed(3)}`;
  const settle = (offset) => `if(lt(t\\,${endOfEntrance})\\,${offset}*(1-${progress})\\,0)`;
  const transition = frame.name === "reveal" ? null : frame.transition;
  const effect = frame.effect || "rise";

  if (transition === "push") return { x: settle(320), y: "0", entranceDuration };
  if (transition === "zoom") {
    return {
      x: "(W-w)/2",
      y: "(H-h)/2",
      entranceDuration,
      zoom: {
        start: Number(visualStart),
        duration: entranceDuration,
        from: 1.105
      }
    };
  }
  if (effect === "slide") return { x: settle(48), y: "0", entranceDuration };
  if (effect === "punch") {
    return {
      x: `if(lt(t\\,${endOfEntrance})\\,12*sin((t-${start})*34)*(1-${progress})\\,0)`,
      y: settle(18),
      entranceDuration
    };
  }
  if (effect === "float") {
    return {
      x: "0",
      y: `if(lt(t\\,${endOfEntrance})\\,${settle(24)}\\,4+3*sin((t-${start})*2.2))`,
      entranceDuration
    };
  }
  if (effect === "typewriter") return { x: settle(28), y: "0", entranceDuration: entranceDuration * 1.2 };
  return { x: "0", y: settle(30), entranceDuration };
}

export function buildVideoFilterParts(captionFrames, options = {}) {
  const filterParts = [
    "[0:v]scale=2000:2000,crop=1080:1920:x='(iw-ow)/2+34*sin(t*0.18)':y='(ih-oh)/2+24*cos(t*0.14)',gblur=sigma=14,eq=brightness=-0.34:saturation=0.72,drawbox=x=0:y=0:w=iw:h=ih:color=0x070912@0.22:t=fill,format=rgba[base]"
  ];
  let previous = "base";

  captionFrames.forEach((frame, index) => {
    const overlay = `overlay${index}`;
    const output = `video${index}`;
    const naturalCut = frame.name !== "reveal" && !["push", "zoom"].includes(frame.transition);
    const visualStart = frame.name === "reveal"
      ? Number(frame.start)
      : naturalCut ? Number(frame.start) : Math.max(0, Number(frame.start) - 0.18);
    const motion = overlayMotion(frame, visualStart);
    const fadeInDuration = naturalCut
      ? Math.min(0.1, Math.max(0.06, frame.end - visualStart))
      : Math.min(motion.entranceDuration, Math.max(0.12, frame.end - visualStart));
    const fadeOutDuration = naturalCut
      ? Math.min(0.08, Math.max(0.05, frame.fadeDuration || 0.08))
      : Math.min(0.28, Math.max(0.12, frame.fadeDuration || 0.18));
    const fadeOutStart = Math.max(frame.start, frame.end - fadeOutDuration);
    filterParts.push(
      `[${index + 2}:v]format=rgba,split=2[rgba${index}][alphaSource${index}]`
    );
    filterParts.push(`[rgba${index}]format=rgb24[rgb${index}]`);
    filterParts.push(
      `[alphaSource${index}]alphaextract,fade=t=in:st=${visualStart.toFixed(3)}:d=${fadeInDuration.toFixed(3)},fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOutDuration.toFixed(3)}[alpha${index}]`
    );
    filterParts.push(`[rgb${index}][alpha${index}]alphamerge[${overlay}]`);
    let preparedOverlay = overlay;
    if (motion.zoom) {
      const zoomEnd = motion.zoom.start + motion.zoom.duration;
      const scale = `if(lt(t\\,${zoomEnd.toFixed(3)})\\,${motion.zoom.from.toFixed(3)}-0.105*((t-${motion.zoom.start.toFixed(3)})/${motion.zoom.duration.toFixed(3)})\\,1)`;
      preparedOverlay = `zoom${index}`;
      filterParts.push(
        `[${overlay}]scale=w='trunc(iw*(${scale})/2)*2':h='trunc(ih*(${scale})/2)*2':eval=frame[${preparedOverlay}]`
      );
    }
    filterParts.push(
      `[${previous}][${preparedOverlay}]overlay=x='${motion.x}':y='${motion.y}':enable=between(t\\,${visualStart.toFixed(3)}\\,${frame.end.toFixed(3)})[${output}]`
    );
    previous = output;
  });

  const outroInputIndex = Number(options.outroInputIndex);
  const mainDuration = Number(options.mainDuration);
  const outroDuration = Number(options.outroDuration || OUTRO_DURATION_SECONDS);
  const hasOutro = Number.isInteger(outroInputIndex)
    && outroInputIndex >= 2
    && Number.isFinite(mainDuration)
    && mainDuration > 0
    && Number.isFinite(outroDuration)
    && outroDuration > 0;

  if (hasOutro) {
    const totalDuration = mainDuration + outroDuration;
    const fadeOutStart = mainDuration + Math.max(0, outroDuration - 0.38);
    filterParts.push(
      `[${outroInputIndex}:v]scale=1188:2112,crop=1080:1920:x='(iw-ow)/2+16*sin((t-${mainDuration.toFixed(3)})*0.7)':y='(ih-oh)/2+10*cos((t-${mainDuration.toFixed(3)})*0.55)',format=rgba,fade=t=in:st=${mainDuration.toFixed(3)}:d=0.28:alpha=1,fade=t=out:st=${fadeOutStart.toFixed(3)}:d=0.38:alpha=1[outroVideo]`
    );
    filterParts.push(
      `[${previous}][outroVideo]overlay=x=0:y=0:enable=between(t\\,${mainDuration.toFixed(3)}\\,${totalDuration.toFixed(3)}),trim=duration=${totalDuration.toFixed(3)},setpts=PTS-STARTPTS,format=yuv420p[video]`
    );
    filterParts.push(
      `[1:a]apad=pad_dur=${outroDuration.toFixed(3)},atrim=duration=${totalDuration.toFixed(3)},asetpts=PTS-STARTPTS[audio]`
    );
  } else {
    filterParts.push(`[${previous}]format=yuv420p[video]`);
  }
  return filterParts;
}

export function timedScenesForSpeechSegment(segment, subtitles, audioDuration, timelineOffset) {
  let inferredWordCursor = 0;
  const words = subtitles
    .flatMap((subtitle) => subtitle?.timestamped_words || [])
    .map((word) => {
      const text = String(word?.word || word?.text || "");
      const explicitBegin = Number(word?.word_begin);
      const explicitEnd = Number(word?.word_end);
      const charStart = Number.isFinite(explicitBegin) ? explicitBegin : inferredWordCursor;
      const charEnd = Number.isFinite(explicitEnd)
        ? explicitEnd
        : charStart + text.length;
      inferredWordCursor = Math.max(inferredWordCursor, charEnd);
      return {
        text,
        charStart,
        charEnd,
        start: Number(word?.time_begin) / 1000,
        end: Number(word?.time_end) / 1000
      };
    })
    .filter((word) => Number.isFinite(word.start) && Number.isFinite(word.end));
  const fallback = allocateSceneTimings(segment.scenes.map((scene) => scene.text), audioDuration);
  const localStarts = segment.scenes.map((scene, index) => {
    if (index === 0) return 0;
    const word = words.find((item) => item.charEnd > scene.textBegin);
    const wordStart = word?.start;
    return Number.isFinite(wordStart) ? wordStart : fallback[index].start;
  });

  return segment.scenes.map((scene, index) => {
    const start = timelineOffset + localStarts[index];
    const end = index < segment.scenes.length - 1
      ? timelineOffset + localStarts[index + 1]
      : timelineOffset + audioDuration + segment.pauseAfter;
    return {
      id: `scene-${scene.sceneIndex + 1}`,
      index: scene.sceneIndex,
      text: scene.text,
      role: scene.role,
      roleLabel: scene.roleLabel,
      deliveryGroup: scene.deliveryGroup,
      emotion: scene.emotion,
      typography: scene.typography || null,
      wordTimings: words
        .filter((word) => word.charEnd > scene.textBegin && word.charStart < scene.textEnd)
        .map((word) => ({
          text: word.text,
          charStart: Math.max(0, word.charStart - scene.textBegin),
          charEnd: Math.min(scene.text.length, word.charEnd - scene.textBegin),
          start: Number((timelineOffset + word.start).toFixed(3)),
          end: Number((timelineOffset + word.end).toFixed(3))
        })),
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      duration: Number((end - start).toFixed(3))
    };
  });
}

async function createStoryboard({ title, tag, script, providedStoryboard }) {
  if (providedStoryboard?.scenes) {
    try {
      return validateStoryboard(providedStoryboard, script, {
        provider: "deepseek-provided",
        model: providedStoryboard.model || "deepseek-flash"
      });
    } catch {
      // If the copy changed after planning, request a fresh storyboard below.
    }
  }

  if (hasDeepSeekApiKey()) {
    try {
      return await requestDeepSeekStoryboard({ title, tag, script });
    } catch (error) {
      console.warn(`DeepSeek 分镜不可用，已使用规则兜底：${error.message}`);
      const fallbackScenes = splitScript(script);
      return {
        provider: "rules-fallback",
        model: null,
        fallbackReason: error.message,
        scenes: planEmotionCurve(fallbackScenes)
      };
    }
  }

  const fallbackScenes = splitScript(script);
  return {
    provider: "rules-fallback",
    model: null,
    fallbackReason: "未配置 DEEPSEEK_API_KEY",
    scenes: planEmotionCurve(fallbackScenes)
  };
}

function sameSceneText(previousScenes, nextScenes) {
  return Array.isArray(previousScenes)
    && previousScenes.length === nextScenes.length
    && previousScenes.every((scene, index) => String(scene?.text || "") === nextScenes[index].text);
}

export function canReuseNarration(previous, current) {
  return previous?.script === current.script
    && Number(previous?.pace) === Number(current.pace)
    && previous?.speechProvider === current.speechProvider
    && previous?.voiceId === current.voiceId
    && (previous?.emotion ?? null) === (current.emotion ?? null)
    && sameSceneText(previous?.scenes, current.scenes);
}

async function loadReusableNarration({
  projectRoot,
  sourceJobId,
  narrationPath,
  current,
  emotionPlan
}) {
  const safeJobId = String(sourceJobId || "").trim();
  if (!/^[a-zA-Z0-9_-]{8,80}$/u.test(safeJobId)) return null;

  const sourceDirectory = path.join(projectRoot, "data", "jobs", safeJobId);
  const sourceAudioPath = path.join(sourceDirectory, "narration.mp3");
  let previous;
  try {
    previous = JSON.parse(await readFile(path.join(sourceDirectory, "render-input.json"), "utf8"));
    await access(sourceAudioPath);
  } catch {
    return null;
  }
  if (!canReuseNarration(previous, current)) return null;

  await copyFile(sourceAudioPath, narrationPath);
  return {
    duration: Number(previous.duration),
    loudnessNormalization: previous.loudnessNormalization || null,
    speechMetadata: {
      model: previous.speechModel || null,
      strategy: previous.speechStrategy || null,
      identityLocked: Boolean(previous.voiceIdentityLocked),
      segments: previous.speechSegments || []
    },
    scenes: previous.scenes.map((scene, index) => ({
      ...scene,
      role: emotionPlan[index].role,
      roleLabel: emotionPlan[index].roleLabel,
      deliveryGroup: emotionPlan[index].deliveryGroup,
      emotion: emotionPlan[index].emotion,
      typography: emotionPlan[index].typography || null
    }))
  };
}

export async function verifyLocalTools() {
  const checks = await Promise.allSettled([
    run("ffmpeg", ["-version"]),
    run("ffprobe", ["-version"]),
    access("/usr/bin/say")
  ]);
  return {
    ffmpeg: checks[0].status === "fulfilled",
    ffprobe: checks[1].status === "fulfilled",
    systemTts: checks[2].status === "fulfilled",
    minimaxTts: hasMiniMaxApiKey(),
    speechModel: hasMiniMaxApiKey() ? "speech-2.8-hd" : null,
    deepseekStoryboard: hasDeepSeekApiKey(),
    storyboardModel: hasDeepSeekApiKey()
      ? String(process.env.DEEPSEEK_MODEL || "deepseek-flash")
      : null,
    renderConcurrency: resolveRenderConcurrency()
  };
}

export async function renderVideo({ projectRoot, jobId, input, onProgress }) {
  const title = String(input.title || "星格关系观察").trim().slice(0, 80);
  const script = String(input.script || "").trim();
  const pace = Number(input.pace || 3.4);
  const tag = String(input.tag || "星座 × MBTI").trim().slice(0, 40);
  const systemVoice = String(input.systemVoice || "Tingting").trim();
  const voiceId = normalizeMiniMaxVoiceId(input.voiceId);
  const emotion = normalizeMiniMaxEmotion(input.emotion);
  const fontStyle = ["poetic", "editorial", "engraved"].includes(input.fontStyle)
    ? input.fontStyle
    : "poetic";
  const renderConcurrency = resolveRenderConcurrency();

  if (script.length < 8) throw new Error("文案至少需要8个字");
  if (script.length > 3000) throw new Error("第一版单条文案最多支持3000字");

  const jobDir = path.join(projectRoot, "data", "jobs", jobId);
  const speechProvider = hasMiniMaxApiKey() ? "minimax" : "system";
  const rawNarrationPath = path.join(
    jobDir,
    speechProvider === "minimax" ? "narration-raw.mp3" : "narration-raw.aiff"
  );
  const narrationPath = path.join(jobDir, "narration.mp3");
  const backgroundPath = path.join(projectRoot, "public", "assets", "xingge-avatar.png");
  const outroFramePath = await ensureOutroFrame({ projectRoot });
  const outputName = `${sanitizeFilename(title)}-${jobId.slice(0, 8)}.mp4`;
  const outputPath = path.join(projectRoot, "exports", outputName);
  await mkdir(jobDir, { recursive: true });

  onProgress?.({ progress: 3, stage: "正在使用 DeepSeek 规划语义分镜" });
  const storyboard = await createStoryboard({
    title,
    tag,
    script,
    providedStoryboard: input.storyboard
  });
  const emotionPlan = storyboard.scenes.map((scene) => ({
    ...scene,
    emotion: emotion === "auto" ? scene.emotion : emotion
  }));
  const sceneTexts = emotionPlan.map((scene) => scene.text);
  let speechMetadata;
  let duration;
  let scenes;
  let loudnessNormalization;
  let audioReused = false;
  const reusable = await loadReusableNarration({
    projectRoot,
    sourceJobId: input.reuseAudioFromJobId,
    narrationPath,
    current: {
      script,
      pace,
      speechProvider,
      voiceId: speechProvider === "minimax" ? voiceId : systemVoice,
      emotion: speechProvider === "minimax" ? emotion : null,
      scenes: emotionPlan
    },
    emotionPlan
  });

  if (reusable) {
    onProgress?.({ progress: 24, stage: "已复用旁白，正在重新排版画面" });
    ({ duration, scenes, speechMetadata, loudnessNormalization } = reusable);
    audioReused = true;
  } else if (speechProvider === "minimax") {
    const unifiedSegment = createUnifiedSpeechSegment(emotionPlan);
    onProgress?.({ progress: 10, stage: "正在锁定同一音色生成连续旁白" });
    const result = await generateMiniMaxSpeech({
      text: unifiedSegment.text,
      outputPath: rawNarrationPath,
      voiceId,
      emotion,
      pace,
      pitch: 0,
      subtitleType: "word"
    });
    duration = await mediaDuration(rawNarrationPath);
    scenes = timedScenesForSpeechSegment(unifiedSegment, result.subtitles, duration, 0);
    speechMetadata = {
      model: "speech-2.8-hd",
      strategy: "unified-voice-auto-emotion",
      identityLocked: true,
      usageCharacters: result.usageCharacters,
      segments: [{
        role: "narration",
        roleLabel: "统一连续旁白",
        emotion: emotion === "auto" ? "auto" : emotion,
        pauseAfter: 0
      }]
    };
  } else {
    onProgress?.({ progress: 8, stage: "正在生成本机中文配音" });
    await run("/usr/bin/say", [
      "-v",
      systemVoice,
      "-r",
      String(speechRateForPace(pace)),
      "-o",
      rawNarrationPath,
      script
    ]);
    duration = await mediaDuration(rawNarrationPath);
    scenes = allocateSceneTimings(sceneTexts, duration).map((scene, index) => ({
      ...scene,
      role: emotionPlan[index].role,
      roleLabel: emotionPlan[index].roleLabel,
      emotion: null,
      typography: emotionPlan[index].typography || null
    }));
  }

  if (!audioReused) {
    onProgress?.({ progress: 24, stage: "正在标准化旁白响度" });
    loudnessNormalization = await normalizeAudioLoudness({
      inputPath: rawNarrationPath,
      outputPath: narrationPath
    });
    duration = await mediaDuration(narrationPath);
  }
  if (scenes.length) {
    scenes.at(-1).end = Number(duration.toFixed(3));
    scenes.at(-1).duration = Number((duration - scenes.at(-1).start).toFixed(3));
  }

  onProgress?.({ progress: 28, stage: "正在分析配音时长" });

  onProgress?.({
    progress: 38,
    stage: `正在并行生成字幕画面（${renderConcurrency.captionConcurrency} 路）`
  });
  const captionFrames = await createCaptionFrames({
    directory: jobDir,
    title,
    tag,
    fontStyle,
    scenes,
    concurrency: renderConcurrency.captionConcurrency
  });

  await writeFile(
    path.join(jobDir, "render-input.json"),
    `${JSON.stringify({
      title,
      script,
      pace,
      tag,
      fontStyle,
      speechProvider,
      voiceId: speechProvider === "minimax" ? voiceId : systemVoice,
      emotion: speechProvider === "minimax" ? emotion : null,
      speechModel: speechMetadata?.model || null,
      speechStrategy: speechMetadata?.strategy || null,
      voiceIdentityLocked: speechMetadata?.identityLocked || false,
      audioReused,
      reusedAudioFromJobId: audioReused ? String(input.reuseAudioFromJobId) : null,
      loudnessNormalization,
      storyboardProvider: storyboard.provider,
      storyboardModel: storyboard.model,
      storyboardFallbackReason: storyboard.fallbackReason || null,
      renderConcurrency,
      emotionPlan,
      speechSegments: speechMetadata?.segments || [],
      duration,
      outputDuration: Number((duration + OUTRO_DURATION_SECONDS).toFixed(3)),
      outro: {
        enabled: true,
        duration: OUTRO_DURATION_SECONDS,
        style: "xingge-brand-v1"
      },
      scenes
    }, null, 2)}\n`,
    "utf8"
  );

  onProgress?.({
    progress: 48,
    stage: `正在多线程渲染视频（${renderConcurrency.ffmpegThreads} 线程）`
  });
  let progressBuffer = "";
  const inputs = [
    "-y",
    "-hide_banner",
    "-loop",
    "1",
    "-framerate",
    "30",
    "-i",
    backgroundPath,
    "-i",
    narrationPath
  ];
  for (const frame of captionFrames) {
    inputs.push("-loop", "1", "-framerate", "30", "-i", frame.filePath);
  }
  const outroInputIndex = 2 + captionFrames.length;
  inputs.push("-loop", "1", "-framerate", "30", "-i", outroFramePath);

  const outputDuration = duration + OUTRO_DURATION_SECONDS;
  const filterParts = buildVideoFilterParts(captionFrames, {
    outroInputIndex,
    mainDuration: duration,
    outroDuration: OUTRO_DURATION_SECONDS
  });

  await run(
    "ffmpeg",
    [
      ...inputs,
      "-filter_threads",
      String(renderConcurrency.filterThreads),
      "-filter_complex_threads",
      String(renderConcurrency.filterThreads),
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "[video]",
      "-map",
      "[audio]",
      "-t",
      outputDuration.toFixed(3),
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-threads:v",
      String(renderConcurrency.ffmpegThreads),
      "-preset",
      "veryfast",
      "-crf",
      "21",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      outputPath
    ],
    {
      onStderr(chunk) {
        progressBuffer = `${progressBuffer}${chunk}`.slice(-2000);
        parseFfmpegProgress(progressBuffer, outputDuration, onProgress);
      }
    }
  );

  onProgress?.({ progress: 100, stage: "视频生成完成" });
  return {
    outputName,
    outputPath,
    outputUrl: `/exports/${encodeURIComponent(outputName)}`,
    duration: Number(outputDuration.toFixed(2)),
    narrationDuration: Number(duration.toFixed(2)),
    outroDuration: OUTRO_DURATION_SECONDS,
    speechProvider,
    speechModel: speechMetadata?.model || "macOS say",
    speechStrategy: speechMetadata?.strategy || "system-voice",
    voiceIdentityLocked: speechMetadata?.identityLocked || false,
    audioReused,
    reusedAudioFromJobId: audioReused ? String(input.reuseAudioFromJobId) : null,
    loudnessNormalization,
    storyboardProvider: storyboard.provider,
    storyboardModel: storyboard.model,
    renderConcurrency,
    voiceId: speechProvider === "minimax" ? voiceId : systemVoice,
    emotion: speechProvider === "minimax" ? emotion : null,
    emotionPlan,
    speechSegments: speechMetadata?.segments || [],
    scenes
  };
}
