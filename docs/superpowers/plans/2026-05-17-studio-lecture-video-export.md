# Studio 讲解视频导出（1080p MP4）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 Studio 当前 PPT + 讲解音导出为 1080p MP4，支持预览播放与下载。

**架构：** 客户端上传 IndexedDB 音频包 → 异步 job → Playwright 按场景截图（slide 真实画布 / 非 slide 摘要卡）→ FFmpeg 按 speech 段合成 → 提供 `video/mp4` URL。范围 B：全部场景类型。

**技术栈：** Next.js App Router、现有 `export-video` job store、Playwright（headless）、FFmpeg CLI、JSZip、Vitest。

**设计规格：** `docs/superpowers/specs/2026-05-17-studio-lecture-video-export-design.md`

---

## 将创建/修改的文件

| 文件 | 职责 |
|------|------|
| `lib/server/video-export-job-store.ts` | Artifact 改为 MP4 字段；新增 `assetsDir` 工作目录 |
| `lib/server/video-export/timeline.ts` | 时间线构建 + 音频校验 |
| `lib/server/video-export/ffmpeg.ts` | ffprobe 时长、编码、concat |
| `lib/server/video-export/render-token.ts` | HMAC token |
| `lib/server/video-export/playwright-render.ts` | 截图 |
| `lib/server/video-export-runner.ts` | 完整 job 编排 |
| `app/api/export-video/[jobId]/assets/route.ts` | 接收 audio zip |
| `app/api/export-video/[jobId]/video/route.ts` | 流式 MP4 |
| `app/export-video/render/[jobId]/page.tsx` | Headless 渲染页 |
| `components/video-export/summary-card.tsx` | 非 slide 摘要 |
| `components/video-export/slide-export-viewport.tsx` | 1920×1080 slide 容器 |
| `lib/teacher/collect-export-audio.ts` | 客户端 zip |
| `lib/teacher/video-export-client.ts` | uploadAssets + 类型 |
| `components/course-editor/video-export-dialog.tsx` | 预览/下载 UI |
| `components/course-editor/course-editor-shell.tsx` | 接入 Dialog |
| `lib/i18n/locales/*.json` | 文案 |
| `tests/server/video-export-timeline.test.ts` | 单元测试 |
| `tests/server/video-export-runner.test.ts` | 集成（mock ffmpeg） |

---

### 任务 1：时间线构建与音频校验

**文件：**
- 创建：`lib/server/video-export/timeline.ts`
- 创建：`tests/server/video-export-timeline.test.ts`
- 修改：`lib/server/video-export-runner.ts`（仅导出 `buildVideoRenderPlan` 迁移引用，本任务末尾）

- [ ] **步骤 1：编写失败测试**

```typescript
// tests/server/video-export-timeline.test.ts
import { describe, it, expect } from 'vitest';
import { buildVideoTimeline, VideoExportValidationError } from '@/lib/server/video-export/timeline';
import type { Scene } from '@/lib/types/stage';

const slideScene = (order: number, speech?: { id: string; text: string; audioUrl?: string }): Scene =>
  ({
    id: `scene-${order}`,
    stageId: 'class-1',
    type: 'slide',
    title: `Slide ${order}`,
    order,
    content: { type: 'slide', canvas: { elements: [] } },
    actions: speech
      ? [{ id: speech.id, type: 'speech', text: speech.text, audioUrl: speech.audioUrl }]
      : [],
  }) as Scene;

describe('buildVideoTimeline', () => {
  it('builds segments with probed duration when audio exists', async () => {
    // mock ffprobe via inject probeDurationMs in options
    const timeline = await buildVideoTimeline({
      scenes: [slideScene(1, { id: 'a1', text: 'hello', audioUrl: '/a.mp3' })],
      assetsDir: '/tmp/job-1',
      probeDurationMs: async () => 3200,
    });
    expect(timeline.segments).toHaveLength(1);
    expect(timeline.segments[0].durationMs).toBe(3200);
    expect(timeline.width).toBe(1920);
    expect(timeline.height).toBe(1080);
  });

  it('uses default duration for slide without speech', async () => {
    const timeline = await buildVideoTimeline({
      scenes: [slideScene(1)],
      assetsDir: '/tmp/job-1',
    });
    expect(timeline.segments[0].durationMs).toBe(3000);
  });

  it('throws when speech text exists but no resolvable audio', async () => {
    await expect(
      buildVideoTimeline({
        scenes: [slideScene(1, { id: 'a1', text: 'hello' })],
        assetsDir: '/tmp/job-1',
      }),
    ).rejects.toBeInstanceOf(VideoExportValidationError);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`pnpm test tests/server/video-export-timeline.test.ts`  
预期：FAIL，`Cannot find module '@/lib/server/video-export/timeline'`

- [ ] **步骤 3：实现 timeline.ts**

```typescript
// lib/server/video-export/timeline.ts
import path from 'path';
import type { Scene } from '@/lib/types/stage';
import type { SpeechAction } from '@/lib/types/action';

