import path from "node:path";
import sharp from "sharp";

const zodiacWords = [
  "白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座",
  "天秤座", "天蝎座", "射手座", "摩羯座", "水瓶座", "双鱼座"
];

const emotionWords = [
  "真正动心", "害怕失去", "安全感", "边界感", "反差感", "灵魂伴侣",
  "慢热", "敏感", "温柔", "安静", "清醒", "心软", "动心", "喜欢", "失去",
  "暧昧", "恋爱", "真心", "主动", "坚定", "共情", "浪漫"
];

const layoutLabels = {
  hook: "OPENING HOOK",
  analysis: "RELATIONSHIP NOTE",
  list: "KEY POINT",
  conflict: "INNER CONFLICT",
  reversal: "POINT OF VIEW",
  interaction: "留 给 你"
};

const typographySizes = new Set(["hero", "large", "standard"]);
const typographyEffects = new Set(["rise", "slide", "punch", "typewriter", "float"]);
const typographyAccents = new Set(["gradient", "glow", "outline", "underline"]);
const sceneTransitions = new Set(["none", "push", "zoom"]);

const chineseOrdinals = new Map([
  ["一", 1], ["二", 2], ["三", 3], ["四", 4], ["五", 5],
  ["六", 6], ["七", 7], ["八", 8], ["九", 9], ["十", 10]
]);

const fontThemes = {
  poetic: {
    titleFamily: "'Xingkai SC','Kaiti SC','STKaiti',serif",
    bodyFamily: "'Kaiti SC','STKaiti','Songti SC',serif",
    closingFamily: "'Xingkai SC','Kaiti SC','STKaiti',serif",
    titleWeight: 400,
    bodyWeight: 600,
    titleHeroSize: 82,
    titleCompactSize: 57,
    bodyHeroSize: 72,
    bodySize: 69,
    closingSize: 78,
    titleSpacing: 4,
    bodySpacing: 2
  },
  editorial: {
    titleFamily: "'Songti SC','STSong','Songti TC',serif",
    bodyFamily: "'PingFang SC','Hiragino Sans GB',sans-serif",
    closingFamily: "'Songti SC','STSong','Songti TC',serif",
    titleWeight: 700,
    bodyWeight: 700,
    titleHeroSize: 78,
    titleCompactSize: 52,
    bodyHeroSize: 69,
    bodySize: 66,
    closingSize: 70,
    titleSpacing: 2,
    bodySpacing: 1
  },
  engraved: {
    titleFamily: "'Weibei SC','STKaiti','Songti SC',serif",
    bodyFamily: "'Lantinghei SC','PingFang SC','Hiragino Sans GB',sans-serif",
    closingFamily: "'Weibei SC','STKaiti','Songti SC',serif",
    titleWeight: 700,
    bodyWeight: 600,
    titleHeroSize: 76,
    titleCompactSize: 51,
    bodyHeroSize: 68,
    bodySize: 65,
    closingSize: 72,
    titleSpacing: 3,
    bodySpacing: 1
  }
};

function escapeXml(value) {
  return String(value)
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function normalizeText(value) {
  return String(value).replace(/\s+/gu, "").trim();
}

const wordSegmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
const protectedWords = [
  ...zodiacWords,
  ...zodiacWords.map((word) => word.replace(/座$/u, "")),
  ...emotionWords
].sort((a, b) => b.length - a.length);
const protectedPattern = new RegExp(
  `(?:${protectedWords.join("|")}|[EI][NS][TF][JP]|[A-Za-z0-9]+)`,
  "gu"
);
const trailingPunctuation = /^[，。！？：；、,.!?;:）】》”’]+$/u;
const awkwardLineStarter = /^(?:的|了|地|得|吗|呢|吧|后|而且|并且|以及|却|但是|所以|因此)$/u;
const awkwardLineEnding = /^(?:因为|虽然|不是|如果|即使|哪怕|只有|只要)$/u;

function visualUnits(value) {
  return [...value].reduce((total, character) => {
    if (/[A-Z0-9]/u.test(character)) return total + 0.68;
    if (/[a-z]/u.test(character)) return total + 0.54;
    return total + 1;
  }, 0);
}

function segmentWords(value) {
  const tokens = [];
  let cursor = 0;
  for (const match of value.matchAll(protectedPattern)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      tokens.push(...[...wordSegmenter.segment(value.slice(cursor, start))].map((part) => part.segment));
    }
    tokens.push(match[0]);
    cursor = start + match[0].length;
  }
  if (cursor < value.length) {
    tokens.push(...[...wordSegmenter.segment(value.slice(cursor))].map((part) => part.segment));
  }
  return tokens.filter(Boolean);
}

