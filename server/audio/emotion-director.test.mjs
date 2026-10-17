import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyEmotionRole,
  createUnifiedSpeechSegment,
  groupEmotionCurve,
  planEmotionCurve
} from "../../shared/emotion-director.mjs";

test("classifies the five common short-video narrative roles", () => {
  const scenes = [
    "双鱼真正动心以后，会有三个信号。",
    "第一，他会记住你说过的小事。",
    "他很想靠近，却又害怕受到伤害。",
    "但其实，不主动不代表不喜欢。",
    "你认识的双鱼也是这样吗？"
  ];
  assert.deepEqual(
    scenes.map((scene, index) => classifyEmotionRole(scene, index, scenes.length)),
    ["hook", "analysis", "conflict", "reversal", "interaction"]
  );
});

test("manual emotion overrides emotion without removing the narrative direction", () => {
  const plan = planEmotionCurve(["开场。", "但是他很认真。", "你觉得呢？"], {
    manualEmotion: "calm"
  });
  assert.deepEqual(plan.map((item) => item.role), ["hook", "reversal", "interaction"]);
  assert.deepEqual(plan.map((item) => item.emotion), ["calm", "calm", "calm"]);
});

test("groups consecutive scenes with the same direction and tracks text offsets", () => {
  const plan = planEmotionCurve(["开场。", "第一点。", "第二点。", "你觉得呢？"]);
  const groups = groupEmotionCurve(plan);
  assert.equal(groups.length, 3);
  assert.equal(groups[1].scenes.length, 2);
  assert.equal(groups[1].text, "第一点。\n第二点。");
  assert.equal(groups[1].scenes[1].textBegin, 5);
});

test("keeps different visual roles in one continuous delivery group", () => {
  const plan = [
    { text: "他很安静。", role: "analysis", roleLabel: "特征分析", deliveryGroup: 0, emotion: "calm", speedMultiplier: 1, pitch: 0, pauseAfter: 0.3 },
    { text: "其实是在确认安全感。", role: "reversal", roleLabel: "观点反转", deliveryGroup: 0, emotion: "calm", speedMultiplier: 1, pitch: 0, pauseAfter: 0.4 },
    { text: "你也遇到过吗？", role: "interaction", roleLabel: "结尾互动", deliveryGroup: 1, emotion: "happy", speedMultiplier: 1.04, pitch: 1, pauseAfter: 0.25 }
  ];
  const groups = groupEmotionCurve(plan);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].scenes.length, 2);
  assert.equal(groups[0].text, "他很安静。\n其实是在确认安全感。");
});

test("builds one identity-locked narration request for every visual scene", () => {
  const plan = [
    { sceneIndex: 0, text: "他先安静地观察。", role: "analysis", emotion: "calm" },
    { sceneIndex: 1, text: "其实他也害怕受伤。", role: "reversal", emotion: "sad" },
    { sceneIndex: 2, text: "你也遇到过吗？", role: "interaction", emotion: "happy" }
  ];
  const segment = createUnifiedSpeechSegment(plan);

  assert.equal(segment.text, "他先安静地观察。\n其实他也害怕受伤。\n你也遇到过吗？");
  assert.equal(segment.emotion, "auto");
  assert.equal(segment.pitch, 0);
  assert.equal(segment.scenes.length, 3);
  assert.equal(segment.scenes[1].textBegin, 9);
});
