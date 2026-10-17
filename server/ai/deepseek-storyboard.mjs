import {
  EMOTION_ROLE_CONFIG,
  classifyEmotionRole
} from "../../shared/emotion-director.mjs";

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-flash";
const ROLES = new Set(Object.keys(EMOTION_ROLE_CONFIG));
const EMOTIONS = new Set(["calm", "happy", "sad", "fearful", "surprised"]);
const TYPOGRAPHY_LAYOUTS = new Set(["hook", "analysis", "list", "conflict", "reversal", "interaction"]);
const TYPOGRAPHY_ALIGNMENTS = new Set(["left", "center"]);
const TYPOGRAPHY_SIZES = new Set(["hero", "large", "standard"]);
const TYPOGRAPHY_EFFECTS = new Set(["rise", "slide", "punch", "typewriter", "float"]);
const TYPOGRAPHY_ACCENTS = new Set(["gradient", "glow", "outline", "underline"]);
const SCENE_TRANSITIONS = new Set(["none", "push", "zoom"]);
const MAX_SCENE_CHARACTERS = 64;

const SYSTEM_PROMPT = `你是一名中文情感短视频导演。先理解整篇文案的观点、上下文和整体情绪弧线，再规划画面镜头和连续的配音语气段，最后输出严格的 JSON。不要逐句孤立判断情绪。

必须遵守：
1. 不得改写、增删、纠错或调整原文字符；所有 scenes.text 去除空白后拼接，必须与原文去除空白后完全一致。
2. 每个镜头必须表达完整语义。优先在段落、句号、问号、感叹号或分号处切分；不要仅因为出现逗号或冒号就切分，不得拆开主从句、转折、因果、条件或递进关系。
3. 单个镜头通常 18～48 个可读字符，最长 64 个；100～200 字文案通常只需 4～8 个镜头。短句可以独立成镜，但不要为了镜头数量把一句完整的话切碎。若原文使用“第一、第二、第三”或“1.、2.、3.”列举，每一个编号条目必须独立成镜头，禁止把两个编号条目合并。
4. 先为全文规划连续的情绪阶段，再填写每个镜头。deliveryGroup 从 0 开始且只能在真正的情绪阶段变化时递增；同一 deliveryGroup 必须连续并使用完全相同的 emotion、speedMultiplier 和 pitch。
5. 200 字以内通常使用 2～4 个 deliveryGroup，禁止每句话单独建立语气段。除开场钩子和结尾互动外，避免只有一个短镜头的语气段。
6. 相邻语气段要平滑衔接；只有在明确的情感矛盾、观点反转或结尾互动处才明显换情绪。整体以自然叙述为主，避免连续在 surprised、sad、happy 之间跳跃。
7. role 只能是 hook、analysis、conflict、reversal、interaction。
8. emotion 只能是 calm、happy、sad、fearful、surprised，并结合全文语境选择；不要把普通陈述判断成强烈情绪。
9. speedMultiplier 范围 0.85～1.15；pitch 范围 -2～2；pauseAfter 范围 0.15～1.20 秒。相邻语气段速度差建议不超过 0.12，音调差不超过 1。
10. 开头有吸引力但不过度夸张，中段自然连贯，矛盾处略放慢，反转处适度加强，互动结尾温暖轻快。
11. 你还要为每个镜头担任“动态文字导演”，填写 typography。整条视频主要由文字承载，所以必须让字号、断句、强调与动效共同形成节奏，但每个镜头最多使用一种主入场动效，避免花哨堆叠：
   - displayLines：把该镜头原文拆成 1～5 个有完整语义、便于扫读的显示行。不得改动任何字符；去除空白后拼接必须与该镜头 text 完全一致。hook、analysis、list、conflict、reversal 每行 6～12 个中文字符为宜，interaction 每行 4～10 个中文字符；英文与数字可按半个中文字符估算。优先让各行视觉长度接近，禁止出现只有 1～3 个字的孤行。不要把固定词组、星座、MBTI 拆开；不要让标点或“的、了、地、得、吗、呢、吧”单独开头；“因为/所以”“虽然/但是”“不是/而是”等成对关系应按完整语义断行。
   - emphasis：0～3 个需要视觉强调的原文词语，必须是 text 中连续出现的原文子串，优先选择星座、MBTI、关系动作、矛盾或反转关键词。
   - layout：只能是 hook、analysis、list、conflict、reversal、interaction。枚举含义依次为大字钩子、稳定分析、条目重点、情感矛盾、观点反转、结尾互动。
   - alignment：只能是 left 或 center。分析与条目通常左对齐；互动和短促反转可居中。
   - size：只能是 hero、large、standard。短钩子、短反转用 hero；2～3 行主叙述用 large；4～5 行信息较多时用 standard。不要让连续三个镜头字号完全相同。
   - effect：只能是 rise、slide、punch、typewriter、float。情绪平稳用 rise/float，条目用 slide，冲突或反转可用 punch，短钩子可用 typewriter。相邻镜头尽量错开，不要全片只用一种。
   - accentStyle：只能是 gradient、glow、outline、underline。钩子/反转优先 gradient 或 glow，理性分析用 underline，冲突可用 outline。
   - transition：只能是 none、push、zoom。普通叙述用 none，让页面自然切换并只保留文字自身动效；条目推进用 push；钩子或观点反转用 zoom。禁止使用溶解、闪白、纯白遮罩等转场。
   - revealOrder：displayLines 的显示顺序，使用从 0 开始的行号；必须包含每一行且不重复。通常按 0,1,2 自上而下显示，只在反转镜头中可先显示关键行。
12. overallTone 用简短中文概括整篇基调，arcSummary 用一句中文概括情绪如何发展。
13. 只输出 JSON，不要输出 Markdown、思考过程或解释。

JSON 格式示例：
{"overallTone":"温柔克制","arcSummary":"从好奇引入，经过不安，最后温暖释然","scenes":[{"text":"原文片段。","role":"hook","deliveryGroup":0,"emotion":"calm","speedMultiplier":1.03,"pitch":0,"pauseAfter":0.35,"typography":{"displayLines":["原文片段。"],"emphasis":["原文"],"layout":"hook","alignment":"left","size":"hero","effect":"typewriter","accentStyle":"gradient","transition":"zoom","revealOrder":[0]}}]}`;