export function wrapText(value, limit) {
  const clean = normalizeText(value);
  if (!clean) return [];

  const tokens = segmentWords(clean);
  const totalUnits = visualUnits(clean);
  const lineCount = Math.max(1, Math.min(6, Math.ceil(totalUnits / limit)));
  const lines = [];
  let cursor = 0;

  for (let lineIndex = 0; lineIndex < lineCount && cursor < tokens.length; lineIndex += 1) {
    const linesLeft = lineCount - lineIndex;
    const rest = tokens.slice(cursor);
    const target = rest.reduce((sum, token) => sum + visualUnits(token), 0) / linesLeft;
    const line = [];
    let lineUnits = 0;

    while (cursor < tokens.length) {
      const token = tokens[cursor];
      const tokenUnits = visualUnits(token);
      if (line.length && !trailingPunctuation.test(token)) {
        if (lineUnits + tokenUnits > limit) break;
        const currentDistance = Math.abs(target - lineUnits);
        const addedDistance = Math.abs(target - (lineUnits + tokenUnits));
        if (lineUnits >= target || (currentDistance <= addedDistance && lineUnits >= target * 0.72)) break;
      }
      line.push(token);
      lineUnits += tokenUnits;
      cursor += 1;
    }

    while (cursor < tokens.length && trailingPunctuation.test(tokens[cursor])) {
      line.push(tokens[cursor]);
      cursor += 1;
    }
    lines.push(line);
  }

  if (cursor < tokens.length) {
    lines[lines.length - 1].push(...tokens.slice(cursor));
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (awkwardLineStarter.test(lines[index][0]) && lines[index - 1].length > 1) {
      lines[index].unshift(lines[index - 1].pop());
    }
    if (awkwardLineEnding.test(lines[index - 1].at(-1)) && lines[index].length > 1) {
      lines[index].unshift(lines[index - 1].pop());
    }
  }
  return lines.map((line) => line.join(""));
}

function defaultLayout(scene, index, total) {
  if (scene?.role === "interaction" || (total > 1 && index === total - 1)) return "interaction";
  if (scene?.role === "hook" || index === 0) return "hook";
  if (extractContentOrdinal(scene?.text) !== null) return "list";
  if (["conflict", "reversal"].includes(scene?.role)) return scene.role;
  return "analysis";
}

export function extractContentOrdinal(value) {
  const clean = normalizeText(value);
  const chineseMatch = clean.match(/^第([一二三四五六七八九十])[、，,。：:.]?/u);
  if (chineseMatch) return chineseOrdinals.get(chineseMatch[1]) ?? null;
  const arabicMatch = clean.match(/^(\d{1,2})[、，,。：:.]/u);
  if (!arabicMatch) return null;
  const ordinal = Number(arabicMatch[1]);
  return ordinal > 0 ? ordinal : null;
}

