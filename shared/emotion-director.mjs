export const EMOTION_ROLE_CONFIG = {
  hook: {
    label: "开场钩子",
    emotion: "surprised",
    speedMultiplier: 1.06,
    pitch: 1,
    pauseAfter: 0.45
  },
  analysis: {
    label: "特征分析",
    emotion: "calm",
    speedMultiplier: 1,
    pitch: 0,
    pauseAfter: 0.3
  },
  conflict: {
    label: "情感矛盾",
    emotion: "sad",
    speedMultiplier: 0.9,
    pitch: -1,
    pauseAfter: 0.6
  },
  reversal: {
    label: "观点反转",
    emotion: "surprised",
    speedMultiplier: 0.98,
    pitch: 1,
    pauseAfter: 0.5
  },
  interaction: {
    label: "结尾互动",
    emotion: "happy",
    speedMultiplier: 1.04,
    pitch: 1,
    pauseAfter: 0.25
  }
};

const interactionPattern = /(?:你呢|你觉得|你认为|你认识的|有没有|评论区|留言|关注|想看|告诉我|也是这样吗|是哪一种|什么组合)/u;
const reversalPattern = /(?:但是|但其实|其实|并不是|不是.+而是|反而|然而|可他|可她|真正的|别误会|所以说)/u;
const conflictPattern = /(?:害怕|受伤|失去|失望|难过|委屈|压抑|焦虑|沉默|逃避|敏感|不安|防备|纠结|不敢|克制|冷淡|疏远|没安全感)/u;

export function classifyEmotionRole(text, index, total) {
  const value = String(text || "").trim();
  if (interactionPattern.test(value) || (index === total - 1 && /[？?]/u.test(value))) {
    return "interaction";
  }
  if (index === 0) return "hook";
  if (reversalPattern.test(value)) return "reversal";
  if (conflictPattern.test(value)) return "conflict";
  return "analysis";
}

export function planEmotionCurve(scenes, options = {}) {
  const manualEmotion = String(options.manualEmotion || "auto");
  const total = scenes.length;

  return scenes.map((scene, index) => {
    const text = typeof scene === "string" ? scene : scene.text;
    const role = classifyEmotionRole(text, index, total);
    const config = EMOTION_ROLE_CONFIG[role];
    return {
      sceneIndex: index,
      text,
      role,
      roleLabel: config.label,
      emotion: manualEmotion === "auto" ? config.emotion : manualEmotion,
      speedMultiplier: config.speedMultiplier,
      pitch: config.pitch,
      pauseAfter: config.pauseAfter
    };
  });
}

export function groupEmotionCurve(scenePlans, options = {}) {
  const maxCharacters = Number(options.maxCharacters || 420);
  const groups = [];

  for (const scene of scenePlans) {
    const previous = groups.at(-1);
    const hasDeliveryGroup = Number.isInteger(scene.deliveryGroup);
    const canAppend = previous
      && (hasDeliveryGroup
        ? previous.deliveryGroup === scene.deliveryGroup
        : previous.role === scene.role)
      && previous.emotion === scene.emotion
      && previous.text.length + scene.text.length + 1 <= maxCharacters;

    if (canAppend) {
      const textBegin = previous.text.length + 1;
      previous.text += `\n${scene.text}`;
      previous.scenes.push({ ...scene, textBegin, textEnd: textBegin + scene.text.length });
      previous.pauseAfter = scene.pauseAfter;
      continue;
    }

    groups.push({
      role: scene.role,
      roleLabel: scene.roleLabel,
      deliveryGroup: hasDeliveryGroup ? scene.deliveryGroup : null,
      emotion: scene.emotion,
      speedMultiplier: scene.speedMultiplier,
      pitch: scene.pitch,
      pauseAfter: scene.pauseAfter,
      text: scene.text,
      scenes: [{ ...scene, textBegin: 0, textEnd: scene.text.length }]
    });
  }

  return groups;
}

export function createUnifiedSpeechSegment(scenePlans) {
  let text = "";
  const scenes = [];

  for (const scene of scenePlans) {
    const separator = text ? "\n" : "";
    const textBegin = text.length + separator.length;
    text += `${separator}${scene.text}`;
    scenes.push({
      ...scene,
      textBegin,
      textEnd: textBegin + scene.text.length
    });
  }

  return {
    role: "narration",
    roleLabel: "统一旁白",
    deliveryGroup: 0,
    emotion: "auto",
    speedMultiplier: 1,
    pitch: 0,
    pauseAfter: 0,
    text,
    scenes
  };
}