function compactText(value) {
  return String(value || "").replace(/\s+/gu, "");
}

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function readableLength(value) {
  return compactText(value).length;
}

function sanitizeTypography(typography, text, fallbackLayout) {
  if (!typography || typeof typography !== "object") return null;

  const displayLines = Array.isArray(typography.displayLines)
    ? typography.displayLines
      .map((line) => String(line || "").trim())
      .filter(Boolean)
      .slice(0, 5)
    : [];
  if (!displayLines.length || compactText(displayLines.join("")) !== compactText(text)) {
    return null;
  }

  const emphasis = Array.isArray(typography.emphasis)
    ? [...new Set(typography.emphasis
      .map((term) => String(term || "").trim())
      .filter((term) => term && compactText(text).includes(compactText(term))))]
      .slice(0, 3)
    : [];
  const layout = TYPOGRAPHY_LAYOUTS.has(typography.layout)
    ? typography.layout
    : fallbackLayout;
  const alignment = TYPOGRAPHY_ALIGNMENTS.has(typography.alignment)
    ? typography.alignment
    : layout === "interaction" ? "center" : "left";
  const defaultSize = displayLines.length <= 2 || ["hook", "reversal"].includes(layout)
    ? "hero"
    : displayLines.length <= 3 ? "large" : "standard";
  const defaultEffect = layout === "list"
    ? "slide"
    : ["conflict", "reversal"].includes(layout) ? "punch" : layout === "interaction" ? "float" : "rise";
  const defaultAccentStyle = ["hook", "reversal"].includes(layout)
    ? "gradient"
    : layout === "conflict" ? "outline" : "underline";
  const defaultTransition = ["hook", "reversal"].includes(layout)
    ? "zoom"
    : layout === "list" ? "push" : "none";
  const size = TYPOGRAPHY_SIZES.has(typography.size) ? typography.size : defaultSize;
  const effect = TYPOGRAPHY_EFFECTS.has(typography.effect) ? typography.effect : defaultEffect;
  const accentStyle = TYPOGRAPHY_ACCENTS.has(typography.accentStyle)
    ? typography.accentStyle
    : defaultAccentStyle;
  const transition = SCENE_TRANSITIONS.has(typography.transition)
    ? typography.transition
    : defaultTransition;
  const expectedOrder = displayLines.map((_, index) => index);
  const revealOrder = Array.isArray(typography.revealOrder)
    && typography.revealOrder.length === displayLines.length
    && [...typography.revealOrder].sort((left, right) => left - right)
      .every((value, index) => value === expectedOrder[index])
    ? typography.revealOrder.map(Number)
    : expectedOrder;

  return {
    displayLines,
    emphasis,
    layout,
    alignment,
    size,
    effect,
    accentStyle,
    transition,
    revealOrder
  };
}

