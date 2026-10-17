import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import cors from "cors";
import {
  countReadableChars,
  estimateDuration,
  splitScript
} from "./video/script-utils.mjs";
import { renderVideo, verifyLocalTools } from "./video/render-video.mjs";
import { deleteJson, ensureStorage, listJson, readJson, saveJson } from "./lib/storage.mjs";
import {
  hasMiniMaxApiKey,
  normalizeMiniMaxEmotion,
  normalizeMiniMaxVoiceId,
  requestMiniMaxSpeech
} from "./audio/minimax.mjs";
import {
  hasDeepSeekApiKey,
  requestDeepSeekStoryboard
} from "./ai/deepseek-storyboard.mjs";

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(serverDirectory, "..");
const port = Number(process.env.PORT || 4174);
const jobs = new Map();
const app = express();

await ensureStorage(projectRoot);

app.disable("x-powered-by");
app.use(cors({ origin: ["http://127.0.0.1:5173", "http://localhost:5173"] }));
app.use(express.json({ limit: "1mb" }));
app.use("/exports", express.static(path.join(projectRoot, "exports"), { fallthrough: false }));

app.get("/api/health", async (_request, response) => {
  response.json({
    ok: true,
    service: "xingge-video-studio",
    tools: await verifyLocalTools()
  });
});

app.post("/api/analyze", (request, response) => {
  const script = String(request.body?.script || "");
  const pace = Number(request.body?.pace || 3.4);
  const scenes = splitScript(script);
  response.json({
    characters: countReadableChars(script),
    estimatedDuration: estimateDuration(script, pace),
    scenes
  });
});

app.get("/api/drafts", async (_request, response) => {
  const drafts = await listJson(path.join(projectRoot, "data", "drafts"));
  response.json(drafts.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))));
});

app.post("/api/drafts", async (request, response) => {
  const id = String(request.body?.id || crypto.randomUUID());
  const draft = {
    id,
    title: String(request.body?.title || "未命名文案").slice(0, 80),
    script: String(request.body?.script || "").slice(0, 3000),
    pace: Number(request.body?.pace || 3.4),
    tag: String(request.body?.tag || "星座 × MBTI").slice(0, 40),
    fontStyle: ["poetic", "editorial", "engraved"].includes(request.body?.fontStyle)
      ? request.body.fontStyle
      : "poetic",
    voiceId: normalizeMiniMaxVoiceId(request.body?.voiceId),
    emotion: normalizeMiniMaxEmotion(request.body?.emotion),
    updatedAt: new Date().toISOString()
  };
  await saveJson(path.join(projectRoot, "data", "drafts", `${id}.json`), draft);
  response.status(201).json(draft);
});

function sanitizeScriptRecord(value, existing = {}) {
  const title = String(value?.title || "").trim().slice(0, 80);
  const tag = String(value?.tag || "").trim().slice(0, 40);
  const script = String(value?.script || "").trim().slice(0, 3000);
  if (!title) throw new Error("视频标题不能为空");
  if (script.length < 8) throw new Error("正文内容至少需要8个字");
  return {
    ...existing,
    title,
    tag: tag || "星座 × MBTI",
    script,
    updatedAt: new Date().toISOString()
  };
}

app.get("/api/scripts", async (_request, response) => {
  const scripts = await listJson(path.join(projectRoot, "data", "scripts"));
  response.json(scripts.sort((left, right) => (
    String(right.updatedAt || right.createdAt).localeCompare(String(left.updatedAt || left.createdAt))
  )));
});

app.post("/api/scripts/import", async (request, response) => {
  const items = Array.isArray(request.body?.items) ? request.body.items.slice(0, 500) : [];
  if (!items.length) return response.status(400).json({ error: "没有可导入的文案" });

  const existing = await listJson(path.join(projectRoot, "data", "scripts"));
  const existingKeys = new Set(existing.map((item) => `${item.title}\n${item.script}`));
  const imported = [];
  const skipped = [];
  for (let index = 0; index < items.length; index += 1) {
    try {
      const normalized = sanitizeScriptRecord(items[index]);
      const key = `${normalized.title}\n${normalized.script}`;
      if (existingKeys.has(key)) {
        skipped.push({ row: index + 2, reason: "重复文案" });
        continue;
      }
      const id = crypto.randomUUID();
      const record = {
        id,
        ...normalized,
        status: "ready",
        createdAt: new Date().toISOString(),
        source: "file-import"
      };
      await saveJson(path.join(projectRoot, "data", "scripts", `${id}.json`), record);
      existingKeys.add(key);
      imported.push(record);
    } catch (error) {
      skipped.push({ row: index + 2, reason: error.message });
    }
  }
  response.status(201).json({ imported, skipped });
});

