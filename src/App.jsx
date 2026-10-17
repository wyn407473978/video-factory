import { useEffect, useMemo, useRef, useState } from "react";
import { planEmotionCurve } from "../shared/emotion-director.mjs";
import ScriptLibrary from "./ScriptLibrary.jsx";

const EXAMPLE_SCRIPT = `双鱼INFJ男真正动心以后，反而会变得特别安静。

第一，他会记住你随口说过的小事。
第二，他很想靠近你，却又害怕关系发展得太快。
第三，他不会轻易说喜欢，却会默默观察你的情绪。

他不是不够喜欢，只是需要确定：靠近你以后，自己不会受伤。

你认识的双鱼INFJ也是这样吗？评论区留下你想看的组合。`;

const NAVIGATION = [
  { id: "studio", icon: "✦", label: "智能制片" },
  { id: "library", icon: "文", label: "文案库" },
  { icon: "景", label: "素材库" },
  { icon: "声", label: "声音角色" },
  { icon: "模", label: "品牌模板" }
];

const SECONDARY_NAVIGATION = [
  { icon: "历", label: "生成记录" },
  { icon: "数", label: "内容数据" },
  { icon: "设", label: "偏好设置" }
];

const PACE_OPTIONS = [
  { label: "快节奏", value: 4.1 },
  { label: "标准", value: 3.4 },
  { label: "舒缓", value: 2.7 }
];

const FONT_OPTIONS = [
  { label: "诗意行楷", value: "poetic", sample: "双鱼 INFJ", note: "柔和 · 情绪感" },
  { label: "文艺宋体", value: "editorial", sample: "双鱼 INFJ", note: "克制 · 杂志感" },
  { label: "魏碑标题", value: "engraved", sample: "双鱼 INFJ", note: "醒目 · 记忆点" }
];

const VOICE_OPTIONS = [
  { label: "岚 · 温柔叙事", short: "岚", value: "Chinese (Mandarin)_Warm_Girl" },
  { label: "知微 · 知性分析", short: "知", value: "Chinese (Mandarin)_IntellectualGirl" },
  { label: "沐诗 · 抒情旁白", short: "诗", value: "Chinese (Mandarin)_Lyrical_Voice" },
  { label: "清屿 · 温柔男声", short: "屿", value: "Chinese (Mandarin)_Gentle_Youth" },
  { label: "砚声 · 电台叙事", short: "砚", value: "Chinese (Mandarin)_Radio_Host" }
];

const EMOTION_OPTIONS = [
  { label: "智能", value: "auto" },
  { label: "平静", value: "calm" },
  { label: "愉悦", value: "happy" },
  { label: "感性", value: "sad" },
  { label: "惊喜", value: "surprised" }
];

const EMOTION_LABELS = {
  calm: "平静",
  happy: "愉悦",
  sad: "感性",
  fearful: "不安",
  surprised: "惊喜"
};

const TYPOGRAPHY_LABELS = {
  hook: "大字钩子",
  analysis: "稳定分析",
  list: "条目重点",
  conflict: "情感矛盾",
  reversal: "观点反转",
  interaction: "结尾互动"
};

const TYPOGRAPHY_OPTIONS = Object.entries(TYPOGRAPHY_LABELS).map(([value, label]) => ({ value, label }));

const SIZE_OPTIONS = [
  { value: "hero", label: "主视觉大字" },
  { value: "large", label: "醒目大字" },
  { value: "standard", label: "标准正文" }
];

const EFFECT_OPTIONS = [
  { value: "rise", label: "柔和上浮" },
  { value: "slide", label: "横向推进" },
  { value: "punch", label: "弹性强调" },
  { value: "typewriter", label: "打字钩子" },
  { value: "float", label: "呼吸悬浮" }
];

const ACCENT_OPTIONS = [
  { value: "gradient", label: "渐变艺术字" },
  { value: "glow", label: "柔光艺术字" },
  { value: "outline", label: "描边艺术字" },
  { value: "underline", label: "杂志下划线" }
];

const TRANSITION_OPTIONS = [
  { value: "none", label: "自然切换" },
  { value: "push", label: "页面推进" },
  { value: "zoom", label: "镜头推近" }
];

function countCharacters(value) {
  return value.replace(/\s+/gu, "").length;
}