export function resolveTypography(scene, { index = 0, total = 1, tag = "" } = {}) {
  const fallbackLayout = defaultLayout(scene, index, total);
  const requestedLayout = scene?.typography?.layout;
  const layout = extractContentOrdinal(scene?.text) !== null
    ? "list"
    : Object.hasOwn(layoutLabels, requestedLayout) ? requestedLayout : fallbackLayout;
  const lineLimit = layout === "interaction" ? 10 : 12;
  const requestedLines = Array.isArray(scene?.typography?.displayLines)
    ? scene.typography.displayLines.map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  const aiLinesAreExact = requestedLines.length > 0
    && requestedLines.length <= 5
    && normalizeText(requestedLines.join("")) === normalizeText(scene?.text);
  const aiLinesAreSafe = aiLinesAreExact
    && requestedLines.every((line) => visualUnits(normalizeText(line)) <= lineLimit + 0.8);
  const refinedLines = aiLinesAreExact
    ? requestedLines.flatMap((line) => (
      visualUnits(normalizeText(line)) <= lineLimit + 0.8 ? [line] : wrapText(line, lineLimit)
    ))
    : [];
  const lines = aiLinesAreExact ? refinedLines : wrapText(scene?.text, lineLimit);
  const requestedHighlights = Array.isArray(scene?.typography?.emphasis)
    ? scene.typography.emphasis
      .map((term) => String(term || "").trim())
      .filter((term) => term && normalizeText(scene?.text).includes(normalizeText(term)))
      .slice(0, 3)
    : [];
  const fallbackOrder = lines.map((_, lineIndex) => lineIndex);
  const requestedOrder = scene?.typography?.revealOrder;
  const revealOrder = aiLinesAreSafe
    && Array.isArray(requestedOrder)
    && requestedOrder.length === lines.length
    && [...requestedOrder].sort((left, right) => left - right)
      .every((value, orderIndex) => value === fallbackOrder[orderIndex])
    ? requestedOrder
    : fallbackOrder;
  const defaultSize = lines.length <= 2 || ["hook", "reversal"].includes(layout)
    ? "hero"
    : lines.length <= 3 ? "large" : "standard";
  const requestedSize = scene?.typography?.size;
  const size = typographySizes.has(requestedSize) ? requestedSize : defaultSize;
  const effectSequence = ["rise", "float", "slide"];
  const defaultEffect = layout === "list"
    ? "slide"
    : layout === "hook" ? "typewriter"
      : ["conflict", "reversal"].includes(layout) ? "punch"
        : layout === "interaction" ? "float" : effectSequence[index % effectSequence.length];
  const defaultAccentStyle = ["hook", "reversal"].includes(layout)
    ? "gradient"
    : layout === "conflict" ? "outline" : "underline";
  const defaultTransition = ["hook", "reversal"].includes(layout)
    ? "zoom"
    : layout === "list" ? "push" : "none";

  return {
    lines,
    highlights: requestedHighlights.length ? requestedHighlights : pickHighlights(scene?.text, tag),
    layout,
    alignment: scene?.typography?.alignment === "center" ? "center" : "left",
    size,
    effect: typographyEffects.has(scene?.typography?.effect)
      ? scene.typography.effect
      : defaultEffect,
    accentStyle: typographyAccents.has(scene?.typography?.accentStyle)
      ? scene.typography.accentStyle
      : defaultAccentStyle,
    transition: sceneTransitions.has(scene?.typography?.transition)
      ? scene.typography.transition
      : defaultTransition,
    revealOrder,
    source: aiLinesAreSafe ? "deepseek" : aiLinesAreExact ? "deepseek-refined" : "local-fallback"
  };
}

