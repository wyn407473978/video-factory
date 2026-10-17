import test from "node:test";
import assert from "node:assert/strict";
import {
  requestDeepSeekStoryboard,
  validateStoryboard
} from "./deepseek-storyboard.mjs";

const script = "他越喜欢你，反而越安静。你认识的双鱼也是这样吗？";

test("validates and normalizes a semantic storyboard", () => {
  const result = validateStoryboard({
    scenes: [
      {
        text: "他越喜欢你，反而越安静。",
        role: "hook",
        emotion: "surprised",
        speedMultiplier: 2,
        pitch: 8,
        pauseAfter: 3
      },
      {
        text: "你认识的双鱼也是这样吗？",
        role: "interaction",
        emotion: "happy",
        speedMultiplier: 1.04,
        pitch: 1,
        pauseAfter: 0.25
      }
    ]
  }, script);

  assert.equal(result.scenes[0].speedMultiplier, 1.15);
  assert.equal(result.scenes[0].pitch, 2);
  assert.equal(result.scenes[0].pauseAfter, 1.2);
  assert.equal(result.scenes[1].roleLabel, "结尾互动");
});

test("rejects storyboards that rewrite the original copy", () => {
  assert.throws(
    () => validateStoryboard({ scenes: [{ text: "模型改写了文案。" }] }, script),
    /改写或遗漏/u
  );
});

test("merges fragments that split a dependent clause at a comma", () => {
  const copy = "他很想靠近你，却又害怕关系发展得太快。";
  const result = validateStoryboard({
    overallTone: "克制不安",
    scenes: [
      { text: "他很想靠近你，", role: "analysis", deliveryGroup: 0, emotion: "calm" },
      { text: "却又害怕关系发展得太快。", role: "conflict", deliveryGroup: 1, emotion: "fearful" }
    ]
  }, copy);

  assert.equal(result.scenes.length, 1);
  assert.equal(result.scenes[0].text, copy);
  assert.equal(result.scenes[0].role, "conflict");
});

test("keeps one continuous delivery direction inside a voice group", () => {
  const copy = "第一，他会记住你的小事。第二，他会留意你的情绪。最后，他才会慢慢靠近你。";
  const result = validateStoryboard({
    scenes: [
      { text: "第一，他会记住你的小事。", role: "analysis", deliveryGroup: 0, emotion: "calm", speedMultiplier: 1 },
      { text: "第二，他会留意你的情绪。", role: "analysis", deliveryGroup: 0, emotion: "surprised", speedMultiplier: 1.12 },
      { text: "最后，他才会慢慢靠近你。", role: "reversal", deliveryGroup: 1, emotion: "happy", speedMultiplier: 0.85 }
    ]
  }, copy);

  assert.equal(result.scenes[0].deliveryGroup, 0);
  assert.equal(result.scenes[1].deliveryGroup, 0);
  assert.equal(result.scenes[0].emotion, result.scenes[1].emotion);
  assert.ok(Math.abs(result.scenes[2].speedMultiplier - result.scenes[1].speedMultiplier) <= 0.121);
});

test("splits a long paragraph only at complete sentence boundaries", () => {
  const copy = "他会记住你随口说过的每一件小事。他很想慢慢靠近你，却又害怕关系发展得太快。他不会轻易说出喜欢，却会默默观察你的情绪变化。";
  const result = validateStoryboard({
    scenes: [{
      text: copy,
      role: "analysis",
      deliveryGroup: 0,
      emotion: "calm",
      speedMultiplier: 1,
      pitch: 0
    }]
  }, copy);

  assert.equal(result.scenes.length, 2);
  assert.equal(result.scenes.map((scene) => scene.text).join(""), copy);
  assert.equal(result.scenes[0].deliveryGroup, result.scenes[1].deliveryGroup);
  assert.match(result.scenes[0].text, /。$/u);
});

test("keeps every numbered point in its own visual scene", () => {
  const copy = "第一，他会记住你的小事。第二，他会留意你的情绪。第三，他会慢慢靠近你。";
  const result = validateStoryboard({
    scenes: [{
      text: copy,
      role: "analysis",
      emotion: "calm",
      typography: {
        displayLines: [copy],
        layout: "list"
      }
    }]
  }, copy);

  assert.deepEqual(result.scenes.map((scene) => scene.text), [
    "第一，他会记住你的小事。",
    "第二，他会留意你的情绪。",
    "第三，他会慢慢靠近你。"
  ]);
  assert.ok(result.scenes.every((scene) => scene.typography === null));
});