export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const DEFAULT_SLIDE_MS = 3000;
export const DEFAULT_SUMMARY_MS = 5000;

export class VideoExportValidationError extends Error {
  constructor(
    message: string,
    readonly missingAudioSceneIds: string[],
  ) {
    super(message);
    this.name = 'VideoExportValidationError';
  }
}

export interface VideoTimelineSegment {
  sceneId: string;
  sceneType: Scene['type'];
  renderMode: 'slide' | 'summary';
  durationMs: number;
  audioPath?: string;
}

export interface VideoTimeline {
  width: number;
  height: number;
  segments: VideoTimelineSegment[];
  durationMs: number;
}

function resolveAudioPath(
  speech: SpeechAction,
  assetsDir: string,
): string | undefined {
  if (speech.audioUrl) {
    // Server URL → copy or map to local file in runner; timeline only needs relative name
    return speech.audioUrl;
  }
  if (speech.audioId) {
    for (const ext of ['mp3', 'wav', 'm4a', 'webm']) {
      const p = path.join(assetsDir, 'audio', `${speech.audioId}.${ext}`);
      return p; // existence checked in runner before probe
    }
  }
  return undefined;
}

export async function buildVideoTimeline(options: {
  scenes: Scene[];
  assetsDir: string;
  probeDurationMs?: (audioPath: string) => Promise<number>;
}): Promise<VideoTimeline> {
  const probe = options.probeDurationMs;
  const missing: string[] = [];
  const segments: VideoTimelineSegment[] = [];

  const sorted = [...options.scenes].sort((a, b) => a.order - b.order);

  for (const scene of sorted) {
    const speeches = (scene.actions ?? []).filter(
      (a): a is SpeechAction => a.type === 'speech' && !!a.text,
    );
    const renderMode = scene.type === 'slide' ? 'slide' : 'summary';

    if (speeches.length === 0) {
      segments.push({
        sceneId: scene.id,
        sceneType: scene.type,
        renderMode,
        durationMs: scene.type === 'slide' ? DEFAULT_SLIDE_MS : DEFAULT_SUMMARY_MS,
      });
      continue;
    }

    for (const speech of speeches) {
      const audioPath = resolveAudioPath(speech, options.assetsDir);
      if (!audioPath) {
        missing.push(scene.id);
        continue;
      }
      const durationMs = probe ? await probe(audioPath) : DEFAULT_SLIDE_MS;
      segments.push({
        sceneId: scene.id,
        sceneType: scene.type,
        renderMode,
        durationMs,
        audioPath,
      });
    }
  }

  if (missing.length > 0) {
    throw new VideoExportValidationError(
      `Missing audio for ${missing.length} scene(s)`,
      [...new Set(missing)],
    );
  }

  const durationMs = segments.reduce((t, s) => t + s.durationMs, 0);
  return {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    segments,
    durationMs,
  };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`pnpm test tests/server/video-export-timeline.test.ts`  
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add lib/server/video-export/timeline.ts tests/server/video-export-timeline.test.ts
git commit -m "feat(video-export): add timeline builder with audio validation"
```

---

### 任务 2：FFmpeg 封装

**文件：**
- 创建：`lib/server/video-export/ffmpeg.ts`
- 创建：`tests/server/video-export-ffmpeg.test.ts`

- [ ] **步骤 1：编写测试（mock child_process）**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { probeAudioDurationMs, isFfmpegAvailable } from '@/lib/server/video-export/ffmpeg';

vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd, _args, _opts, cb) => cb(null, { stdout: '3.200000\n' })),
}));

describe('ffmpeg', () => {
  it('parses ffprobe duration', async () => {
    const ms = await probeAudioDurationMs('/tmp/a.mp3');
    expect(ms).toBe(3200);
  });
});
```

- [ ] **步骤 2：运行确认失败**

`pnpm test tests/server/video-export-ffmpeg.test.ts` → FAIL module not found

- [ ] **步骤 3：实现 ffmpeg.ts**

核心函数：
- `isFfmpegAvailable(): Promise<boolean>`
- `probeAudioDurationMs(file: string): Promise<number>`
- `encodeStillWithAudio(png, audio | null, durationMs, outPath): Promise<void>` — `ffmpeg -loop 1 -i frame.png -i audio -c:v libx264 -t {sec} -pix_fmt yuv420p -c:a aac`
- `concatMp4(segmentPaths: string[], outPath: string): Promise<void>` — concat demuxer

使用 `execFile` from `node:child_process` promisified；Windows 上 `ffmpeg` 需在 PATH（文档写入 spec 旁注）。

- [ ] **步骤 4：测试通过**

- [ ] **步骤 5：Commit** — `feat(video-export): add ffmpeg helpers`

---

### 任务 3：Job store 与 assets 上传

**文件：**
- 修改：`lib/server/video-export-job-store.ts`
- 创建：`app/api/export-video/[jobId]/assets/route.ts`

- [ ] **步骤 1：扩展 `VideoExportArtifact`**

```typescript
export interface VideoExportArtifact {
  videoPath: string;
  videoUrl: string;
  durationSeconds: number;
  width: 1920;
  height: 1080;
  format: 'mp4';
}
```

新增 `workDir: string` 于 job（可选字段），`assetsUploadedAt?: string`。

- [ ] **步骤 2：assets 路由**

- 校验 `jobId`、`Content-Type` multipart
- 解压 zip 到 `data/video-exports/{jobId}/assets/`
- `updateVideoExportJob` → `step: 'collecting-assets'`, `progress: 25`
- 若 runner 已等待 assets，继续（见任务 5）

- [ ] **步骤 3：Commit** — `feat(video-export): accept client audio assets upload`

---

### 任务 4：渲染页 + 摘要卡组件

**文件：**
- 创建：`components/video-export/summary-card.tsx`
- 创建：`components/video-export/slide-export-viewport.tsx`
- 创建：`app/export-video/render/[jobId]/page.tsx`
- 创建：`lib/server/video-export/render-token.ts`

- [ ] **步骤 1：render-token**

`signExportRenderToken(jobId, classroomId)` / `verifyExportRenderToken(token, jobId)` — HMAC-SHA256，TTL 15 分钟，secret 来自 `process.env.VIDEO_EXPORT_RENDER_SECRET` 或 `NEXTAUTH_SECRET` fallback。

- [ ] **步骤 2：summary-card**

Props: `{ scene: Scene }` — 显示 `scene.title`、`scene.type` 标签、quiz 题干前 120 字。

固定尺寸容器 `width:1920;height:1080`，白底/主题色与 Studio 一致。

- [ ] **步骤 3：slide-export-viewport**

加载 `scene.content` canvas，复用 `ScreenCanvas` 或 `SlideRenderer` 只读模式，`viewportSize` 缩放至 1920 宽。

暴露：

```typescript
declare global {
  interface Window {
    __exportVideoReady?: boolean;
    __exportVideoCapture?: (sceneId: string) => Promise<void>;
  }
}
```

`__exportVideoCapture` 在 `#export-root` 上调用 `html-to-image` 或 `dom-to-image-more`（若项目无依赖则用 Playwright 原生 `page.screenshot({ selector })` 即可，**优先 Playwright locator 截图**避免新依赖）。

- [ ] **步骤 4：render page**

Server component 读取 job + classroom（内部 API），client 子组件 `ExportVideoRenderClient` 接收 `scenes`、`initialSceneId`。

URL: `/export-video/render/[jobId]?token=...`

- [ ] **步骤 5：Commit** — `feat(video-export): add headless render page and summary card`

---

### 任务 5：Playwright 截图编排

**文件：**
- 创建：`lib/server/video-export/playwright-render.ts`

- [ ] **步骤 1：实现 `captureSceneFrames`**

```typescript
export async function captureSceneFrames(options: {
  baseUrl: string;
  jobId: string;
  token: string;
  segments: VideoTimelineSegment[];
  framesDir: string;
}): Promise<Map<string, string>>; // sceneId -> png path
```

- 启动 chromium `headless: true`
- 对每个唯一 `sceneId` 导航一次 `export-video/render/{jobId}?sceneId=...&token=...`
- 等待 `window.__exportVideoReady === true`
- `page.screenshot({ path, type: 'png' })` 1920×1080
- 关闭 browser

- [ ] **步骤 2：在开发环境手动验证**

`pnpm dev` 后对一个测试 job 调用（可写 `tsx scripts/debug-video-render.ts` 临时脚本，**不提交**或提交到 `scripts/` 若团队允许）。

- [ ] **步骤 3：Commit** — `feat(video-export): playwright scene frame capture`

---

### 任务 6：Runner 编排 MP4 输出

**文件：**
- 修改：`lib/server/video-export-runner.ts`
- 创建：`app/api/export-video/[jobId]/video/route.ts`
- 修改：`app/api/export-video/[jobId]/route.ts`（GET 返回 `videoUrl`）
- 删除或弃用：成功态写 `render-plan.json` 逻辑

- [ ] **步骤 1：runner 流程**

```
markRunning → readClassroom → ensure workDir
→ wait assets (timeout 60s if client upload expected; skip if all audioUrl)
→ buildVideoTimeline + ffprobe
→ captureSceneFrames
→ for each segment: encodeStillWithAudio → segments/*.mp4
→ concatMp4 → {jobId}.mp4
→ markSucceeded({ videoUrl: `/api/export-video/${id}/video`, ... })
```

- [ ] **步骤 2：video 路由**

- `Content-Type: video/mp4`
- `download=1` → `Content-Disposition: attachment; filename="{classroomName}-lecture.mp4"`

- [ ] **步骤 3：集成测试（mock）**

`tests/server/video-export-runner.test.ts` — mock `playwright-render` 与 `ffmpeg` 为写固定小 mp4，断言 job status succeeded。

- [ ] **步骤 4：Commit** — `feat(video-export): produce 1080p mp4 in job runner`

---

### 任务 7：客户端音频收集与 API 客户端

**文件：**
- 创建：`lib/teacher/collect-export-audio.ts`
- 修改：`lib/teacher/video-export-client.ts`
- 创建：`tests/teacher/collect-export-audio.test.ts`

- [ ] **步骤 1：collect-export-audio**

```typescript
export async function buildExportAudioZip(scenes: Scene[]): Promise<Blob | null>
```

复用 `collectAudioFiles` from `classroom-zip-utils`；无本地音频且全靠 `audioUrl` 时返回 `null`。

- [ ] **步骤 2：video-export-client**

```typescript
export async function uploadVideoExportAssets(jobId: string, zip: Blob): Promise<void>
```

`POST /api/export-video/${jobId}/assets` FormData field `file`.

扩展 `VideoExportJobSnapshot.artifact` 含 `videoUrl`.

- [ ] **步骤 3：测试 + Commit**

---

### 任务 8：VideoExportDialog UI

**文件：**
- 创建：`components/course-editor/video-export-dialog.tsx`
- 修改：`components/course-editor/course-editor-shell.tsx`

- [ ] **步骤 1：Dialog 状态机**

`idle | saving | uploading | processing | succeeded | failed`

- [ ] **步骤 2：成功态**

```tsx
<video controls src={videoUrl} className="w-full rounded-lg" />
<Button asChild><a href={`${videoUrl}?download=1`} download>…</a></Button>
```

- [ ] **步骤 3：接入 shell**

`startVideoExport` → 打开 dialog → `persistCourseToServer` → `createVideoExportDraft` → `uploadVideoExportAssets`（若有）→ `waitForVideoExportJob`

移除「查看草稿」JSON 链接。

- [ ] **步骤 4：Commit** — `feat(course-editor): video export dialog with preview and download`

---

### 任务 9：i18n

**文件：** `lib/i18n/locales/*.json`（7 个 locale）

- [ ] **步骤 1：更新键**

| 键 | zh-CN 示例 |
|----|------------|
| `courseEditor.publishVideoDraft` | 生成讲解视频 |
| `courseEditor.videoExportCreating` | 正在生成讲解视频… |
| `courseEditor.videoExportRunning` | 正在编码（{{progress}}%） |
| `courseEditor.videoExportSucceeded` | 讲解视频已就绪（{{duration}} 秒） |
| `courseEditor.videoExportViewDraft` | 删除或改为 `videoExportDownload`：下载 MP4 |
| `courseEditor.videoExportPreview` | 预览 |
| `courseEditor.videoExportMissingAudio` | 以下场景缺少讲解音频：{{scenes}} |
| `courseEditor.videoExportUploading` | 正在上传讲解音频… |

- [ ] **步骤 2：运行** `pnpm check:i18n-keys`

- [ ] **步骤 3：Commit** — `i18n: lecture video export strings`

---

### 任务 10：文档与验证

- [ ] **步骤 1：** 在 `AGENTS.md` 或 `.env.example` 增加 `VIDEO_EXPORT_RENDER_SECRET`、FFmpeg PATH 说明（各 1 行）。

- [ ] **步骤 2：** 全量验证

```bash
pnpm test tests/server/video-export-timeline.test.ts tests/server/video-export-ffmpeg.test.ts tests/server/video-export-runner.test.ts tests/teacher/collect-export-audio.test.ts
pnpm check:i18n-keys
npx tsc --noEmit
pnpm lint
```

- [ ] **步骤 3：Commit** — `docs: video export env and verification`

---

## 规格自检

| 需求 | 任务 |
|------|------|
| 范围 B 全场景 | 任务 1 `renderMode`、任务 4 summary-card |
| 1080p MP4 | 任务 2、6 |
| 预览 + 下载 | 任务 6 video 路由、任务 8 Dialog |
| 客户端音频上传 | 任务 3、7 |
| 缺音频阻断 | 任务 1 `VideoExportValidationError`、任务 8 展示 |
| Studio 入口 | 任务 8 |
| 异步进度 | 任务 6、8 |

无占位符段落；类型名 `VideoExportArtifact`、`VideoTimelineSegment` 全文一致。

---

## 执行方式

计划已保存到 `docs/superpowers/plans/2026-05-17-studio-lecture-video-export.md`。

1. **子代理驱动（推荐）** — 每任务新子代理 + 审查  
2. **内联执行** — 当前会话用 executing-plans 批量执行  

设计规格：`docs/superpowers/specs/2026-05-17-studio-lecture-video-export-design.md`（已批准）。

若要开始写代码，请回复 **「开始实现」** 并选择执行方式（1 或 2）。