function tagTerms(tag) {
  return normalizeText(tag)
    .split(/[×xX·|/]/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .flatMap((term) => [term, term.replace(/座$/u, "")]);
}

function pickHighlights(text, tag) {
  const clean = normalizeText(text);
  const mbti = clean.match(/[EI][NS][TF][JP]/u)?.[0];
  const candidates = [
    ...tagTerms(tag),
    ...zodiacWords,
    ...zodiacWords.map((word) => word.replace(/座$/u, "")),
    mbti,
    ...emotionWords
  ].filter(Boolean);

  return [...new Set(candidates)]
    .filter((candidate) => clean.includes(candidate))
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
}

function richLine(line, highlights, accentClass = "accent") {
  const match = highlights
    .filter((term) => line.includes(term))
    .sort((a, b) => b.length - a.length)[0];
  if (!match) return escapeXml(line);

  const start = line.indexOf(match);
  return `${escapeXml(line.slice(0, start))}<tspan class="${accentClass}">${escapeXml(match)}</tspan>${escapeXml(line.slice(start + match.length))}`;
}

function textLines(lines, { x, y, lineHeight, className, anchor = "start", highlights = [], accentClass = "accent", fontSize = null, visibleLines = lines.length, lineIndices = null }) {
  const indices = Array.isArray(lineIndices)
    ? lineIndices
    : lines.map((_, index) => index).slice(0, visibleLines);
  const sizeAttribute = Number.isFinite(fontSize) ? ` font-size="${fontSize}"` : "";
  return indices
    .map((index) => (
      `<text x="${x}" y="${y + index * lineHeight}" text-anchor="${anchor}" class="${className}"${sizeAttribute}>${richLine(lines[index], highlights, accentClass)}</text>`
    ))
    .join("");
}

function bodyMetrics(scene, fontTheme, kind = "body") {
  const { lines, size } = scene.renderTypography;
  const base = kind === "closing"
    ? fontTheme.closingSize
    : kind === "hero" ? fontTheme.bodyHeroSize : fontTheme.bodySize;
  const scale = size === "hero" ? 1.12 : size === "standard" ? 0.9 : 1;
  const longestLine = Math.max(...lines.map((line) => visualUnits(normalizeText(line))), 1);
  const widthLimit = scene.renderTypography.alignment === "center" ? 900 : 912;
  const fontSize = Math.max(52, Math.min(Math.round(base * scale), Math.floor(widthLimit / longestLine)));
  return {
    fontSize,
    lineHeight: Math.round(fontSize * 1.46)
  };
}

function accentClass(scene) {
  const style = scene.renderTypography.accentStyle;
  return `accent accent-${style}`;
}

function topMatter({ title, tag, compact = false }) {
  const titleLines = wrapText(title, compact ? 14 : 10).slice(0, 2);
  const titleY = compact ? 330 : 430;
  const titleSizeClass = compact ? "titleCompact" : "titleHero";

  return `
    <circle cx="73" cy="101" r="5" fill="#f4c781"/>
    <text x="96" y="111" class="brand">星格观察局</text>
    <text x="1008" y="111" text-anchor="end" class="brandEn">XINGGE NOTES</text>
    <line x1="72" y1="145" x2="1008" y2="145" class="hairline"/>
    <text x="72" y="238" class="eyebrow">${escapeXml(tag)}</text>
    ${textLines(titleLines, {
      x: 72,
      y: titleY,
      lineHeight: compact ? 70 : 100,
      className: titleSizeClass,
      highlights: tagTerms(tag),
      accentClass: "titleAccent"
    })}
  `;
}

function openingLayout({ title, tag, scene, phase, fontTheme, lineIndex = 0 }) {
  const { lines, highlights, alignment } = scene.renderTypography;
  const metrics = bodyMetrics(scene, fontTheme, "hero");
  const startY = 950 - Math.max(0, lines.length - 2) * Math.round(metrics.lineHeight * 0.28);
  const centered = alignment === "center";
  const x = centered ? 540 : 72;
  const anchor = centered ? "middle" : "start";

  if (phase === "reveal") {
    return textLines(lines, {
      x,
      y: startY,
      lineHeight: metrics.lineHeight,
      className: "bodyHero",
      fontSize: metrics.fontSize,
      anchor,
      highlights,
      accentClass: accentClass(scene),
      lineIndices: [lineIndex]
    });
  }

  const lineIndices = phase === "base" ? [lineIndex] : null;

  return `
    ${topMatter({ title, tag })}
    <line x1="72" y1="744" x2="242" y2="744" class="accentRule"/>
    ${textLines(lines, {
      x,
      y: startY,
      lineHeight: metrics.lineHeight,
      className: "bodyHero",
      fontSize: metrics.fontSize,
      anchor,
      highlights,
      accentClass: accentClass(scene),
      lineIndices
    })}
  `;
}

function insightLayout({ title, tag, scene, phase, fontTheme, lineIndex = 0 }) {
  const { lines, highlights, layout, alignment } = scene.renderTypography;
  const metrics = bodyMetrics(scene, fontTheme, "body");
  const startY = 790 - Math.max(0, lines.length - 2) * Math.round(metrics.lineHeight * 0.3);
  const centered = alignment === "center";
  const x = centered ? 540 : 72;
  const anchor = centered ? "middle" : "start";
  const sectionLabel = layoutLabels[layout] || layoutLabels.analysis;
  const className = layout === "reversal"
    ? "body bodyReversal"
    : layout === "conflict" ? "body bodyConflict" : "body";

  if (phase === "reveal") {
    return textLines(lines, {
      x,
      y: startY,
      lineHeight: metrics.lineHeight,
      className,
      fontSize: metrics.fontSize,
      anchor,
      highlights,
      accentClass: accentClass(scene),
      lineIndices: [lineIndex]
    });
  }

  const lineIndices = phase === "base" ? [lineIndex] : null;

  return `
    ${topMatter({ title, tag, compact: true })}
    <text x="72" y="617" class="sectionLabel">${sectionLabel}</text>
    <line x1="72" y1="640" x2="308" y2="640" class="accentRule"/>
    ${textLines(lines, {
      x,
      y: startY,
      lineHeight: metrics.lineHeight,
      className,
      fontSize: metrics.fontSize,
      anchor,
      highlights,
      accentClass: accentClass(scene),
      lineIndices
    })}
  `;
}

function closingLayout({ title, tag, scene, phase, fontTheme, lineIndex = 0 }) {
  const { lines, highlights } = scene.renderTypography;
  const metrics = bodyMetrics(scene, fontTheme, "closing");
  const startY = 790 - Math.max(0, lines.length - 2) * Math.round(metrics.lineHeight * 0.32);

  if (phase === "reveal") {
    return textLines(lines, {
      x: 540,
      y: startY,
      lineHeight: metrics.lineHeight,
      className: "bodyClosing",
      fontSize: metrics.fontSize,
      anchor: "middle",
      highlights,
      accentClass: accentClass(scene),
      lineIndices: [lineIndex]
    });
  }

  const lineIndices = phase === "base" ? [lineIndex] : null;

  return `
    ${topMatter({ title, tag, compact: true })}
    <text x="540" y="625" text-anchor="middle" class="closingLabel">留 给 你</text>
    <line x1="460" y1="667" x2="620" y2="667" class="accentRule"/>
    ${textLines(lines, {
      x: 540,
      y: startY,
      lineHeight: metrics.lineHeight,
      className: "bodyClosing",
      fontSize: metrics.fontSize,
      anchor: "middle",
      highlights,
      accentClass: accentClass(scene),
      lineIndices
    })}
    <text x="540" y="1230" text-anchor="middle" class="closingHint">你也有过这种感受吗？</text>
    <text x="540" y="1290" text-anchor="middle" class="closingHintMuted">在评论区留下你的星座 × MBTI</text>
  `;
}

function footer({ index, total }) {
  const progressWidth = Math.max(72, Math.round(936 * ((index + 1) / total)));
  return `
    <rect x="72" y="1806" width="936" height="4" rx="2" fill="rgba(255,255,255,.16)"/>
    <rect x="72" y="1806" width="${progressWidth}" height="4" rx="2" fill="url(#bar)"/>
  `;
}

export function buildCaptionFrameSvg({ title, tag, fontStyle, scene, index, total, phase, lineIndex }) {
  const layout = scene.renderTypography.layout;
  const fontTheme = fontThemes[fontStyle] || fontThemes.poetic;
  const content = layout === "hook"
    ? openingLayout({ title, tag, scene, phase, fontTheme, lineIndex })
    : layout === "interaction"
      ? closingLayout({ title, tag, scene, index, phase, fontTheme, lineIndex })
      : insightLayout({ title, tag, scene, index, phase, fontTheme, lineIndex });

  return `
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.62"/>
        </filter>
        <filter id="accentGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" result="blur"/>
          <feFlood flood-color="#ff8fa2" flood-opacity=".72"/>
          <feComposite in2="blur" operator="in"/>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ff9bab"/>
          <stop offset="0.56" stop-color="#f3a5bb"/>
          <stop offset="1" stop-color="#f4c781"/>
        </linearGradient>
        <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#ff8fa2"/>
          <stop offset="0.68" stop-color="#c79bf4"/>
          <stop offset="1" stop-color="#f4c781"/>
        </linearGradient>
        <linearGradient id="accentText" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ff8fa2"/>
          <stop offset=".5" stop-color="#d69bff"/>
          <stop offset="1" stop-color="#ffd58f"/>
        </linearGradient>
      </defs>
      <style>
        .brand { font: 600 28px 'PingFang SC','Hiragino Sans GB',sans-serif; letter-spacing: 5px; fill: rgba(255,255,255,.82); }
        .brandEn { font: 500 20px 'Helvetica Neue',Arial,sans-serif; letter-spacing: 4px; fill: rgba(255,255,255,.42); }
        .hairline { stroke: rgba(255,255,255,.18); stroke-width: 1; }
        .eyebrow { font: 600 26px 'PingFang SC','Hiragino Sans GB',sans-serif; letter-spacing: 4px; fill: #f4c781; }
        .titleHero { font-family: ${fontTheme.titleFamily}; font-size: ${fontTheme.titleHeroSize}px; font-weight: ${fontTheme.titleWeight}; letter-spacing: ${fontTheme.titleSpacing}px; fill: #fff9f5; filter: url(#shadow); }
        .titleCompact { font-family: ${fontTheme.titleFamily}; font-size: ${fontTheme.titleCompactSize}px; font-weight: ${fontTheme.titleWeight}; letter-spacing: ${fontTheme.titleSpacing}px; fill: rgba(255,249,245,.92); filter: url(#shadow); }
        .titleAccent { fill: #ff9bab; }
        .sectionLabel { font: 500 20px 'Helvetica Neue',Arial,sans-serif; letter-spacing: 4px; fill: rgba(255,255,255,.5); }
        .accentRule { stroke: url(#accent); stroke-width: 3; stroke-linecap: round; }
        .bodyHero { font-family: ${fontTheme.bodyFamily}; font-size: ${fontTheme.bodyHeroSize}px; font-weight: ${fontTheme.bodyWeight}; letter-spacing: ${fontTheme.bodySpacing}px; fill: #ffffff; filter: url(#shadow); }
        .body { font-family: ${fontTheme.bodyFamily}; font-size: ${fontTheme.bodySize}px; font-weight: ${fontTheme.bodyWeight}; letter-spacing: ${fontTheme.bodySpacing}px; fill: #ffffff; filter: url(#shadow); }
        .bodyConflict { fill: #fff4f0; }
        .bodyReversal { fill: #fffaf1; }
        .bodyClosing { font-family: ${fontTheme.closingFamily}; font-size: ${fontTheme.closingSize}px; font-weight: ${fontTheme.titleWeight}; letter-spacing: ${fontTheme.titleSpacing}px; fill: #fffdf9; filter: url(#shadow); }
        .accent { font-size: 1.07em; font-weight: 800; }
        .accent-gradient { fill: url(#accentText); }
        .accent-glow { fill: #fff2f5; filter: url(#accentGlow); }
        .accent-outline { fill: #fff8f8; stroke: #ff8fa2; stroke-width: 2px; paint-order: stroke fill; }
        .accent-underline { fill: #ffadc0; text-decoration: underline; text-decoration-color: #f4c781; }
        .closingLabel { font: 600 27px 'PingFang SC','Hiragino Sans GB',sans-serif; letter-spacing: 12px; fill: #f4c781; }
        .closingHint { font: 600 31px 'PingFang SC','Hiragino Sans GB',sans-serif; letter-spacing: 2px; fill: rgba(255,255,255,.88); }
        .closingHintMuted { font: 400 26px 'PingFang SC','Hiragino Sans GB',sans-serif; letter-spacing: 1px; fill: rgba(255,255,255,.5); }
      </style>
      ${content}
      ${phase === "reveal" ? "" : footer({ index, total })}
    </svg>
  `;
}

function originalOffsetAtCompactOffset(value, compactOffset) {
  let compactCursor = 0;
  for (let index = 0; index < String(value || "").length; index += 1) {
    if (/\s/u.test(value[index])) continue;
    if (compactCursor === compactOffset) return index;
    compactCursor += 1;
  }
  return String(value || "").length;
}

export function lineRevealSchedule(scene, lines) {
  if (!Array.isArray(scene?.wordTimings) || !scene.wordTimings.length || lines.length <= 1) {
    return null;
  }

  let compactCursor = 0;
  const starts = lines.map((line, lineIndex) => {
    const originalOffset = originalOffsetAtCompactOffset(scene.text, compactCursor);
    compactCursor += normalizeText(line).length;
    if (lineIndex === 0) return Number(scene.start);
    const timing = scene.wordTimings.find((word) => Number(word.charEnd) > originalOffset);
    const start = Number(timing?.start);
    return Number.isFinite(start) ? start : null;
  });

  return starts.slice(1).every(Number.isFinite) ? starts : null;
}

function framePhases(scene, typography) {
  const syncSchedule = lineRevealSchedule(scene, typography.lines);
  const revealOrder = syncSchedule
    ? typography.lines.map((_, index) => index)
    : typography.revealOrder;
  const lineCount = revealOrder.length;
  if (scene.duration < 1.5 || lineCount <= 1) {
    return [{ name: "full", start: scene.start, end: scene.end }];
  }

  const firstRevealAt = scene.start + Math.max(0.65, scene.duration * 0.28);
  const revealGap = Math.min(0.9, Math.max(0.42, scene.duration * 0.18));
  const phases = [{ name: "base", lineIndex: revealOrder[0], start: scene.start, end: scene.end }];

  for (let orderIndex = 1; orderIndex < lineCount; orderIndex += 1) {
    const lineIndex = revealOrder[orderIndex];
    const latestStart = scene.end - Math.max(0.35, (lineCount - orderIndex - 1) * 0.3);
    const fallbackStart = firstRevealAt + (orderIndex - 1) * revealGap;
    const synchronizedStart = syncSchedule?.[lineIndex];
    const intendedStart = Number.isFinite(synchronizedStart)
      ? Math.max(scene.start + 0.12, synchronizedStart)
      : fallbackStart;
    phases.push({
      name: "reveal",
      fileLabel: `reveal-${String(orderIndex + 1).padStart(2, "0")}`,
      lineIndex,
      timingSource: Number.isFinite(synchronizedStart) ? "minimax-word" : "duration-fallback",
      start: Math.min(latestStart, intendedStart),
      end: scene.end
    });
  }
  return phases;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(items.length, Math.floor(concurrency) || 1)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index], index);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

