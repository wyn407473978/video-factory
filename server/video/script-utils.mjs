const sentenceBoundary = /(?<=[。！？!?；;])/u;

export function countReadableChars(text = "") {
  return text.replace(/\s+/gu, "").length;
}

function chunkLongSentence(sentence, limit) {
  if (sentence.length <= limit) return [sentence];

  const chunks = [];
  let rest = sentence;
  while (rest.length > limit) {
    const window = rest.slice(0, limit + 1);
    const preferredBreak = Math.max(
      window.lastIndexOf("，"),
      window.lastIndexOf(","),
      window.lastIndexOf("："),
      window.lastIndexOf(":"),
      window.lastIndexOf("、")
    );
    const splitAt = preferredBreak >= Math.floor(limit * 0.55) ? preferredBreak + 1 : limit;
    chunks.push(rest.slice(0, splitAt).trim());
    rest = rest.slice(splitAt).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function splitScript(text = "", options = {}) {
  const maxSceneChars = options.maxSceneChars ?? 34;
  const paragraphs = text
    .replace(/\r/gu, "")
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);

  const scenes = paragraphs.flatMap((paragraph) =>
    paragraph
      .split(sentenceBoundary)
      .map((sentence) => sentence.trim())
      .filter(Boolean)
      .flatMap((sentence) => chunkLongSentence(sentence, maxSceneChars))
  );

  return scenes.length ? scenes : ["请先输入视频文案。"];
}

export function estimateDuration(text = "", pace = 3.4) {
  const safePace = Number.isFinite(Number(pace)) ? Math.max(2, Math.min(5, Number(pace))) : 3.4;
  return Math.max(8, Math.ceil(countReadableChars(text) / safePace + 4.5));
}

export function allocateSceneTimings(scenes, totalDuration) {
  const safeScenes = scenes.length ? scenes : ["请先输入视频文案。"];
  const weights = safeScenes.map((scene) => Math.max(4, countReadableChars(scene)));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;

  return safeScenes.map((text, index) => {
    const isLast = index === safeScenes.length - 1;
    const share = weights[index] / totalWeight;
    const end = isLast ? totalDuration : Math.min(totalDuration, cursor + totalDuration * share);
    const scene = {
      id: `scene-${index + 1}`,
      index,
      text,
      start: Number(cursor.toFixed(3)),
      end: Number(end.toFixed(3)),
      duration: Number((end - cursor).toFixed(3))
    };
    cursor = end;
    return scene;
  });
}

export function sanitizeFilename(value = "video") {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "-")
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 64);
  return normalized || "xingge-video";
}

export function speechRateForPace(pace = 3.4) {
  const numericPace = Number(pace);
  if (numericPace >= 3.9) return 220;
  if (numericPace <= 2.9) return 150;
  return 185;
}
