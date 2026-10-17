import { writeFile } from "node:fs/promises";

const DEFAULT_MINIMAX_TTS_ENDPOINTS = [
  "https://api.minimaxi.com/v1/t2a_v2",
  "https://api.minimax.io/v1/t2a_v2"
];
let resolvedEndpoint = "";

export const DEFAULT_MINIMAX_VOICE_ID = "Chinese (Mandarin)_Warm_Girl";

export const MINIMAX_VOICE_IDS = new Set([
  DEFAULT_MINIMAX_VOICE_ID,
  "Chinese (Mandarin)_IntellectualGirl",
  "Chinese (Mandarin)_Lyrical_Voice",
  "Chinese (Mandarin)_Gentle_Youth",
  "Chinese (Mandarin)_Radio_Host"
]);

export const MINIMAX_EMOTIONS = new Set([
  "auto",
  "calm",
  "happy",
  "sad",
  "surprised",
  "fearful"
]);

export function hasMiniMaxApiKey() {
  return Boolean(String(process.env.MINIMAX_API_KEY || "").trim());
}

export function normalizeMiniMaxVoiceId(value) {
  const voiceId = String(value || "").trim();
  return MINIMAX_VOICE_IDS.has(voiceId) ? voiceId : DEFAULT_MINIMAX_VOICE_ID;
}

export function normalizeMiniMaxEmotion(value) {
  const emotion = String(value || "auto").trim();
  return MINIMAX_EMOTIONS.has(emotion) ? emotion : "auto";
}

export function miniMaxSpeedForPace(pace = 3.4) {
  const numericPace = Number(pace);
  if (!Number.isFinite(numericPace)) return 1;
  return Number(Math.max(0.5, Math.min(2, numericPace / 3.4)).toFixed(2));
}

function normalizePitch(value) {
  const pitch = Number(value);
  if (!Number.isFinite(pitch)) return 0;
  return Math.round(Math.max(-12, Math.min(12, pitch)));
}

function createApiError(payload, status) {
  const apiMessage = payload?.base_resp?.status_msg || payload?.message || "未知错误";
  const apiCode = payload?.base_resp?.status_code;
  const suffix = apiCode === undefined ? "" : `（错误码 ${apiCode}）`;
  const error = new Error(`MiniMax 配音失败：${apiMessage}${suffix}`);
  error.details = `HTTP ${status}${payload?.trace_id ? ` · trace_id ${payload.trace_id}` : ""}`;
  return error;
}

export async function requestMiniMaxSpeech({
  text,
  voiceId = DEFAULT_MINIMAX_VOICE_ID,
  emotion = "auto",
  pace = 3.4,
  pitch = 0,
  subtitleType = null,
  fetchImpl = fetch
}) {
  const apiKey = String(process.env.MINIMAX_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("未检测到 MINIMAX_API_KEY，请重新启动本地服务后再试");
  }

  const normalizedVoiceId = normalizeMiniMaxVoiceId(voiceId);
  const normalizedEmotion = normalizeMiniMaxEmotion(emotion);
  const voiceSetting = {
    voice_id: normalizedVoiceId,
    speed: miniMaxSpeedForPace(pace),
    vol: 1,
    pitch: normalizePitch(pitch)
  };
  if (normalizedEmotion !== "auto") voiceSetting.emotion = normalizedEmotion;

  const requestPayload = {
    model: "speech-2.8-hd",
    text,
    stream: false,
    language_boost: "Chinese",
    text_normalization_mode: "quality",
    output_format: "hex",
    voice_setting: voiceSetting,
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: "mp3",
      channel: 1
    }
  };
  if (["sentence", "word"].includes(subtitleType)) {
    requestPayload.subtitle_enable = true;
    requestPayload.subtitle_type = subtitleType;
  }
  const requestBody = JSON.stringify(requestPayload);
  const configuredEndpoint = String(process.env.MINIMAX_TTS_ENDPOINT || "").trim();
  const endpoints = configuredEndpoint
    ? [configuredEndpoint]
    : resolvedEndpoint
      ? [resolvedEndpoint]
      : DEFAULT_MINIMAX_TTS_ENDPOINTS;

  let response;
  let payload;
  let connectionError;
  for (const [index, endpoint] of endpoints.entries()) {
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: requestBody,
        signal: AbortSignal.timeout(120_000)
      });
      payload = await response.json();
    } catch (error) {
      connectionError = error;
      if (index < endpoints.length - 1) continue;
      if (error?.name === "TimeoutError") {
        throw new Error("MiniMax 配音请求超时，请检查网络后重试");
      }
      throw new Error(`无法连接 MiniMax 配音服务：${error.message}`);
    }

    if (response.ok && payload?.base_resp?.status_code === 0) {
      resolvedEndpoint = endpoint;
      break;
    }
    if (payload?.base_resp?.status_code === 2049 && index < endpoints.length - 1) continue;
    throw createApiError(payload, response.status);
  }

  if (!response || !payload) {
    throw new Error(`无法连接 MiniMax 配音服务：${connectionError?.message || "未知错误"}`);
  }

  const audioHex = payload?.data?.audio;
  if (typeof audioHex !== "string" || !audioHex || !/^[0-9a-f]+$/iu.test(audioHex)) {
    throw new Error("MiniMax 配音成功，但没有返回有效音频");
  }

  let subtitles = [];
  const subtitleUrl = payload?.data?.subtitle_file;
  if (subtitleType && subtitleUrl) {
    try {
      const subtitleResponse = await fetchImpl(subtitleUrl, {
        signal: AbortSignal.timeout(30_000)
      });
      if (subtitleResponse.ok) {
        const subtitlePayload = await subtitleResponse.json();
        if (Array.isArray(subtitlePayload)) subtitles = subtitlePayload;
      }
    } catch {
      // Subtitle timing improves alignment but is not required to keep rendering usable.
    }
  }

  return {
    buffer: Buffer.from(audioHex, "hex"),
    voiceId: normalizedVoiceId,
    emotion: normalizedEmotion,
    model: "speech-2.8-hd",
    traceId: payload.trace_id || null,
    usageCharacters: Number(payload?.extra_info?.usage_characters || 0),
    audioLengthMs: Number(payload?.extra_info?.audio_length || 0),
    subtitles
  };
}

export async function generateMiniMaxSpeech(options) {
  const result = await requestMiniMaxSpeech(options);
  await writeFile(options.outputPath, result.buffer);
  return result;
}
