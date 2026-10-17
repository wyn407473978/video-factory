import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCaptionFrameSvg,
  extractContentOrdinal,
  lineRevealSchedule,
  resolveTypography,
  wrapText
} from "./caption-frames.mjs";

test("does not render automatic scene numbers or numeric progress counters", () => {
  const scene = {
    text: "这是一段没有编号的正文。",
    role: "analysis",
    renderTypography: resolveTypography({
      text: "这是一段没有编号的正文。",
      role: "analysis"
    }, { index: 0, total: 3 })
  };
  const svg = buildCaptionFrameSvg({
    title: "测试标题",
    tag: "星座 × MBTI",
    fontStyle: "poetic",
    scene,
    index: 0,
    total: 3,
    phase: "full"
  });

  assert.doesNotMatch(svg, /class="sectionNo"/u);
  assert.doesNotMatch(svg, /class="ghostNo"/u);
  assert.doesNotMatch(svg, /进度\s*\d/u);
  assert.doesNotMatch(svg, /@星格观察局/u);
  assert.doesNotMatch(svg, /看懂性格，也看懂关系/u);
});

test("wraps long Chinese captions inside the safe visual width", () => {
  const lines = wrapText(
    "他不是不够喜欢，只是需要确定：靠近你以后，自己不会受伤。",
    12
  );

  assert.deepEqual(lines, [
    "他不是不够喜欢，只是",
    "需要确定：靠近你",
    "以后，自己不会受伤。"
  ]);
  assert.ok(lines.every((line) => [...line].length <= 13));
});

test("keeps punctuation attached while enforcing a hard line limit", () => {
  const lines = wrapText("这是第一句话，这是第二句话，这是第三句话。", 10);
  assert.equal(lines.join(""), "这是第一句话，这是第二句话，这是第三句话。");
  assert.ok(lines.every((line) => [...line].length <= 11));
});

test("uses DeepSeek semantic line breaks when they are exact and safe", () => {
  const text = "他不是不够喜欢，只是需要确定：靠近你以后，自己不会受伤。";
  const typography = resolveTypography({
    text,
    role: "reversal",
    typography: {
      displayLines: ["他不是不够喜欢，", "只是需要确定：", "靠近你以后，", "自己不会受伤。"],
      emphasis: ["不够喜欢", "不会受伤"],
      layout: "reversal",
      alignment: "center",
      revealOrder: [0, 1, 3, 2]
    }
  }, { index: 3, total: 5 });

  assert.equal(typography.source, "deepseek");
  assert.equal(typography.layout, "reversal");
  assert.equal(typography.alignment, "center");
  assert.equal(typography.size, "hero");
  assert.equal(typography.effect, "punch");
  assert.equal(typography.accentStyle, "gradient");
  assert.equal(typography.transition, "zoom");
  assert.deepEqual(typography.revealOrder, [0, 1, 3, 2]);
});

test("downgrades the removed dissolve transition to a natural cut", () => {
  const text = "普通叙述保持清爽自然。";
  const typography = resolveTypography({
    text,
    role: "analysis",
    typography: {
      displayLines: [text],
      layout: "analysis",
      transition: "dissolve"
    }
  });

  assert.equal(typography.transition, "none");
});

test("preserves AI semantic breaks while refining an over-wide line locally", () => {
  const text = "他不是不够喜欢，只是需要确定：靠近你以后，自己不会受伤。";
  const typography = resolveTypography({
    text,
    role: "reversal",
    typography: {
      displayLines: [text],
      emphasis: ["不会受伤"],
      layout: "reversal",
      alignment: "left",
      revealOrder: [0]
    }
  }, { index: 3, total: 5 });

  assert.equal(typography.source, "deepseek-refined");
  assert.ok(typography.lines.length > 1);
  assert.equal(typography.lines.join(""), text);
});

test("falls back locally when AI display lines alter the original copy", () => {
  const text = "他很想靠近你，却又害怕关系发展得太快。";
  const typography = resolveTypography({
    text,
    role: "conflict",
    typography: {
      displayLines: ["他很想接近你，却又害怕关系发展得太快。"],
      layout: "conflict"
    }
  }, { index: 2, total: 5 });

  assert.equal(typography.source, "local-fallback");
  assert.equal(typography.lines.join(""), text);
});

test("uses the copy ordinal for numbered points instead of the scene index", () => {
  assert.equal(extractContentOrdinal("第一，他会记住你的小事。"), 1);
  assert.equal(extractContentOrdinal("第二：他会留意你的情绪。"), 2);
  assert.equal(extractContentOrdinal("3. 他会慢慢靠近你。"), 3);
  assert.equal(extractContentOrdinal("他会慢慢靠近你。"), null);

  const typography = resolveTypography({
    text: "第一，他会记住你的小事。",
    role: "analysis",
    typography: {
      displayLines: ["第一，他会记住", "你的小事。"],
      layout: "analysis"
    }
  }, { index: 1, total: 5 });
  assert.equal(typography.layout, "list");
});

test("aligns each display line to MiniMax word timestamps", () => {
  const schedule = lineRevealSchedule({
    text: "先观察。再靠近。",
    start: 10,
    wordTimings: [
      { text: "先观察。", charStart: 0, charEnd: 4, start: 10, end: 11.7 },
      { text: "再靠近。", charStart: 4, charEnd: 8, start: 11.8, end: 13.5 }
    ]
  }, ["先观察。", "再靠近。"]);

  assert.deepEqual(schedule, [10, 11.8]);
});

test("falls back to duration timing when word timestamps are unavailable", () => {
  assert.equal(lineRevealSchedule({ text: "先观察。再靠近。", start: 0 }, ["先观察。", "再靠近。"]), null);
});
