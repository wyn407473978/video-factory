import test from "node:test";
import assert from "node:assert/strict";
import {
  allocateSceneTimings,
  countReadableChars,
  estimateDuration,
  sanitizeFilename,
  splitScript
} from "./script-utils.mjs";

test("counts Chinese copy without whitespace", () => {
  assert.equal(countReadableChars("双鱼 INFJ\n男"), 7);
});

test("splits paragraphs and Chinese sentences", () => {
  assert.deepEqual(splitScript("第一句话。\n第二句话！"), ["第一句话。", "第二句话！"]);
});

test("allocates timings across the full duration", () => {
  const scenes = allocateSceneTimings(["短句。", "这是一条更长的句子。"], 12);
  assert.equal(scenes[0].start, 0);
  assert.equal(scenes.at(-1).end, 12);
});

test("estimates duration using pace", () => {
  assert.ok(estimateDuration("这是一个用于测试时长的句子。", 2.7) > estimateDuration("这是一个用于测试时长的句子。", 4.1));
});

test("sanitizes output filenames", () => {
  assert.equal(sanitizeFilename("双鱼/INFJ:测试"), "双鱼-INFJ-测试");
});
