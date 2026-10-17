import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVideoFilterParts,
  canReuseNarration,
  resolveRenderConcurrency,
  timedScenesForSpeechSegment
} from "./render-video.mjs";

test("keeps MiniMax word timing ranges on their matching visual scene", () => {
  const firstText = "先观察。";
  const secondText = "再靠近。";
  const segment = {
    scenes: [
      { sceneIndex: 0, text: firstText, textBegin: 0, textEnd: firstText.length, role: "hook" },
      {
        sceneIndex: 1,
        text: secondText,
        textBegin: firstText.length + 1,
        textEnd: firstText.length + 1 + secondText.length,
        role: "analysis"
      }
    ]
  };
  const subtitles = [{
    timestamped_words: [
      { word: firstText, word_begin: 0, word_end: 4, time_begin: 0, time_end: 1200 },
      { word: secondText, word_begin: 5, word_end: 9, time_begin: 1400, time_end: 2600 }
    ]
  }];

  const scenes = timedScenesForSpeechSegment(segment, subtitles, 2.6, 0);

  assert.equal(scenes[1].start, 1.4);
  assert.deepEqual(scenes[1].wordTimings, [{
    text: secondText,
    charStart: 0,
    charEnd: secondText.length,
    start: 1.4,
    end: 2.6
  }]);
});

test("reuses narration only when every audio-affecting field and scene text matches", () => {
  const previous = {
    script: "第一，他会记住你的小事。",
    pace: 3.4,
    speechProvider: "minimax",
    voiceId: "Chinese (Mandarin)_Warm_Girl",
    emotion: "auto",
    scenes: [{ text: "第一，他会记住你的小事。" }]
  };
  const current = {
    ...previous,
    scenes: [{
      text: "第一，他会记住你的小事。",
      typography: { layout: "list" }
    }]
  };

  assert.equal(canReuseNarration(previous, current), true);
  assert.equal(canReuseNarration(previous, { ...current, pace: 4.1 }), false);
  assert.equal(canReuseNarration(previous, {
    ...current,
    scenes: [{ text: "第二，他会记住你的小事。" }]
  }), false);
});

test("builds animated caption overlays and a moving background", () => {
  const filters = buildVideoFilterParts([
    {
      name: "base",
      start: 0,
      end: 2.5,
      fadeDuration: 0.2,
      effect: "typewriter",
      transition: "zoom"
    },
    {
      name: "reveal",
      start: 1,
      end: 2.5,
      fadeDuration: 0.2,
      effect: "slide",
      transition: "zoom"
    }
  ]);
  const graph = filters.join(";");

  assert.match(graph, /crop=1080:1920:x=.*sin\(t\*0\.18\)/u);
  assert.match(graph, /scale=w='trunc\(iw\*\(if\(lt/u);
  assert.match(graph, /overlay=x='\(W-w\)\/2':y='\(H-h\)\/2'/u);
  assert.match(graph, /fade=t=in:st=1\.000/u);
  assert.match(graph, /format=yuv420p\[video\]$/u);
});

test("builds a visible page push without introducing a flash layer", () => {
  const filters = buildVideoFilterParts([
    {
      name: "full",
      start: 0,
      end: 1.8,
      fadeDuration: 0.2,
      effect: "slide",
      transition: "push"
    },
    {
      name: "full",
      start: 1.8,
      end: 3.6,
      fadeDuration: 0.2,
      effect: "punch",
      transition: "none"
    }
  ]);
  const graph = filters.join(";");

  assert.match(graph, /320\*\(1-\(t-0\.000\)\/0\.450\)/u);
  assert.match(graph, /fade=t=in:st=1\.800:d=0\.100/u);
  assert.doesNotMatch(graph, /color=c=white/u);
  assert.doesNotMatch(graph, /flashLayer/u);
});

test("appends a lightweight branded outro and matching silent audio", () => {
  const filters = buildVideoFilterParts([{
    name: "full",
    start: 0,
    end: 2.5,
    fadeDuration: 0.15,
    effect: "rise",
    transition: "none"
  }], {
    outroInputIndex: 3,
    mainDuration: 2.5,
    outroDuration: 2.8
  });
  const graph = filters.join(";");

  assert.match(graph, /\[3:v\]scale=1188:2112,crop=1080:1920/u);
  assert.match(graph, /fade=t=in:st=2\.500:d=0\.28:alpha=1/u);
  assert.match(graph, /fade=t=out:st=4\.920:d=0\.38:alpha=1/u);
  assert.match(graph, /\[video0\]\[outroVideo\]overlay=x=0:y=0:enable=between\(t\\,2\.500\\,5\.300\).*\[video\]/u);
  assert.match(graph, /\[1:a\]apad=pad_dur=2\.800,atrim=duration=5\.300.*\[audio\]/u);
});

test("selects bounded multi-core render concurrency", () => {
  assert.deepEqual(resolveRenderConcurrency({ cores: 24 }), {
    cores: 24,
    ffmpegThreads: 12,
    filterThreads: 8,
    captionConcurrency: 6
  });
  assert.deepEqual(resolveRenderConcurrency({
    cores: 8,
    ffmpegThreads: 99,
    filterThreads: 0,
    captionConcurrency: 3
  }), {
    cores: 8,
    ffmpegThreads: 16,
    filterThreads: 1,
    captionConcurrency: 3
  });
});