app.put("/api/scripts/:id", async (request, response) => {
  const id = String(request.params.id || "");
  if (!/^[a-zA-Z0-9_-]{8,80}$/u.test(id)) return response.status(400).json({ error: "文案编号无效" });
  const filePath = path.join(projectRoot, "data", "scripts", `${id}.json`);
  const existing = await readJson(filePath);
  if (!existing) return response.status(404).json({ error: "没有找到该文案" });
  try {
    const editable = request.body?.title !== undefined || request.body?.script !== undefined
      ? sanitizeScriptRecord({ ...existing, ...request.body }, existing)
      : { ...existing, updatedAt: new Date().toISOString() };
    const next = {
      ...editable,
      status: ["ready", "queued", "processing", "completed", "failed"].includes(request.body?.status)
        ? request.body.status
        : editable.status,
      lastJobId: request.body?.lastJobId ?? editable.lastJobId ?? null,
      outputUrl: request.body?.outputUrl ?? editable.outputUrl ?? null,
      error: request.body?.error ?? editable.error ?? null,
      lastGeneratedAt: request.body?.lastGeneratedAt ?? editable.lastGeneratedAt ?? null
    };
    await saveJson(filePath, next);
    response.json(next);
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.delete("/api/scripts/:id", async (request, response) => {
  const id = String(request.params.id || "");
  if (!/^[a-zA-Z0-9_-]{8,80}$/u.test(id)) return response.status(400).json({ error: "文案编号无效" });
  const deleted = await deleteJson(path.join(projectRoot, "data", "scripts", `${id}.json`));
  if (!deleted) return response.status(404).json({ error: "没有找到该文案" });
  response.status(204).end();
});

app.post("/api/voice-preview", async (request, response, next) => {
  if (!hasMiniMaxApiKey()) {
    return response.status(503).json({ error: "未检测到 MINIMAX_API_KEY，请重新启动本地服务" });
  }

  const text = String(request.body?.text || "").trim().slice(0, 180);
  if (text.length < 2) return response.status(400).json({ error: "请先输入用于试听的文案" });

  try {
    const result = await requestMiniMaxSpeech({
      text,
      voiceId: request.body?.voiceId,
      emotion: request.body?.emotion,
      pace: request.body?.pace
    });
    response.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": String(result.buffer.length),
      "Cache-Control": "no-store",
      "X-Speech-Model": result.model
    });
    response.send(result.buffer);
  } catch (error) {
    console.error(error);
    response.status(502).json({ error: "MiniMax 配音请求失败", details: error.message });
  }
});

app.post("/api/storyboard", async (request, response) => {
  if (!hasDeepSeekApiKey()) {
    return response.status(503).json({ error: "未检测到 DEEPSEEK_API_KEY，请重新启动本地服务" });
  }

  const script = String(request.body?.script || "").trim();
  if (script.length < 8) return response.status(400).json({ error: "文案至少需要8个字" });
  if (script.length > 3000) return response.status(400).json({ error: "单条文案最多支持3000字" });

  try {
    const storyboard = await requestDeepSeekStoryboard({
      script,
      title: String(request.body?.title || "").slice(0, 80),
      tag: String(request.body?.tag || "").slice(0, 40)
    });
    response.json(storyboard);
  } catch (error) {
    console.error(error);
    response.status(502).json({ error: "DeepSeek 分镜失败", details: error.message });
  }
});

app.post("/api/render", async (request, response) => {
  const script = String(request.body?.script || "").trim();
  if (script.length < 8) {
    return response.status(400).json({ error: "文案至少需要8个字" });
  }

  const id = crypto.randomUUID();
  const job = {
    id,
    status: "queued",
    progress: 0,
    stage: "等待开始",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  jobs.set(id, job);
  await saveJson(path.join(projectRoot, "data", "jobs", `${id}.json`), job);
  response.status(202).json(job);

  queueMicrotask(async () => {
    try {
      Object.assign(job, { status: "processing", stage: "正在准备", updatedAt: new Date().toISOString() });
      const result = await renderVideo({
        projectRoot,
        jobId: id,
        input: request.body,
        onProgress(update) {
          Object.assign(job, update, { status: "processing", updatedAt: new Date().toISOString() });
        }
      });
      Object.assign(job, {
        status: "completed",
        progress: 100,
        stage: "视频生成完成",
        result,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      Object.assign(job, {
        status: "failed",
        stage: "生成失败",
        error: error.message,
        details: error.details || null,
        updatedAt: new Date().toISOString()
      });
      console.error(error);
    }
    await saveJson(path.join(projectRoot, "data", "jobs", `${id}.json`), job);
  });
});

app.get("/api/jobs/:id", async (request, response) => {
  const job = jobs.get(request.params.id);
  if (!job) return response.status(404).json({ error: "没有找到该生成任务" });
  response.json(job);
});

const distDirectory = path.join(projectRoot, "dist");
if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDirectory));
  app.get("*path", (_request, response) => response.sendFile(path.join(distDirectory, "index.html")));
}

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: "本地服务发生错误", details: error.message });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`星格本地服务已启动：http://127.0.0.1:${port}`);
});
