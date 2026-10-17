# 星格制片台

星格观察局的短视频生成工具。输入文案后，工具会调用 MiniMax 生成情感配音，并在本机完成字幕时间轴和 1080 × 1920 竖屏视频渲染。

## 已实现

- React 响应式制片界面
- 文案库支持 Excel / CSV 批量导入、搜索、编辑、删除和生成状态管理
- 可单条直接生成或多选批量生成；批量任务默认 2 路并发，单片渲染继续使用多线程编码
- 每条成片自动追加 2.8 秒品牌片尾，并自动补齐静音音轨
- 提供 `public/templates/星格文案批量导入模板.xlsx`，字段为视频标题、内容标签、正文内容
- 文案字数、预计时长和 DeepSeek 语义分镜
- 草稿保存在本地 `data/drafts/`
- MiniMax `speech-2.8-hd` 在线情感配音
- 5 种中文声音、5 种情绪基调和在线试听
- DeepSeek `deepseek-flash` 自动识别钩子、分析、矛盾、反转与互动
- DeepSeek 先分析全文情绪弧线，再按完整语义切镜；失败时自动回退本地规则
- DeepSeek 同时规划语义分行、重点词、版式类型、对齐方式与逐行出现顺序
- 本地渲染器校验原文完整性和画面安全宽度；超宽行仅做安全细分，异常排版自动回退
- 整篇文案仅调用一次 MiniMax，固定声纹并由完整上下文自动表达情绪
- 使用 MiniMax 字级时间戳精确安排字幕镜头
- 每一行字幕优先跟随 MiniMax 词级时间戳出现，缺失时间戳时自动回退时长算法
- 字幕按字体安全宽度智能换行，避免长句超出竖屏安全区
- 文案、声音、语速、情绪和镜头文本不变时，复用已生成旁白，只重新渲染画面
- DeepSeek 排版结果可在页面中继续编辑换行、强调词、版式与对齐方式，并校验原文完整性
- 两遍 FFmpeg 响度标准化，目标为 `-16 LUFS / -1.5 dBTP`
- 未配置 MiniMax 时自动使用 macOS 中文系统声音兜底
- FFmpeg 生成 H.264 / AAC MP4
- 根据真实配音时长安排字幕
- 诗意行楷、文艺宋体、魏碑标题三套可切换字体方案
- 字幕逐行追加，保持同一画面中的其他元素稳定
- 异步生成任务与进度显示
- 成片网页预览和下载

## 启动

双击 `start.command`，或在终端运行：

```bash
npm install
npm run dev
```

MiniMax 和 DeepSeek API Key 从系统环境变量读取：

```bash
export MINIMAX_API_KEY="你的 API Key"
export DEEPSEEK_API_KEY="你的 API Key"
```

`start.command` 在没有读取到 Key 时会自动加载 `~/.zshrc`。MiniMax 中国站与国际站 API 端点会自动匹配，也可通过 `MINIMAX_TTS_ENDPOINT` 手动指定；DeepSeek 模型可通过 `DEEPSEEK_MODEL` 覆盖，默认使用 `deepseek-flash`。

打开 `http://127.0.0.1:5173/`。

## 项目结构

```text
src/                  React 前端
server/               本地 API 与渲染服务
server/video/         文案分析、字幕和视频生成
public/assets/         品牌素材
data/drafts/          本地草稿
data/scripts/         文案库数据与生成状态
data/jobs/            渲染任务和中间文件
public/templates/     文案批量导入模板
exports/              最终 MP4 文件
```

## 本机依赖

- Node.js 22+
- FFmpeg / FFprobe
- MiniMax API Key（推荐）
- DeepSeek API Key（推荐；未配置时使用本地规则分镜）
- macOS `say` 中文声音（仅作为离线兜底，默认使用 Tingting）
- macOS 系统中文字体（行楷、楷体、宋体、魏碑、兰亭黑）

视频、配音文件和导出结果保存在本机；文案会发送到 DeepSeek API 用于语义分镜、情绪与文字排版规划，并发送到 MiniMax API 用于生成配音。本版本不包含自动发布抖音功能。
