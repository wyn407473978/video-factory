import { useEffect, useMemo, useRef, useState } from "react";
import readXlsxFile from "read-excel-file";

const STATUS_LABELS = {
  ready: "待生成",
  queued: "排队中",
  processing: "生成中",
  completed: "已完成",
  failed: "失败"
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/u, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => String(cell).trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field);
  if (row.some((cell) => String(cell).trim())) rows.push(row);
  return rows;
}

function normalizeImportRows(rows) {
  if (!Array.isArray(rows) || rows.length < 2) throw new Error("文件中没有可导入的数据");
  const headers = rows[0].map((cell) => String(cell || "").trim());
  const aliases = {
    title: ["视频标题", "标题", "title"],
    tag: ["内容标签", "标签", "tag"],
    script: ["正文内容", "正文", "文案", "script", "content"]
  };
  const indexes = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [
    key,
    headers.findIndex((header) => names.some((name) => name.toLowerCase() === header.toLowerCase()))
  ]));
  if (indexes.title < 0 || indexes.tag < 0 || indexes.script < 0) {
    throw new Error("表头必须包含：视频标题、内容标签、正文内容");
  }
  return rows.slice(1).map((row) => ({
    title: String(row[indexes.title] || "").trim(),
    tag: String(row[indexes.tag] || "").trim(),
    script: String(row[indexes.script] || "").trim()
  })).filter((item) => item.title || item.tag || item.script);
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export default function ScriptLibrary({ onEdit, notify, service }) {
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [runningIds, setRunningIds] = useState(new Set());
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [query, setQuery] = useState("");
  const fileInputRef = useRef(null);

  async function loadScripts() {
    setLoading(true);
    try {
      const response = await fetch("/api/scripts");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "文案库加载失败");
      setScripts(data);
    } catch (error) {
      notify(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadScripts();
  }, []);

  async function updateRecord(id, patch) {
    const response = await fetch(`/api/scripts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "文案状态更新失败");
    setScripts((current) => current.map((item) => item.id === id ? data : item));
    return data;
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      const rows = extension === "xlsx"
        ? await readXlsxFile(file)
        : parseCsv(await file.text());
      const items = normalizeImportRows(rows);
      if (items.length > 500) throw new Error("单次最多导入500条文案");
      const response = await fetch("/api/scripts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "导入失败");
      await loadScripts();
      notify(`成功导入 ${data.imported.length} 条${data.skipped.length ? `，跳过 ${data.skipped.length} 条` : ""}`);
    } catch (error) {
      notify(`无法导入：${error.message}`);
    } finally {
      setImporting(false);
    }
  }

  async function waitForJob(jobId, item) {
    while (true) {
      await delay(900);
      const response = await fetch(`/api/jobs/${jobId}`);
      const job = await response.json();
      if (!response.ok) throw new Error(job.error || "生成任务不存在");
      setScripts((current) => current.map((record) => record.id === item.id
        ? { ...record, status: job.status, progress: job.progress, stage: job.stage }
        : record));
      if (job.status === "completed") return job;
      if (job.status === "failed") throw new Error(job.error || "视频生成失败");
    }
  }

  async function generateItem(item, { quiet = false } = {}) {
    if (runningIds.has(item.id)) return false;
    setRunningIds((current) => new Set(current).add(item.id));
    try {
      await updateRecord(item.id, { status: "queued", error: null });
      const response = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          tag: item.tag,
          script: item.script,
          pace: 3.4,
          fontStyle: "poetic",
          voiceId: "Chinese (Mandarin)_Warm_Girl",
          emotion: "auto"
        })
      });
      const job = await response.json();
      if (!response.ok) throw new Error(job.error || "无法开始生成");
      await updateRecord(item.id, { status: "processing", lastJobId: job.id });
      const completed = await waitForJob(job.id, item);
      await updateRecord(item.id, {
        status: "completed",
        outputUrl: completed.result.outputUrl,
        lastJobId: job.id,
        lastGeneratedAt: new Date().toISOString(),
        error: null
      });
      if (!quiet) notify(`《${item.title}》视频生成完成`);
      return true;
    } catch (error) {
      await updateRecord(item.id, { status: "failed", error: error.message }).catch(() => {});
      if (!quiet) notify(`《${item.title}》生成失败：${error.message}`);
      return false;
    } finally {
      setRunningIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function generateSelected() {
    const queue = scripts.filter((item) => selectedIds.has(item.id));
    if (!queue.length) return notify("请先选择要生成的视频文案");
    if (!service.ok || !service.tools?.ffmpeg) return notify("视频服务尚未准备好");
    setBulkGenerating(true);
    let cursor = 0;
    let succeeded = 0;
    const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
      while (cursor < queue.length) {
        const item = queue[cursor];
        cursor += 1;
        if (await generateItem(item, { quiet: true })) succeeded += 1;
      }
    });
    await Promise.all(workers);
    setBulkGenerating(false);
    notify(`批量生成完成：成功 ${succeeded} 条，失败 ${queue.length - succeeded} 条`);
  }

  async function deleteItem(item) {
    const response = await fetch(`/api/scripts/${item.id}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      const data = await response.json().catch(() => ({}));
      return notify(data.error || "删除失败");
    }
    setScripts((current) => current.filter((record) => record.id !== item.id));
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
    notify("文案已从文案库删除");
  }

  const filteredScripts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return scripts;
    return scripts.filter((item) => [item.title, item.tag, item.script]
      .some((value) => String(value || "").toLowerCase().includes(keyword)));
  }, [query, scripts]);
  const allVisibleSelected = filteredScripts.length > 0
    && filteredScripts.every((item) => selectedIds.has(item.id));
  const completedCount = scripts.filter((item) => item.status === "completed").length;

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      filteredScripts.forEach((item) => {
        if (allVisibleSelected) next.delete(item.id);
        else next.add(item.id);
      });
      return next;
    });
  }

  return (
    <main className="workspace library-workspace">
      <section className="page-heading library-heading">
        <div>
          <p className="eyebrow">SCRIPT LIBRARY</p>
          <h1>批量管理和生成视频文案</h1>
          <p className="lead">从 Excel 或 CSV 导入文案；批量生成同时处理 2 条视频，单片继续使用多线程编码。</p>
        </div>
        <div className="library-actions">
          <a className="button ghost template-download" href="/templates/星格文案批量导入模板.xlsx" download>下载 Excel 模板</a>
          <button className="button primary small" type="button" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? "导入中…" : "批量导入"}
          </button>
          <input ref={fileInputRef} className="visually-hidden" type="file" accept=".xlsx,.csv,text/csv" onChange={handleImport} />
        </div>
      </section>

      <section className="library-summary">
        <div><span>文案总数</span><strong>{scripts.length}</strong></div>
        <div><span>已生成</span><strong>{completedCount}</strong></div>
        <div><span>已选择</span><strong>{selectedIds.size}</strong></div>
        <div className="library-help"><strong>模板字段</strong><span>视频标题 · 内容标签 · 正文内容</span></div>
      </section>

      <section className="panel library-panel">
        <div className="library-toolbar">
          <label className="library-select-all">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
            <span>全选当前结果</span>
          </label>
          <input className="library-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、标签或正文" />
          <button className="button primary small" type="button" onClick={generateSelected} disabled={!selectedIds.size || bulkGenerating}>
            {bulkGenerating ? "批量生成中…" : `批量生成${selectedIds.size ? `（${selectedIds.size}）` : ""}`}
          </button>
        </div>

        {loading ? (
          <div className="library-empty">正在加载文案库…</div>
        ) : filteredScripts.length === 0 ? (
          <div className="library-empty">
            <strong>{scripts.length ? "没有匹配的文案" : "文案库还是空的"}</strong>
            <span>{scripts.length ? "换一个关键词试试。" : "下载模板填写后，点击“批量导入”开始。"}</span>
          </div>
        ) : (
          <div className="script-table-wrap">
            <table className="script-table">
              <thead><tr><th>选择</th><th>视频标题</th><th>内容标签</th><th>正文内容</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {filteredScripts.map((item) => {
                  const running = runningIds.has(item.id) || ["queued", "processing"].includes(item.status);
                  return (
                    <tr key={item.id}>
                      <td><input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => setSelectedIds((current) => {
                        const next = new Set(current);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      })} /></td>
                      <td><strong>{item.title}</strong><small>{item.updatedAt ? new Date(item.updatedAt).toLocaleString("zh-CN", { hour12: false }) : ""}</small></td>
                      <td><span className="script-tag">{item.tag}</span></td>
                      <td><p>{item.script}</p></td>
                      <td>
                        <span className={`script-status status-${item.status || "ready"}`}>{STATUS_LABELS[item.status] || "待生成"}</span>
                        {running && Number.isFinite(item.progress) && <small>{item.progress}% · {item.stage}</small>}
                        {item.error && <small className="script-error">{item.error}</small>}
                      </td>
                      <td>
                        <div className="script-actions">
                          <button type="button" onClick={() => onEdit(item)}>编辑制片</button>
                          <button type="button" onClick={() => generateItem(item)} disabled={running}>{running ? "生成中" : "直接生成"}</button>
                          {item.outputUrl && <a href={item.outputUrl} download>下载</a>}
                          <button className="danger" type="button" onClick={() => deleteItem(item)} disabled={running}>删除</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