function compactCopy(value) {
  return String(value || "").replace(/\s+/gu, "");
}

function splitScenes(value) {
  const parts = value
    .replace(/\r/gu, "")
    .split(/\n+|(?<=[。！？!?；;])/u)
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length ? parts : ["请先输入视频文案。"];
}

function formatTime(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function createAudioFingerprint({ script, pace, voiceId, emotion, sceneTexts }) {
  return JSON.stringify({
    script: String(script || "").trim(),
    pace: Number(pace),
    voiceId,
    emotion,
    sceneTexts: (sceneTexts || []).map(String)
  });
}

function App() {
  const [currentView, setCurrentView] = useState("studio");
  const [libraryScriptId, setLibraryScriptId] = useState(null);
  const [title, setTitle] = useState("双鱼 INFJ 男真正动心后的三个表现");
  const [script, setScript] = useState(EXAMPLE_SCRIPT);
  const [tag, setTag] = useState("双鱼座 × INFJ");
  const [pace, setPace] = useState(3.4);
  const [fontStyle, setFontStyle] = useState("poetic");
  const [voiceId, setVoiceId] = useState(VOICE_OPTIONS[0].value);
  const [emotion, setEmotion] = useState("auto");
  const [previewingVoice, setPreviewingVoice] = useState(false);
  const [storyboard, setStoryboard] = useState(null);
  const [storyboardLoading, setStoryboardLoading] = useState(false);
  const [selectedScene, setSelectedScene] = useState(0);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [service, setService] = useState({ loading: true, ok: false, tools: {} });
  const [toast, setToast] = useState("");
  const [job, setJob] = useState(null);
  const [lastCompletedRender, setLastCompletedRender] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const pollingRef = useRef(null);
  const voiceAudioRef = useRef(null);
  const voicePreviewUrlRef = useRef("");

  const characters = useMemo(() => countCharacters(script), [script]);
  const fallbackScenes = useMemo(() => splitScenes(script), [script]);
  const activeStoryboard = storyboard?.sourceScript === script ? storyboard : null;
  const scenes = useMemo(
    () => activeStoryboard?.scenes?.map((scene) => scene.text) || fallbackScenes,
    [activeStoryboard, fallbackScenes]
  );
  const sceneEmotionPlan = useMemo(
    () => activeStoryboard?.scenes?.map((scene) => ({
      ...scene,
      emotion: emotion === "auto" ? scene.emotion : emotion
    })) || planEmotionCurve(scenes, { manualEmotion: emotion }),
    [activeStoryboard, scenes, emotion]
  );
  const deliveryGroupCount = useMemo(
    () => new Set(sceneEmotionPlan.map((scene) => scene.deliveryGroup).filter(Number.isInteger)).size,
    [sceneEmotionPlan]
  );
  const estimatedDuration = useMemo(
    () => Math.max(8, Math.ceil(characters / pace + 4.5)),
    [characters, pace]
  );
  const currentAudioFingerprint = useMemo(() => createAudioFingerprint({
    script,
    pace,
    voiceId,
    emotion,
    sceneTexts: scenes
  }), [script, pace, voiceId, emotion, scenes]);
  const canReuseCurrentAudio = lastCompletedRender?.fingerprint === currentAudioFingerprint;
  const selectedScenePlan = activeStoryboard?.scenes?.[selectedScene] || null;
  const selectedTypography = selectedScenePlan?.typography || null;
  const selectedTypographyValid = !selectedTypography?.displayLines
    || compactCopy(selectedTypography.displayLines.join("")) === compactCopy(selectedScenePlan?.text);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((data) => setService({ loading: false, ...data }))
      .catch(() => setService({ loading: false, ok: false, tools: {} }));
    return () => {
      window.clearInterval(pollingRef.current);
      voiceAudioRef.current?.pause();
      if (voicePreviewUrlRef.current) URL.revokeObjectURL(voicePreviewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (selectedScene > scenes.length - 1) setSelectedScene(0);
  }, [scenes, selectedScene]);

  function notify(message) {
    setToast(message);
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setToast(""), 2600);
  }

  function updateSelectedTypography(patch) {
    setStoryboard((current) => {
      if (!current || current.sourceScript !== script || !current.scenes?.[selectedScene]) return current;
      const scene = current.scenes[selectedScene];
      const base = scene.typography || {
        displayLines: [scene.text],
        emphasis: [],
        layout: scene.role || "analysis",
        alignment: scene.role === "interaction" ? "center" : "left",
        size: ["hook", "reversal"].includes(scene.role) ? "hero" : "large",
        effect: scene.role === "hook" ? "typewriter" : "rise",
        accentStyle: ["hook", "reversal"].includes(scene.role) ? "gradient" : "underline",
        transition: ["hook", "reversal"].includes(scene.role) ? "zoom" : "none",
        revealOrder: [0]
      };
      const typography = { ...base, ...patch, userEdited: true };
      const nextScenes = current.scenes.map((item, index) => (
        index === selectedScene ? { ...item, typography } : item
      ));
      return { ...current, scenes: nextScenes };
    });
  }

  async function saveDraft() {
    try {
      const response = await fetch(libraryScriptId ? `/api/scripts/${libraryScriptId}` : "/api/drafts", {
        method: libraryScriptId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, script, pace, tag, fontStyle, voiceId, emotion })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "保存失败");
      notify(libraryScriptId ? "文案库内容已更新" : "草稿已保存到本机");
    } catch (error) {
      notify(`无法保存：${error.message}`);
    }
  }

  async function previewVoice() {
    if (!service.tools?.minimaxTts) {
      notify("MiniMax API Key 尚未被本地服务读取，请重新启动服务");
      return;
    }

    setPreviewingVoice(true);
    voiceAudioRef.current?.pause();
    try {
      const response = await fetch("/api/voice-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: (previewText || title).slice(0, 90),
          pace,
          voiceId,
          emotion
        })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.details || data.error || "试听生成失败");
      }

      const audioBlob = await response.blob();
      if (voicePreviewUrlRef.current) URL.revokeObjectURL(voicePreviewUrlRef.current);
      const audioUrl = URL.createObjectURL(audioBlob);
      voicePreviewUrlRef.current = audioUrl;
      const audio = new Audio(audioUrl);
      voiceAudioRef.current = audio;
      audio.onended = () => setPreviewingVoice(false);
      audio.onerror = () => setPreviewingVoice(false);
      await audio.play();
    } catch (error) {
      setPreviewingVoice(false);
      notify(`无法试听：${error.message}`);
    }
  }

  async function generateStoryboard() {
    if (script.trim().length < 8) {
      notify("请先输入至少8个字的文案");
      return;
    }
    if (!service.tools?.deepseekStoryboard) {
      notify("DeepSeek API Key 尚未被本地服务读取，请重新启动服务");
      return;
    }

    setStoryboardLoading(true);
    try {
      const response = await fetch("/api/storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, tag, script })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.details || data.error || "分镜生成失败");
      setStoryboard({ ...data, sourceScript: script });
      setSelectedScene(0);
      notify(`DeepSeek 已生成 ${data.scenes.length} 个动态文字镜头`);
    } catch (error) {
      notify(`无法生成分镜：${error.message}`);
    } finally {
      setStoryboardLoading(false);
    }
  }

  async function updateLibraryScript(id, patch) {
    if (!id) return null;
    const response = await fetch(`/api/scripts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "文案库状态更新失败");
    }
    return response.json();
  }

  async function pollJob(id, sourceScript, audioSettings, sourceLibraryScriptId = null) {
    window.clearInterval(pollingRef.current);
    pollingRef.current = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${id}`);
        const nextJob = await response.json();
        setJob(nextJob);
        if (nextJob.status === "completed") {
          window.clearInterval(pollingRef.current);
          setVideoUrl(nextJob.result.outputUrl);
          if (Array.isArray(nextJob.result.emotionPlan)) {
            setStoryboard({
              provider: nextJob.result.storyboardProvider,
              model: nextJob.result.storyboardModel,
              scenes: nextJob.result.emotionPlan,
              sourceScript
            });
          }
          setLastCompletedRender({
            jobId: id,
            fingerprint: createAudioFingerprint({
              ...audioSettings,
              sceneTexts: nextJob.result.scenes?.map((scene) => scene.text) || audioSettings.sceneTexts
            })
          });
          if (sourceLibraryScriptId) {
            updateLibraryScript(sourceLibraryScriptId, {
              status: "completed",
              lastJobId: id,
              outputUrl: nextJob.result.outputUrl,
              lastGeneratedAt: new Date().toISOString(),
              error: null
            }).catch(() => {});
          }
          notify(nextJob.result.audioReused
            ? "已复用原旁白，画面重新渲染完成"
            : "视频生成完成，可以预览和下载了");
        }
        if (nextJob.status === "failed") {
          window.clearInterval(pollingRef.current);
          if (sourceLibraryScriptId) {
            updateLibraryScript(sourceLibraryScriptId, {
              status: "failed",
              lastJobId: id,
              error: nextJob.error
            }).catch(() => {});
          }
          notify(`生成失败：${nextJob.error}`);
        }
      } catch (error) {
        window.clearInterval(pollingRef.current);
        setJob((current) => ({ ...current, status: "failed", error: error.message }));
      }
    }, 900);
  }

  async function generateVideo() {
    if (script.trim().length < 8) {
      notify("请先输入至少8个字的文案");
      return;
    }
    const invalidTypographyIndex = activeStoryboard?.scenes?.findIndex((scene) => (
      scene.typography?.displayLines
      && compactCopy(scene.typography.displayLines.join("")) !== compactCopy(scene.text)
    ));
    if (Number.isInteger(invalidTypographyIndex) && invalidTypographyIndex >= 0) {
      setSelectedScene(invalidTypographyIndex);
      notify(`镜头 ${invalidTypographyIndex + 1} 的排版文字与原文不一致，请先修正`);
      return;
    }
    const speechReady = service.tools?.minimaxTts || service.tools?.systemTts;
    if (!service.ok || !service.tools?.ffmpeg || !speechReady) {
      notify("视频或配音服务尚未准备好");
      return;
    }

    setVideoUrl("");
    setJob({ status: "queued", progress: 0, stage: "正在提交任务" });
    const audioSettings = { script, pace, voiceId, emotion, sceneTexts: scenes };
    try {
      const response = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          script,
          pace,
          tag,
          fontStyle,
          voiceId,
          emotion,
          storyboard: activeStoryboard,
          reuseAudioFromJobId: canReuseCurrentAudio ? lastCompletedRender.jobId : null
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "无法开始生成");
      setJob(data);
      if (libraryScriptId) {
        await updateLibraryScript(libraryScriptId, {
          title,
          tag,
          script,
          status: "processing",
          lastJobId: data.id,
          error: null
        });
      }
      pollJob(data.id, script, audioSettings, libraryScriptId);
    } catch (error) {
      setJob({ status: "failed", progress: 0, stage: "提交失败", error: error.message });
      notify(error.message);
    }
  }

  function navClick(item) {
    setMobileMenu(false);
    if (item.id === "studio" || item.id === "library") {
      setCurrentView(item.id);
      return;
    }
    notify(`${item.label}模块将在下一阶段接入`);
  }

  function editLibraryScript(item) {
    setTitle(item.title);
    setTag(item.tag);
    setScript(item.script);
    setLibraryScriptId(item.id);
    setStoryboard(null);
    setSelectedScene(0);
    setVideoUrl(item.outputUrl || "");
    setJob(null);
    setCurrentView("studio");
    window.scrollTo({ top: 0, behavior: "smooth" });
    notify("已载入文案，可以编辑或直接生成视频");
  }

  const jobRunning = job && ["queued", "processing"].includes(job.status);
  const previewText = scenes[selectedScene] || scenes[0];
  const selectedVoice = VOICE_OPTIONS.find((option) => option.value === voiceId) || VOICE_OPTIONS[0];
  const speechReady = service.tools?.minimaxTts || service.tools?.systemTts;

  return (
    <div className="app-shell">
      <header className="mobile-header">
        <button className="icon-button" onClick={() => setMobileMenu(true)} aria-label="打开菜单">
          <span className="hamburger" />
        </button>
        <Brand compact />
        <button
          className="icon-button"
          onClick={currentView === "studio" ? saveDraft : () => setCurrentView("studio")}
          aria-label={currentView === "studio" ? "保存草稿" : "返回制片台"}
        >{currentView === "studio" ? "⌘" : "✦"}</button>
      </header>

      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <Brand />
        <p className="nav-label">创作空间</p>
        <nav className="nav-list">
          {NAVIGATION.map((item) => (
            <button
              className={`nav-item ${currentView === item.id ? "active" : ""}`}
              key={item.label}
              onClick={() => navClick(item)}
            >
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <p className="nav-label secondary">内容管理</p>
        <nav className="nav-list">
          {SECONDARY_NAVIGATION.map((item) => (
            <button className="nav-item" key={item.label} onClick={() => navClick(item)}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="local-card">
          <div className="local-card__heading">
            <span className={`status-dot ${service.ok ? "online" : ""}`} />
            <strong>{service.loading ? "正在检查环境" : service.ok ? "本地引擎已就绪" : "本地引擎未连接"}</strong>
          </div>
          <p>{service.tools?.minimaxTts ? "MiniMax 生成情感配音，视频与文件留在本机" : "使用系统配音兜底，视频与文件留在本机"}</p>
          <div className="tool-tags">
            <span className={service.tools?.ffmpeg ? "ready" : ""}>FFmpeg</span>
            <span className={speechReady ? "ready" : ""}>{service.tools?.minimaxTts ? "MiniMax HD" : "系统配音"}</span>
            <span className={service.tools?.deepseekStoryboard ? "ready" : ""}>DeepSeek</span>
          </div>
        </div>
      </aside>
      {mobileMenu && <button className="scrim" onClick={() => setMobileMenu(false)} aria-label="关闭菜单" />}

      <header className="desktop-topbar">
        <div className="breadcrumbs">
          <span>{currentView === "library" ? "文案库" : "智能制片"}</span>
          <i>/</i>
          <strong>{currentView === "library" ? "批量导入与生成" : title || "未命名视频"}</strong>
        </div>
        {currentView === "studio" && (
          <div className="topbar-actions">
            <button className="button ghost" onClick={saveDraft}>{libraryScriptId ? "保存到文案库" : "保存草稿"}</button>
            <button className="button primary small" onClick={generateVideo} disabled={jobRunning}>
              {jobRunning ? "生成中…" : canReuseCurrentAudio ? "重渲染画面" : "生成视频"}
            </button>
          </div>
        )}
      </header>

      {currentView === "library" ? (
        <ScriptLibrary onEdit={editLibraryScript} notify={notify} service={service} />
      ) : (<>
      <main className="workspace">
        <section className="page-heading">
          <div>
            <p className="eyebrow">AI VIDEO STUDIO</p>
            <h1>把文案，变成一条有情绪的视频</h1>
            <p className="lead">自动完成情感配音、字幕和视频渲染，你只需要专注文案。</p>
          </div>
          <div className="stepper" aria-label="视频生成流程">
            {["文案", "分镜", "声音", "导出"].map((label, index) => (
              <div className={`step ${index === 0 || jobRunning || videoUrl ? "active" : ""}`} key={label}>
                <b>{index + 1}</b><span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="studio-grid">
          <section className="panel editor-panel">
            <PanelHeader number="01" title="视频文案" description="保留你的表达，系统负责拆解与呈现">
              <span className="status-chip"><i />实时保存</span>
            </PanelHeader>
            <div className="panel-body">
              <FieldLabel label="视频标题" hint="用于成片与文件命名" />
              <input className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} />
              <div className="two-fields">
                <div>
                  <FieldLabel label="内容标签" hint="显示在画面顶部" />
                  <input className="text-input" value={tag} onChange={(event) => setTag(event.target.value)} />
                </div>
                <div>
                  <FieldLabel label="声音角色" hint="MiniMax Speech 2.8 HD" />
                  <div className="voice-picker-row">
                    <div className="select-like interactive">
                      <span className="voice-orb">{selectedVoice.short}</span>
                      <select value={voiceId} onChange={(event) => setVoiceId(event.target.value)}>
                        {VOICE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <i>⌄</i>
                    </div>
                    <button
                      className={`voice-preview-button ${previewingVoice ? "playing" : ""}`}
                      onClick={previewVoice}
                      disabled={previewingVoice || !service.tools?.minimaxTts}
                      type="button"
                    >{previewingVoice ? "播放中" : "试听"}</button>
                  </div>
                </div>
              </div>
              <FieldLabel label="正文内容" hint="支持直接粘贴完整文案" />
              <div className="textarea-wrap">
                <textarea
                  value={script}
                  onChange={(event) => {
                    setScript(event.target.value);
                    setStoryboard(null);
                  }}
                />
                <div className="textarea-meta"><span><strong>{characters}</strong> 字</span><span>视频将根据配音自动定长</span></div>
              </div>
              <div className="metrics">
                <Metric label="预计时长" value={estimatedDuration} suffix="秒" />
                <Metric label="识别镜头" value={scenes.length} suffix="个" />
                <Metric label="输出规格" value="9:16" suffix="竖屏" />
              </div>
            </div>
          </section>

          <section className="panel settings-panel">
            <PanelHeader number="02" title="表达方式" description="控制节奏与视觉气质" />
            <div className="setting-section">
              <div className="setting-heading"><strong>旁白节奏</strong><span>约 {pace.toFixed(1)} 字/秒</span></div>
              <div className="segments">
                {PACE_OPTIONS.map((option) => (
                  <button
                    className={pace === option.value ? "active" : ""}
                    key={option.value}
                    onClick={() => setPace(option.value)}
                  >{option.label}</button>
                ))}
              </div>
            </div>
            <div className="setting-section">
              <div className="setting-heading"><strong>情绪表达</strong><span>{emotion === "auto" ? "AI 根据文案判断" : "全篇基调"}</span></div>
              <div className="segments emotion-segments">
                {EMOTION_OPTIONS.map((option) => (
                  <button
                    className={emotion === option.value ? "active" : ""}
                    key={option.value}
                    onClick={() => setEmotion(option.value)}
                  >{option.label}</button>
                ))}
              </div>
              <p className="director-note">
                {emotion === "auto"
                  ? "DeepSeek 规划整篇情绪弧线；MiniMax 一次生成完整旁白，确保全片是同一个人。"
                  : "使用统一情绪，同时保留每个叙事段落的语速、音调与停顿变化。"}
              </p>
            </div>
            <div className="setting-section">
              <div className="setting-heading"><strong>字体风格</strong><span>标题 × 正文搭配</span></div>
              <div className="font-style-grid">
                {FONT_OPTIONS.map((option) => (
                  <button
                    className={`font-option font-${option.value} ${fontStyle === option.value ? "active" : ""}`}
                    key={option.value}
                    onClick={() => setFontStyle(option.value)}
                    aria-pressed={fontStyle === option.value}
                  >
                    <span className="font-sample">{option.sample}</span>
                    <strong>{option.label}</strong>
                    <small>{option.note}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="setting-section">
              <div className="setting-heading"><strong>视觉模板</strong><span>品牌模板</span></div>
              <div className="template-grid">
                <button className="template active"><i className="template-one" /><strong>星格氛围</strong><span>当前</span></button>
                <button className="template" onClick={() => notify("关系碰撞模板将在下一阶段接入")}><i className="template-two" /><strong>关系碰撞</strong></button>
              </div>
            </div>
            <div className="setting-section">
              <div className="setting-heading"><strong>生成能力</strong><span>本机执行</span></div>
              <ul className="capability-list">
                <li><i className={service.tools?.deepseekStoryboard ? "ready" : ""} />DeepSeek 语义分镜与文字排版</li>
                <li><i className={speechReady ? "ready" : ""} />{service.tools?.minimaxTts ? "MiniMax 单次连续旁白" : "本机中文旁白"}</li>
                <li><i className={service.tools?.ffmpeg ? "ready" : ""} />1080P 视频合成</li>
                <li><i className={service.tools?.ffmpeg ? "ready" : ""} />{service.tools?.renderConcurrency
                  ? `${service.tools.renderConcurrency.ffmpegThreads} 线程编码 · ${service.tools.renderConcurrency.captionConcurrency} 路字幕并行`
                  : "多核并行渲染"}</li>
                <li><i className={service.tools?.ffprobe ? "ready" : ""} />按真实音频定时</li>
                <li><i className={service.tools?.ffmpeg ? "ready" : ""} />复用旁白快速重渲染</li>
                <li><i className={service.tools?.ffmpeg ? "ready" : ""} />-16 LUFS 响度标准化</li>
              </ul>
            </div>
          </section>

          <aside className="panel preview-panel">
            <div className="preview-header">
              <div><strong>成片预览</strong><span>{videoUrl ? "真实生成结果" : "模板实时预览"}</span></div>
              <span className="quality">1080P</span>
            </div>
            <div className="phone-shell">
              {videoUrl ? (
                <video className="result-video" src={videoUrl} controls autoPlay playsInline />
              ) : (
                <div className="mock-video">
                  <div className="cosmic-orbit orbit-one" />
                  <div className="cosmic-orbit orbit-two" />
                  <div className="grain" />
                  <div className="mock-brand"><img src="/assets/xingge-avatar.png" alt="" /><span>星格观察局</span></div>
                  <div className={`mock-copy font-${fontStyle}`}>
                    <span className="mock-tag">{tag || "星座 × MBTI"}</span>
                    <h2>{title || "在这里输入视频标题"}</h2>
                    <p>{previewText}</p>
                  </div>
                  <div className="mock-footer"><strong>@星格观察局</strong><span>看懂性格，也看懂关系</span><i /></div>
                </div>
              )}
            </div>
            <div className="preview-meta">
              <span>{videoUrl && job?.result ? `${job.result.duration} 秒` : `${formatTime(estimatedDuration)} 预计`}</span>
              {videoUrl ? (
                <a className="download-link" href={videoUrl} download>下载 MP4 ↓</a>
              ) : (
                <span>MP4 · H.264</span>
              )}
            </div>
          </aside>

          <section className="panel scenes-panel">
            <PanelHeader
              number="03"
              title="DeepSeek 动态文字分镜"
              description={activeStoryboard
                ? `${activeStoryboard.model || "DeepSeek"} · ${scenes.length} 个完整镜头 / 1 条连续旁白 · ${deliveryGroupCount || 1} 个情绪阶段 · 字号 / 艺术字 / 动效 / 转场`
                : "先理解全文情绪弧线，再规划语义换行、艺术字、文字动效与页面转场"}
            >
              <button
                className={`storyboard-button ${activeStoryboard ? "ready" : ""}`}
                onClick={generateStoryboard}
                disabled={storyboardLoading || jobRunning || !service.tools?.deepseekStoryboard}
                type="button"
              >{storyboardLoading ? "分析中…" : activeStoryboard ? "重新分镜" : "✦ 生成分镜"}</button>
            </PanelHeader>
            <div className="scene-strip">
              {scenes.map((scene, index) => (
                <button
                  className={`scene-card ${selectedScene === index ? "active" : ""}`}
                  key={`${scene}-${index}`}
                  onClick={() => setSelectedScene(index)}
                >
                  <div>
                    <b>镜头 {String(index + 1).padStart(2, "0")}</b>
                    <em>{sceneEmotionPlan[index]?.roleLabel}</em>
                    <i>{EMOTION_LABELS[sceneEmotionPlan[index]?.emotion] || "智能"}</i>
                    {Number.isInteger(sceneEmotionPlan[index]?.deliveryGroup) && (
                      <small>语气 {sceneEmotionPlan[index].deliveryGroup + 1}</small>
                    )}
                    {sceneEmotionPlan[index]?.typography?.layout && (
                      <u>{TYPOGRAPHY_LABELS[sceneEmotionPlan[index].typography.layout] || "智能排版"}</u>
                    )}
                    {sceneEmotionPlan[index]?.typography?.effect && (
                      <u>{EFFECT_OPTIONS.find((option) => option.value === sceneEmotionPlan[index].typography.effect)?.label || "动态文字"}</u>
                    )}
                    <span>约 {Math.max(3, Math.round(scene.length / pace))} 秒</span>
                  </div>
                  <p>{sceneEmotionPlan[index]?.typography?.displayLines?.join(" / ") || scene}</p>
                </button>
              ))}
            </div>
            {selectedScenePlan && (
              <div className="typography-editor">
                <div className="typography-editor__heading">
                  <div>
                    <strong>镜头 {String(selectedScene + 1).padStart(2, "0")} · 排版微调</strong>
                    <span>DeepSeek 给出结构，你可以在生成前继续调整</span>
                  </div>
                  <span className={selectedTypographyValid ? "valid" : "invalid"}>
                    {selectedTypographyValid ? "原文完整" : "文字与原文不一致"}
                  </span>
                </div>
                <div className="typography-editor__grid">
                  <label className="line-editor">
                    <span>语义换行 <small>每一行对应一次字幕出现</small></span>
                    <textarea
                      value={(selectedTypography?.displayLines || [selectedScenePlan.text]).join("\n")}
                      onChange={(event) => {
                        const displayLines = event.target.value.split("\n");
                        updateSelectedTypography({
                          displayLines,
                          revealOrder: displayLines.map((_, index) => index)
                        });
                      }}
                    />
                  </label>
                  <div className="typography-controls">
                    <label>
                      <span>强调词 <small>使用顿号分隔，最多三个</small></span>
                      <input
                        value={(selectedTypography?.emphasis || []).join("、")}
                        onChange={(event) => updateSelectedTypography({
                          emphasis: event.target.value
                            .split(/[、,，]/u)
                            .map((term) => term.trim())
                            .filter(Boolean)
                            .slice(0, 3)
                        })}
                        placeholder="例如：靠近你、不会受伤"
                      />
                    </label>
                    <label>
                      <span>画面版式</span>
                      <select
                        value={selectedTypography?.layout || selectedScenePlan.role || "analysis"}
                        onChange={(event) => updateSelectedTypography({ layout: event.target.value })}
                      >
                        {TYPOGRAPHY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>文字大小</span>
                      <select
                        value={selectedTypography?.size || "large"}
                        onChange={(event) => updateSelectedTypography({ size: event.target.value })}
                      >
                        {SIZE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>文字入场</span>
                      <select
                        value={selectedTypography?.effect || "rise"}
                        onChange={(event) => updateSelectedTypography({ effect: event.target.value })}
                      >
                        {EFFECT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>强调字效果</span>
                      <select
                        value={selectedTypography?.accentStyle || "gradient"}
                        onChange={(event) => updateSelectedTypography({ accentStyle: event.target.value })}
                      >
                        {ACCENT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>页面切换</span>
                      <select
                        value={selectedTypography?.transition || "none"}
                        onChange={(event) => updateSelectedTypography({ transition: event.target.value })}
                      >
                        {TRANSITION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <div className="alignment-control">
                      <span>文字对齐</span>
                      <div>
                        {[{ value: "left", label: "左对齐" }, { value: "center", label: "居中" }].map((option) => (
                          <button
                            type="button"
                            key={option.value}
                            className={(selectedTypography?.alignment || "left") === option.value ? "active" : ""}
                            onClick={() => updateSelectedTypography({ alignment: option.value })}
                          >{option.label}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="action-bar">
        <div className="save-state"><i className={service.ok ? "online" : ""} />{service.ok ? "本地引擎已连接" : "等待本地引擎"}</div>
        <div className="action-buttons">
          <button className="button ghost" onClick={saveDraft}>{libraryScriptId ? "保存到文案库" : "保存草稿"}</button>
          <button className="button primary" onClick={generateVideo} disabled={jobRunning || !service.ok}>
            {jobRunning
              ? `${job.stage} ${job.progress || 0}%`
              : canReuseCurrentAudio ? "✦ 只重渲染画面" : "✦ 生成视频"}
          </button>
        </div>
        {jobRunning && <span className="render-progress" style={{ width: `${job.progress || 2}%` }} />}
      </footer>

      {job && job.status === "failed" && (
        <div className="error-card"><strong>生成失败</strong><span>{job.error}</span><button onClick={() => setJob(null)}>×</button></div>
      )}
      </>)}
      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}

function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? "compact" : ""}`}>
      <img src="/assets/xingge-avatar.png" alt="星格观察局" />
      <div><strong>星格制片台</strong>{!compact && <span>看懂性格，也看懂关系</span>}</div>
    </div>
  );
}

function PanelHeader({ number, title, description, children }) {
  return (
    <div className="panel-header">
      <div><h2><span>{number}</span> · {title}</h2><p>{description}</p></div>
      {children}
    </div>
  );
}

function FieldLabel({ label, hint }) {
  return <label className="field-label"><strong>{label}</strong><span>{hint}</span></label>;
}

function Metric({ label, value, suffix }) {
  return <div className="metric"><span>{label}</span><strong>{value}<small>{suffix}</small></strong></div>;
}

export default App;
