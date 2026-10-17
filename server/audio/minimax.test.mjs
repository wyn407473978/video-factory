import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MINIMAX_VOICE_ID,
  miniMaxSpeedForPace,
  normalizeMiniMaxEmotion,
  normalizeMiniMaxVoiceId,
  requestMiniMaxSpeech
} from "./minimax.mjs";

test("maps editor pace to the MiniMax speed range", () => {
  assert.equal(miniMaxSpeedForPace(3.4), 1);
  assert.equal(miniMaxSpeedForPace(4.1), 1.21);
  assert.equal(miniMaxSpeedForPace(2.7), 0.79);
  assert.equal(miniMaxSpeedForPace(100), 2);
});

test("falls back to safe voice and emotion values", () => {
  assert.equal(normalizeMiniMaxVoiceId("unknown"), DEFAULT_MINIMAX_VOICE_ID);
  assert.equal(normalizeMiniMaxEmotion("dramatic"), "auto");
  assert.equal(normalizeMiniMaxEmotion("calm"), "calm");
});

test("builds a speech-2.8-hd request and decodes hex audio", async () => {
  const previousKey = process.env.MINIMAX_API_KEY;
  process.env.MINIMAX_API_KEY = "test-key";
  let requestBody;

  try {
    const result = await requestMiniMaxSpeech({
      text: "测试配音",
      emotion: "calm",
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return new Response(JSON.stringify({
          data: { audio: "494433" },
          extra_info: { usage_characters: 4, audio_length: 800 },
          base_resp: { status_code: 0, status_msg: "success" },
          trace_id: "test-trace"
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    });

    assert.equal(requestBody.model, "speech-2.8-hd");
    assert.equal(requestBody.voice_setting.emotion, "calm");
    assert.equal(requestBody.voice_setting.pitch, 0);
    assert.equal(requestBody.language_boost, "Chinese");
    assert.equal(result.buffer.toString("hex"), "494433");
  } finally {
    if (previousKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = previousKey;
  }
});

test("lets one full-script request use contextual automatic emotion", async () => {
  const previousKey = process.env.MINIMAX_API_KEY;
  process.env.MINIMAX_API_KEY = "test-key";
  let requestBody;

  try {
    await requestMiniMaxSpeech({
      text: "先平静分析。后来有些难过。最后温暖地问候。",
      emotion: "auto",
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return new Response(JSON.stringify({
          data: { audio: "494433" },
          extra_info: { usage_characters: 22, audio_length: 2500 },
          base_resp: { status_code: 0, status_msg: "success" }
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    });

    assert.equal(requestBody.voice_setting.voice_id, DEFAULT_MINIMAX_VOICE_ID);
    assert.equal(requestBody.voice_setting.pitch, 0);
    assert.equal(requestBody.voice_setting.emotion, undefined);
  } finally {
    if (previousKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = previousKey;
  }
});