test("coalesces adjacent delivery groups with the same vocal direction", () => {
  const copy = "先安静地观察。再慢慢说清楚他的表现。";
  const result = validateStoryboard({
    scenes: [
      { text: "先安静地观察。", role: "hook", deliveryGroup: 0, emotion: "calm", speedMultiplier: 1, pitch: 0 },
      { text: "再慢慢说清楚他的表现。", role: "analysis", deliveryGroup: 1, emotion: "calm", speedMultiplier: 1.1, pitch: 1 }
    ]
  }, copy);

  assert.equal(result.scenes[0].deliveryGroup, 0);
  assert.equal(result.scenes[1].deliveryGroup, 0);
  assert.equal(result.scenes[0].speedMultiplier, result.scenes[1].speedMultiplier);
});

test("keeps a valid DeepSeek typography plan without changing the copy", () => {
  const copy = "他不是不够喜欢，只是需要确定：靠近你以后，自己不会受伤。";
  const result = validateStoryboard({
    scenes: [{
      text: copy,
      role: "reversal",
      typography: {
        displayLines: ["他不是不够喜欢，只是", "需要确定：靠近你以后，", "自己不会受伤。"],
        emphasis: ["不是不够喜欢", "不会受伤", "不存在"],
        layout: "reversal",
        alignment: "center",
        size: "hero",
        effect: "punch",
        accentStyle: "glow",
        transition: "zoom",
        revealOrder: [0, 2, 1]
      }
    }]
  }, copy);

  assert.deepEqual(result.scenes[0].typography.displayLines, [
    "他不是不够喜欢，只是",
    "需要确定：靠近你以后，",
    "自己不会受伤。"
  ]);
  assert.deepEqual(result.scenes[0].typography.emphasis, ["不是不够喜欢", "不会受伤"]);
  assert.equal(result.scenes[0].typography.size, "hero");
  assert.equal(result.scenes[0].typography.effect, "punch");
  assert.equal(result.scenes[0].typography.accentStyle, "glow");
  assert.equal(result.scenes[0].typography.transition, "zoom");
  assert.deepEqual(result.scenes[0].typography.revealOrder, [0, 2, 1]);
});

test("falls back to safe motion directions when DeepSeek returns removed or unknown styles", () => {
  const copy = "第一，他会记住你的小事。";
  const result = validateStoryboard({
    scenes: [{
      text: copy,
      role: "analysis",
      typography: {
        displayLines: ["第一，他会记住", "你的小事。"],
        layout: "list",
        size: "enormous",
        effect: "explode",
        accentStyle: "rainbow",
        transition: "flash"
      }
    }]
  }, copy);

  assert.equal(result.scenes[0].typography.size, "hero");
  assert.equal(result.scenes[0].typography.effect, "slide");
  assert.equal(result.scenes[0].typography.accentStyle, "underline");
  assert.equal(result.scenes[0].typography.transition, "push");
});

test("drops only an unsafe typography plan while preserving the storyboard", () => {
  const copy = "他很想靠近你，却又害怕关系发展得太快。";
  const result = validateStoryboard({
    scenes: [{
      text: copy,
      role: "conflict",
      typography: {
        displayLines: ["模型偷偷改写了这句话"],
        emphasis: ["模型"],
        layout: "conflict"
      }
    }]
  }, copy);

  assert.equal(result.scenes[0].text, copy);
  assert.equal(result.scenes[0].typography, null);
});

test("requests JSON output from the current DeepSeek model", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-key";
  let requestBody;
  try {
    const result = await requestDeepSeekStoryboard({
      script,
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return new Response(JSON.stringify({
          model: "deepseek-flash",
          choices: [{
            message: {
              content: JSON.stringify({
                scenes: [
                  { text: "他越喜欢你，反而越安静。", role: "hook", deliveryGroup: 0, emotion: "calm" },
                  { text: "你认识的双鱼也是这样吗？", role: "interaction", deliveryGroup: 1, emotion: "happy" }
                ]
              })
            }
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50 }
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    });

    assert.equal(requestBody.model, "deepseek-flash");
    assert.deepEqual(requestBody.response_format, { type: "json_object" });
    assert.deepEqual(requestBody.thinking, { type: "disabled" });
    assert.equal(requestBody.reasoning_effort, undefined);
    assert.equal(result.provider, "deepseek");
    assert.equal(result.scenes.length, 2);
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});