function mergeSemanticFragments(items) {
  const merged = [];
  const weakEnding = /[，、：,:]$/u;
  const dependentOpening = /^(?:却|但|但是|而|只是|因为|所以|因此|反而|并且|同时|如果|即使|哪怕|直到|才|也|更)/u;

  for (const original of items) {
    const item = { ...original, text: String(original?.text || "").trim() };
    const previous = merged.at(-1);
    const combinedLength = previous
      ? readableLength(previous.text) + readableLength(item.text)
      : 0;
    const shouldMerge = previous
      && combinedLength <= MAX_SCENE_CHARACTERS
      && (weakEnding.test(previous.text) || dependentOpening.test(item.text));

    if (!shouldMerge) {
      merged.push(item);
      continue;
    }

    const strongerRole = ["conflict", "reversal", "interaction"].includes(item.role)
      ? item.role
      : previous.role;
    merged[merged.length - 1] = {
      ...previous,
      role: strongerRole,
      text: `${previous.text}${item.text}`,
      pauseAfter: item.pauseAfter ?? previous.pauseAfter,
      typography: null
    };
  }
  return merged;
}

function splitEnumeratedScenes(items) {
  const enumerationPattern = /(?:第[一二三四五六七八九十]|\d{1,2})[、，,。：:.]/gu;
  return items.flatMap((item) => {
    const text = String(item?.text || "");
    const markers = [...text.matchAll(enumerationPattern)];
    if (markers.length <= 1) return [item];

    return markers.map((marker, index) => {
      const start = index === 0 ? 0 : marker.index;
      const end = markers[index + 1]?.index ?? text.length;
      return {
        ...item,
        text: text.slice(start, end).trim(),
        typography: null
      };
    }).filter((scene) => scene.text);
  });
}

function splitLongSemanticScenes(items) {
  const result = [];
  for (const item of items) {
    if (readableLength(item.text) <= 48) {
      result.push(item);
      continue;
    }

    const sentences = String(item.text).match(/[^。！？!?；;]+[。！？!?；;]?/gu) || [item.text];
    if (sentences.length === 1) {
      result.push(item);
      continue;
    }

    let buffer = "";
    for (const sentence of sentences) {
      if (buffer && readableLength(buffer) + readableLength(sentence) > 48) {
        result.push({ ...item, text: buffer, typography: null });
        buffer = sentence;
      } else {
        buffer += sentence;
      }
    }
    if (buffer) result.push({ ...item, text: buffer, typography: null });
  }
  return result;
}

function startNewDefaultDeliveryGroup(scene, previous) {
  if (!previous) return false;
  if (previous.role === "hook" && scene.role !== "hook") return true;
  return scene.role !== previous.role
    && ["conflict", "reversal", "interaction"].includes(scene.role);
}

function assignDeliveryGroups(scenes) {
  let currentGroup = 0;
  let previousRawGroup = null;
  return scenes.map((scene, index) => {
    const rawValue = Number(scene.rawDeliveryGroup);
    const rawGroup = Number.isInteger(rawValue) && rawValue >= 0 ? rawValue : null;
    if (index > 0) {
      if (rawGroup !== null && previousRawGroup !== null) {
        if (rawGroup !== previousRawGroup) currentGroup += 1;
      } else if (startNewDefaultDeliveryGroup(scene, scenes[index - 1])) {
        currentGroup += 1;
      }
    }
    previousRawGroup = rawGroup;
    const { rawDeliveryGroup: _rawDeliveryGroup, ...cleanScene } = scene;
    return { ...cleanScene, deliveryGroup: currentGroup };
  });
}