export async function createCaptionFrames({
  directory,
  title,
  tag,
  fontStyle = "poetic",
  scenes,
  concurrency = 4
}) {
  const frameJobs = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const renderTypography = resolveTypography(scenes[index], {
      index,
      total: scenes.length,
      tag
    });
    const renderScene = { ...scenes[index], renderTypography };
    const phases = framePhases(renderScene, renderTypography);
    for (const phase of phases) {
      const filePath = path.join(
        directory,
        `caption-${String(index + 1).padStart(2, "0")}-${phase.fileLabel || phase.name}.png`
      );
      const svg = buildCaptionFrameSvg({
        title,
        tag,
        fontStyle,
        scene: renderScene,
        index,
        total: scenes.length,
        phase: phase.name,
        lineIndex: phase.lineIndex
      });
      frameJobs.push({
        svg,
        frame: {
          ...renderScene,
          ...phase,
          filePath,
          effect: renderTypography.effect,
          transition: renderTypography.transition,
          accentStyle: renderTypography.accentStyle,
          size: renderTypography.size,
          fadeDuration: Math.min(0.24, Math.max(0.12, (phase.end - phase.start) * 0.14))
        },
        filePath,
      });
    }
  }

  return mapWithConcurrency(frameJobs, concurrency, async ({ svg, filePath, frame }) => {
    await sharp(Buffer.from(svg)).png().toFile(filePath);
    return frame;
  });
}