function reduceDeliveryGroups(scenes, scriptLength) {
  const maximumGroups = Math.max(2, Math.min(8, Math.ceil(scriptLength / 60) + 1));
  const working = scenes.map((scene) => ({ ...scene }));

  const buildGroups = () => {
    const groups = [];
    for (const scene of working) {
      let group = groups.find((candidate) => candidate.id === scene.deliveryGroup);
      if (!group) {
        group = { id: scene.deliveryGroup, scenes: [], length: 0 };
        groups.push(group);
      }
      group.scenes.push(scene);
      group.length += readableLength(scene.text);
    }
    return groups;
  };

  while (buildGroups().length > maximumGroups) {
    const groups = buildGroups();
    const candidates = groups.slice(1, -1).length ? groups.slice(1, -1) : groups.slice(0, -1);
    const shortest = candidates.reduce((best, group) => group.length < best.length ? group : best);
    const index = groups.indexOf(shortest);
    const left = groups[index - 1];
    const right = groups[index + 1];
    const target = left && right
      ? (left.scenes.at(-1).emotion === shortest.scenes[0].emotion ? left : right)
      : (left || right);
    for (const scene of shortest.scenes) scene.deliveryGroup = target.id;
  }

  const ids = [...new Set(working.map((scene) => scene.deliveryGroup))];
  const normalizedIds = new Map(ids.map((id, index) => [id, index]));
  return working.map((scene) => ({
    ...scene,
    deliveryGroup: normalizedIds.get(scene.deliveryGroup)
  }));
}

function stabilizeDeliveryDirections(scenes) {
  const groups = new Map();
  for (const scene of scenes) {
    if (!groups.has(scene.deliveryGroup)) groups.set(scene.deliveryGroup, []);
    groups.get(scene.deliveryGroup).push(scene);
  }

  let previousDirection = null;
  for (const groupScenes of groups.values()) {
    const weights = new Map();
    for (const scene of groupScenes) {
      weights.set(scene.emotion, (weights.get(scene.emotion) || 0) + readableLength(scene.text));
    }
    const emotion = [...weights.entries()].sort((left, right) => right[1] - left[1])[0][0];
    const averageSpeed = groupScenes.reduce((sum, scene) => sum + scene.speedMultiplier, 0) / groupScenes.length;
    const averagePitch = groupScenes.reduce((sum, scene) => sum + scene.pitch, 0) / groupScenes.length;
    const speedMultiplier = Number(clamp(
      averageSpeed,
      previousDirection ? previousDirection.speedMultiplier - 0.12 : 0.85,
      previousDirection ? previousDirection.speedMultiplier + 0.12 : 1.15,
      1
    ).toFixed(2));
    const pitch = Math.round(clamp(
      averagePitch,
      previousDirection ? previousDirection.pitch - 1 : -2,
      previousDirection ? previousDirection.pitch + 1 : 2,
      0
    ));

    for (const scene of groupScenes) {
      scene.emotion = emotion;
      scene.speedMultiplier = speedMultiplier;
      scene.pitch = pitch;
    }
    previousDirection = { speedMultiplier, pitch };
  }
  return scenes;
}

function coalesceSimilarDeliveryGroups(scenes) {
  const groupDirections = new Map();
  for (const scene of scenes) {
    if (!groupDirections.has(scene.deliveryGroup)) {
      groupDirections.set(scene.deliveryGroup, {
        emotion: scene.emotion,
        speedMultiplier: scene.speedMultiplier,
        pitch: scene.pitch
      });
    }
  }

  const normalized = new Map();
  let previousDirection = null;
  let currentGroup = -1;
  for (const [originalGroup, direction] of groupDirections) {
    const canMerge = previousDirection
      && previousDirection.emotion === direction.emotion
      && Math.abs(previousDirection.speedMultiplier - direction.speedMultiplier) <= 0.12
      && Math.abs(previousDirection.pitch - direction.pitch) <= 1;
    if (!canMerge) currentGroup += 1;
    normalized.set(originalGroup, currentGroup);
    previousDirection = direction;
  }

  return scenes.map((scene) => ({
    ...scene,
    deliveryGroup: normalized.get(scene.deliveryGroup)
  }));
}

export function hasDeepSeekApiKey() {
  return Boolean(String(process.env.DEEPSEEK_API_KEY || "").trim());
}

export function validateStoryboard(payload, script, options = {}) {
  if (!Array.isArray(payload?.scenes) || !payload.scenes.length) {
    throw new Error("DeepSeek 没有返回有效的分镜列表");
  }
  if (payload.scenes.length > 120) {
    throw new Error("DeepSeek 返回的分镜数量过多");
  }

  const sourceScenes = splitLongSemanticScenes(splitEnumeratedScenes(mergeSemanticFragments(payload.scenes)));
  const total = sourceScenes.length;
  let scenes = sourceScenes.map((item, index) => {
    const text = String(item?.text || "").trim();
    if (!text) throw new Error(`DeepSeek 第 ${index + 1} 个分镜没有正文`);
    if (compactText(text).length > MAX_SCENE_CHARACTERS) {
      throw new Error(`DeepSeek 第 ${index + 1} 个分镜过长`);
    }

    const detectedRole = classifyEmotionRole(text, index, total);
    const role = ROLES.has(item?.role) ? item.role : detectedRole;
    const config = EMOTION_ROLE_CONFIG[role];
    const emotion = EMOTIONS.has(item?.emotion) ? item.emotion : config.emotion;

    return {
      sceneIndex: index,
      text,
      role,
      roleLabel: config.label,
      emotion,
      rawDeliveryGroup: item?.deliveryGroup,
      speedMultiplier: Number(clamp(
        item?.speedMultiplier,
        0.85,
        1.15,
        config.speedMultiplier
      ).toFixed(2)),
      pitch: Math.round(clamp(item?.pitch, -2, 2, config.pitch)),
      pauseAfter: Number(clamp(
        item?.pauseAfter,
        0.15,
        1.2,
        config.pauseAfter
      ).toFixed(2)),
      typography: sanitizeTypography(item?.typography, text, role)
    };
  });

  scenes = stabilizeDeliveryDirections(reduceDeliveryGroups(
    assignDeliveryGroups(scenes),
    readableLength(script)
  ));
  scenes = stabilizeDeliveryDirections(coalesceSimilarDeliveryGroups(scenes));

  if (compactText(scenes.map((scene) => scene.text).join("")) !== compactText(script)) {
    throw new Error("DeepSeek 分镜改写或遗漏了原文，已拒绝该结果");
  }

  return {
    provider: options.provider || "deepseek",
    model: options.model || DEFAULT_DEEPSEEK_MODEL,
    overallTone: String(payload?.overallTone || "自然叙述").trim().slice(0, 30),
    arcSummary: String(payload?.arcSummary || "整体自然连贯，关键转折适度加强").trim().slice(0, 80),
    scenes,
    usage: options.usage || null
  };
}

export async function requestDeepSeekStoryboard({
  script,
  title = "",
  tag = "",
  fetchImpl = fetch
}) {
  const apiKey = String(process.env.DEEPSEEK_API_KEY || "").trim();
  if (!apiKey) throw new Error("未检测到 DEEPSEEK_API_KEY");

  const model = String(process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL).trim();
  let response;
  try {
    response = await fetchImpl(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `请将以下内容拆分为 JSON 分镜：\n${JSON.stringify({ title, tag, script })}`
          }
        ],
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        temperature: 0.2,
        max_tokens: 6000,
        stream: false
      }),
      signal: AbortSignal.timeout(120_000)
    });
  } catch (error) {
    if (error?.name === "TimeoutError") throw new Error("DeepSeek 分镜请求超时");
    throw new Error(`无法连接 DeepSeek：${error.message}`);
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`DeepSeek 返回了无法识别的响应（HTTP ${response.status}）`);
  }
  if (!response.ok || result?.error) {
    const message = result?.error?.message || `HTTP ${response.status}`;
    throw new Error(`DeepSeek 分镜失败：${message}`);
  }

  const content = result?.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 返回了空的分镜内容");

  let storyboard;
  try {
    storyboard = JSON.parse(content);
  } catch {
    throw new Error("DeepSeek 返回的分镜不是有效 JSON");
  }

  return validateStoryboard(storyboard, script, {
    provider: "deepseek",
    model: result.model || model,
    usage: result.usage || null
  });
}
