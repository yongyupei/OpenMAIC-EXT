# AI 运行时观测系统设计

- 日期：2026-05-28
- 主题：ai-runtime-observability
- 状态：已 brainstorm，待 writing-plans
- 作者：fork branch `feat/html-slide-design-workbench`
- 关联：[CONTRIBUTING/AGENTS.md 二开规范](../../../AGENTS.md)、[extends/DEVELOPMENT_GUIDE.md](../../../extends/DEVELOPMENT_GUIDE.md)

---

## 1 背景与动机

### 1.1 当前痛点

`open-maic` 已经把所有 LLM 调用收敛到 `lib/ai/llm.ts` 的 `callLLM` 单点，并通过 `chapterClassroom.status / generationStep / failedReason` 把"哪一步成功 / 哪一步失败"暴露给用户。但日志能力存在显著缺口：

| 维度 | 现状 | 缺口 |
| --- | --- | --- |
| `lib/logger.ts` | `createLogger(tag)` 仅写 console，支持 `LOG_FORMAT=json` | 无持久化、无 `traceId`、无结构化字段，dev 重启即丢 |
| `callLLM` | 全统一入口，接 `source: string` | 不暴露 `model id / providerId / inputTokens / outputTokens / latencyMs / retryAttempts` |
| `chapterClassroom` 状态机 | 写 `status + generationStep` 到项目 JSON | 失败现场仅保留 `failedReason: string`，丢失 `stack / prompt / upstream response body` |
| 媒体 fallback | `log.warn` 一行 | 教师 / 运营完全感知不到课件用了占位图 |
| `eval/` | 离线评测脚本 + Markdown 报告 | 与生产无关 |

### 1.2 真实诊断案例

`2026-05-28` 章节生成期间 LLM 上游网关返回 502 Bad Gateway：

```text
[ERROR] [Teacher Chapter Classroom Generate API] Chapter classroom generation failed:
  AI_RetryError: Failed after 3 attempts. Last error: <html>
  <head><title>502 Bad Gateway</title></head>
  <body><center><h1>502 Bad Gateway</h1></center><hr><center>openresty</center></body></html>
```

用户只看到「生成失败」，但真正能定位问题需要散落在 1300 行 dev log 里的：

- 哪个 chapter / scene / outline；
- 哪个 model（`xiaomi mimo-v2.5-pro`）；
- outline / scene-content / scene-actions 哪一步；
- 实际 latency / token usage / retry 几次；
- 上游响应原文是 502 HTML 还是 schema 失败；
- 此时 prompt 是否触碰了 length / safety 限制。

### 1.3 目标

- 把所有 AI 调用（LLM、媒体、TTS / ASR）的运行状态、耗时、token、prompt、错误现场以**结构化 trace** 形式持久化；
- 教师在 UI 里能自助看到「卡在哪一步、什么原因」；
- 开发者通过 CLI 和 Web UI 看到全量原始信息，无需翻 dev log；
- 与上游业务文件保持字节级无修改，所有改动落在 `**/extends/**` 下。

---

## 2 决策摘要

| 决策 | 结果 | 备注 |
| --- | --- | --- |
| 覆盖范围 | 7 个 AI 流程：A 章节生成 / B 媒体 / C TTS-ASR / D 场景重设计 / E 学生流 / F PBL / G 知识库 | 一份观测平面，水平覆盖所有 |
| 消费者 | 开发者 + 教师，一份数据两套视图 | 教师看脱敏摘要，开发者看全量 |
| 存储 | JSONL 文件 + 日切目录 rotation + `index.jsonl` sidecar + TTL（默认 7 天） | 沿用项目"文件即存储"模式，零新依赖 |
| 详情级别 | env 切：`AI_TRACE_DETAIL=full` (dev) / `metadata` (prod) / `off`；`metadata` 模式 on-error 自动升级到全文 | 默认安全，dev 一行 env 切到全采集 |
| 埋点入口 | `callLLM` 单点拦截（fork alias）+ `AsyncLocalStorage` 业务上下文（trace-context） | 复用 `lib/ai/thinking-context.ts` 的成熟模式，零深层埋点改动 |
| UI 表层 | phase 1 含教师菜单+错误处链接 + 开发者 Web UI + CLI | 三套入口，单一详情弹窗 |
| 入口形态 | 教师独立菜单 (`设计工作台 → AI 运行记录`) + 错误处快速链接（章节卡片 / 进度卡 / toast action） | 不寄生失败弹窗 |
| 访问控制 | dev 默认开 / prod 默认关 / `AI_TRACE_DEV_UI=1` 强制覆盖；教师视图始终可用 | 开发者视图含原文，需 gate |

**核心红线（不可逾越）：** 上游业务文件（`app/**`、`components/**`、`lib/**` 下非 `extends/` 子目录的 `.ts / .tsx`）保持字节级不变；允许的动作仅 3 类——在 `**/extends/**` 下新建文件、修改 `extends/fork-aliases.json`、修改基础设施文件（`tsconfig.json` / `next.config.ts` / `package.json`，AGENTS.md 允许）。

---

## 3 架构总览

### 3.1 组件分层

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ① TraceContext (AsyncLocalStorage)                                       │
│    lib/extends/observability/trace-context.ts                            │
│   - run(opts, fn)            : 顶层入口，分配 traceId 并绑定业务上下文   │
│   - startSpan / withSpan     : 嵌套 span，业务步骤维度                    │
│   - withLLMSpan              : LLM 调用专用，自动抽 usage / latency       │
└──────────────────────────────────────────────────────────────────────────┘
            ▲                                ▲                     ▲
            │ run(...)                       │ startSpan / withSpan │ withLLMSpan
            │                                │                     │
┌───────────┴───────────┐  ┌─────────────────┴─────────────┐  ┌────┴───────────────┐
│ ② 业务入口埋点         │  │ ④ 非 LLM AI 调用埋点          │  │ ③ callLLM 单点拦截 │
│  (7 处 route / hook)   │  │  - classroom-media-generation  │  │  lib/extends/ai/   │
│  - chapter generate    │  │  - tts / asr adapter           │  │  llm.ts            │
│  - generate-classroom  │  │                                │  │  通过 fork alias   │
│  - knowledge-base/ai   │  │                                │  │  @/lib/ai/llm →   │
│  - use-scene-redesign  │  │                                │  │  此文件，用相对    │
│  - scene-outlines-...  │  │                                │  │  路径绕开自指      │
│  - scene-{content/    │  │                                │  │                    │
│    actions}           │  │                                │  │                    │
│  - generate-pbl       │  │                                │  │                    │
└────────────────────────┘  └────────────────────────────────┘  └────────────────────┘
            │                                │                              │
            └──────────────┬─────────────────┴──────────────────────────────┘
                           ▼
            ┌──────────────────────────────────────┐
            │ ⑤ TraceSink                          │
            │   lib/extends/observability/         │
            │   trace-sink.ts                      │
            │  - 写 data/ai-traces/YYYY-MM-DD/     │
            │    <traceId>.jsonl                   │
            │  - on-error 立即 fsync               │
            │  - 同步写 index.jsonl                │
            │  - 启动期 TTL 清理                   │
            └──────────────────────────────────────┘
                           │
                           ▼
            ┌──────────────────────────────────────┐
            │ ⑥ TraceReader                        │
            │   lib/extends/observability/         │
            │   trace-reader.ts                    │
            │  - listTraces(filter)                │
            │  - readTrace(traceId, view)          │
            │  - 教师视图自动调 redaction          │
            └──────────────────────────────────────┘
                           │             │             │
              ┌────────────┴─────┐ ┌─────┴───────────┐ ┌─┴─────────────────┐
              ▼                  ▼ ▼                  ▼ ▼                 ▼
       ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
       │ ⑦ 教师 UI         │  │ ⑧ Web UI         │  │ ⑨ CLI                │
       │  菜单入口         │  │ /dev/ai-traces   │  │ pnpm trace:inspect   │
       │  + 错误处链接      │  │  列表 + 详情     │  │                      │
       │  统一详情弹窗     │  │                  │  │                      │
       └──────────────────┘  └──────────────────┘  └──────────────────────┘
```

### 3.2 callLLM 拦截的"自指破解"

```ts
// extends/fork-aliases.json (新增 1 行)
"@/lib/ai/llm.ts": "./lib/extends/ai/llm.ts"
```

```ts
// lib/extends/ai/llm.ts (新建)
import {
  callLLM as upstreamCallLLM,
  streamLLM as upstreamStreamLLM,
} from '../../ai/llm';     // 相对路径直击文件系统，alias 不生效
import { aiTraceContext } from '@lib-extends/observability/trace-context';

export async function callLLM(params, source, retryOptions?, thinking?) {
  return aiTraceContext.withLLMSpan(
    { source, modelId: ..., providerId: ..., promptText: serializePrompt(params) },
    () => upstreamCallLLM(params, source, retryOptions, thinking),
  );
}

export const streamLLM = /* 类似 */ ;
export * from '../../ai/llm';    // type / util 透传
```

与项目已建立的 `@/lib/server/classroom-generation.ts → lib/extends/server/classroom-generation.ts` 同款 fork 模式。

### 3.3 数据流向（单次"章节 regenerate"）

1. 用户点「重新生成」→ `POST /api/.../generate` route handler；
2. Route 调 `aiTraceContext.run({ kind: 'chapter-generation', context: { projectId, chapterId, ... } }, async () => { ... })` → **traceId 在这里诞生**；
3. `executeChapterGenerationWorkflow` 内部每一步 `aiTraceContext.startSpan('outline' | 'scene-content[i]' | ...)` → workflow 跑完 → `span.end()`；
4. 深处 `callLLM` 走 fork extends 拦截版 → 自动开 sub-span，绑定 `model / usage / latency`；
5. 任何一处错误：`span.end({ status: 'error', error: { message, stack, response_body } })` → TraceSink 立即 `fsync` flush 到 JSONL；
6. Trace 收尾（无论成功失败）TraceSink 写一行进 `index.jsonl`；
7. 教师 / 开发者通过各自 UI 读 index 找到 traceId，按需展开详情。

### 3.4 错误隔离

trace-context 与 sink 的所有错误**必须吃掉**——观测代码本身的 bug 不影响业务流程：

```ts
async withSpan(opts, fn) {
  let span;
  try { span = this.startSpan(opts); }
  catch (instrumentError) {
    console.warn('[ai-trace] startSpan failed:', instrumentError);
    return fn();   // 埋点挂了，业务继续跑
  }
  try {
    const result = await fn();
    try { span.end({ status: 'ok' }); } catch {}
    return result;
  } catch (err) {
    try { span.end({ status: 'error', error: err }); } catch {}
    throw err;     // 业务错误正常抛
  }
}
```

TraceSink 写盘失败只 warn 不 throw。**绝不让观测系统成为新的故障源**。

---

## 4 数据模型与存储

### 4.1 TypeScript 类型（最小可扩展集）

```ts
// lib/extends/observability/trace-types.ts

export interface AiTrace {
  readonly traceId: string;            // nanoid(16)
  readonly kind: TraceKind;
  readonly context: TraceBusinessContext;
  readonly startedAt: string;          // ISO
  readonly endedAt?: string;
  readonly durationMs?: number;
  readonly status: TraceStatus;        // 'in-progress' | 'ok' | 'error' | 'partial'
  readonly errorSummary?: string;
  readonly spanCount: number;
  readonly env: 'dev' | 'prod' | 'test';
  readonly appVersion?: string;
}

export type TraceKind =
  | 'chapter-generation'
  | 'chapter-media-generation'
  | 'scene-redesign'
  | 'preview-outline-stream'
  | 'preview-scene-content'
  | 'preview-scene-actions'
  | 'pbl-generation'
  | 'knowledge-base-ai-plan'
  | 'tts'
  | 'asr'
  | 'other';

export interface TraceBusinessContext {
  readonly projectId?: string;
  readonly chapterId?: string;
  readonly sceneOutlineId?: string;
  readonly classroomId?: string;
  readonly userVisibleTitle?: string;
  readonly attempt?: 'regenerate' | 'resume' | 'approve' | 'initial';
}

export interface AiSpan {
  readonly spanId: string;             // nanoid(12)
  readonly traceId: string;
  readonly parentSpanId?: string;
  readonly kind: SpanKind;
  readonly name: string;
  readonly attrs: SpanAttrs;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly durationMs?: number;
  readonly status: 'in-progress' | 'ok' | 'error' | 'fallback';
  readonly error?: SpanError;
  readonly events: SpanEvent[];
}

export type SpanKind =
  | 'workflow-step'
  | 'llm-call'
  | 'llm-stream'
  | 'media-call'
  | 'tts-call'
  | 'asr-call'
  | 'http-fetch'
  | 'custom';

export interface SpanAttrs {
  readonly providerId?: string;
  readonly modelId?: string;
  readonly source?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly thinkingTokens?: number;
  readonly retryAttempts?: number;
  readonly mediaKind?: 'image' | 'video';
  readonly mediaPrompt?: string;
  readonly promptChars?: number;
  readonly responseChars?: number;
  readonly httpStatus?: number;
  // detail level=full 或 on-error
  readonly promptText?: string;
  readonly responseText?: string;
  readonly httpRequestBody?: unknown;
  readonly httpResponseBody?: unknown;
}

export interface SpanError {
  readonly message: string;
  readonly stack?: string;
  readonly kind?: string;
  readonly httpStatus?: number;
  readonly upstreamBody?: string;
}

export interface SpanEvent {
  readonly at: string;
  readonly kind: 'retry' | 'fallback' | 'progress' | 'partial-output' | 'warn' | 'info';
  readonly message: string;
  readonly data?: Record<string, unknown>;
}
```

### 4.2 JSONL 文件格式

每个 trace 对应一个文件 `<traceId>.jsonl`：首行 `trace-start`，其后每行 `span`（仅在 span 关闭时写入），收尾一行 `trace-end`。

```jsonl
{"_t":"trace-start","traceId":"abc123def...","kind":"chapter-generation","context":{...},"startedAt":"...","env":"dev","appVersion":"0.2.1"}
{"_t":"span","spanId":"sp_01","traceId":"abc123...","kind":"workflow-step","name":"outline","attrs":{"source":"teacher-chapter-classroom"},"startedAt":"...","endedAt":"...","durationMs":42200,"status":"ok","events":[]}
{"_t":"span","spanId":"sp_02","traceId":"abc123...","parentSpanId":"sp_01","kind":"llm-call","name":"callLLM[xiaomi/mimo-v2.5-pro]","attrs":{...},"startedAt":"...","endedAt":"...","status":"ok","events":[]}
{"_t":"span","spanId":"sp_03","traceId":"abc123...","kind":"workflow-step","name":"scene-content[1]","startedAt":"...","endedAt":"...","status":"error","error":{...},"events":[{"at":"...","kind":"retry","message":"attempt 2/3"}],"attrs":{...}}
{"_t":"trace-end","traceId":"abc123...","endedAt":"...","durationMs":150000,"status":"error","errorSummary":"Failed at scene-content[1]: AI_RetryError 502","spanCount":3}
```

不写 `span-start` 事件，避免文件膨胀一倍；span 进行中状态对外只通过 in-memory cache 提供，写盘只在 span 关闭。进程崩溃时 trace-end 也写不进去，TraceReader 看到 `trace-start` 没有 `trace-end` 即可推断"中途崩溃"。

### 4.3 目录布局

```
data/ai-traces/
├── index.jsonl                              # 全局索引（脱敏摘要）
├── 2026-05-28/                              # 日切目录（按 startedAt 日期）
│   ├── abc123def456.jsonl
│   └── ...
├── 2026-05-27/
└── in-flight/                               # 进行中 trace 的指针文件
    └── abc123def456                         # 内容 = 真实 trace 文件相对路径
```

`index.jsonl` 单行结构（150-300 byte/行，10w trace ≈ 30 MB）：

```json
{"traceId":"abc123...","kind":"chapter-generation","status":"error","startedAt":"...","durationMs":150000,"context":{...},"errorSummary":"Failed at scene-content[1]: AI_RetryError 502","file":"2026-05-28/abc123def456.jsonl"}
```

教师 UI / Web UI 列表都**只读 index**，详情才去读对应 jsonl 文件。

### 4.4 详情级别开关

```text
AI_TRACE_DETAIL=metadata   # prod 默认：promptText / responseText / upstreamBody 仅在 status=error 时持久化
AI_TRACE_DETAIL=full       # dev 默认：始终持久化
AI_TRACE_DETAIL=off        # 紧急关闭：trace-start/end 仍写，spans 跳过
```

在 `lib/extends/observability/config.ts` 集中读 `process.env`，trace-context 永远把 `promptText / responseText` 传给 sink，由 sink 决定是否落盘。

### 4.5 TTL & rotation

- 写入时无 rotation：直接按 `YYYY-MM-DD` 目录写入（startedAt 的日期），天然分片；
- 启动期 TTL 清理：`extends/bootstrap.ts` 加一行 `void scheduleAiTraceCleanup()`，server 启动后异步扫 `data/ai-traces/<date>/`，删除 `today - AI_TRACE_RETENTION_DAYS` 之前的整个日期目录；
- `index.jsonl` 同步清理已删除文件的对应行（重写 index）；
- 默认 `AI_TRACE_RETENTION_DAYS=7`；
- **长期运行实例**：dev 环境基本每天都会重启（HMR / config 变更），prod 单 server 实例如果连续运行超过 retention 期会跨过零点积累；后续如需周期性 GC 可加 `setInterval(scheduleAiTraceCleanup, 24h)`，phase 1 仅在启动时跑（CLI 还提供 `--gc` 手动触发兜底）。

### 4.6 错误时立即 flush

| 触发条件 | flush 方式 |
| --- | --- |
| `span.end (status=ok)` | append 到 jsonl，fsync 不强制 |
| `span.end (status=error)` | append + `fs.fsync(fd)` |
| `trace-end` | append + `fs.fsync(fd)` |
| 进程信号 SIGTERM/SIGINT | 一次性 flush 所有 in-flight trace 的 buffer（最佳努力） |

writer 内部用 promise chain 串行化 append 调用，避免行交错；`index.jsonl` 用 advisory lock 保护多 trace 并发写。

---

## 5 采集流程

### 5.1 trace-context.ts 公开 API

```ts
export interface RunTraceOptions {
  readonly kind: TraceKind;
  readonly context: TraceBusinessContext;
  readonly inherit?: { traceId: string };
}

export interface WithSpanOptions {
  readonly kind: SpanKind;
  readonly name: string;
  readonly attrs?: SpanAttrs;
}

export const aiTraceContext = {
  run<T>(opts: RunTraceOptions, fn: () => Promise<T>): Promise<T>;
  startSpan(opts: WithSpanOptions): SpanHandle;
  withSpan<T>(opts: WithSpanOptions, fn: () => Promise<T>): Promise<T>;
  withLLMSpan<T>(opts: { source; modelId?; providerId?; promptText? }, fn): Promise<T>;
  currentTraceId(): string | null;
};
```

实现要点：

- 内部用 `AsyncLocalStorage<TraceFrame>` 持有 `{ trace, spanStack: AiSpan[] }`；
- `startSpan` 把新 span 推入 stack 顶，`end` pop 并发给 TraceSink；
- `withLLMSpan` 在 fn 完成后从 result 自动抽 `usage` → 填充 SpanAttrs，无需调用方手填；
- fn 抛错时 end 自动用 `status: 'error'` 记录、re-throw（业务语义不变）；
- detail level 在 sink 层判断；trace-context 永远把原文传给 sink。

### 5.2 业务入口埋点示例

#### (A) 章节生成 route

```ts
// app/extends/api/teacher/projects/[projectId]/chapters/[chapterId]/generate/route.ts
import { aiTraceContext } from '@lib-extends/observability/trace-context';

export async function POST(request, context) {
  const { projectId, chapterId } = await context.params;

  return aiTraceContext.run(
    {
      kind: 'chapter-generation',
      context: {
        projectId,
        chapterId,
        userVisibleTitle: chapter?.title,
        attempt: regenerate ? 'regenerate' : resume ? 'resume' : approveOutline ? 'approve' : 'initial',
      },
    },
    async () => {
      // —— 现有所有代码原封不动塞这里 ——
      // executeChapterGenerationWorkflow 内部所有 callLLM 自动关联到此 trace
    },
  );
}
```

#### (D) 场景重设计 hook（client side，HTTP header propagation）

Client-side 没有 `AsyncLocalStorage`，方案是**显式 traceId 透传**：

```ts
// lib/extends/hooks/use-scene-redesign.ts
import { generateClientTraceId } from '@lib-extends/observability/trace-context';

// 复用现有 SceneRedesignState 接口，新增 traceId 字段：
//   interface SceneRedesignState {
//     sceneTitle: string;
//     step: 'content' | 'actions' | null;
//     error: string | null;
//     traceId?: string;    // ← 新增，用于 toast action 关联到诊断弹窗
//   }

async function startRedesign(direction, refs, links) {
  const traceId = generateClientTraceId();
  setSceneState(sceneId, () => ({ sceneTitle, step: 'content', error: null, traceId }));

  const contentResult = await fetchSceneContent(
    { outline, ... },
    signal,
    {
      'x-ai-trace-id': traceId,
      'x-ai-trace-kind': 'scene-redesign',
      'x-ai-trace-context': JSON.stringify({ sceneOutlineId: sceneId, userVisibleTitle: target.title }),
    },
  );
  // fetchSceneActions 同样带头
}
```

```ts
// app/extends/api/generate/scene-content/route.ts (新建 fork)
import { aiTraceContext } from '@lib-extends/observability/trace-context';

export async function POST(request) {
  const headers = request.headers;
  const inheritedTraceId = headers.get('x-ai-trace-id');
  const traceKind = headers.get('x-ai-trace-kind') as TraceKind || 'preview-scene-content';
  const ctx = JSON.parse(headers.get('x-ai-trace-context') || '{}');

  return aiTraceContext.run(
    { kind: traceKind, context: ctx, inherit: inheritedTraceId ? { traceId: inheritedTraceId } : undefined },
    async () => {
      // —— fork 上来的上游 scene-content 逻辑 ——
    },
  );
}
```

W3C TraceContext 简化版的 header propagation 模式。

#### 其他流程

每个流程都是同一模式：**最外层一行 `aiTraceContext.run(...)` 包裹**，深层 callLLM 自动埋点，业务代码零改动。

### 5.3 非 LLM AI 调用埋点

媒体、TTS、ASR 不走 callLLM，需在各自 adapter 层加 instrumented span：

```ts
// lib/extends/server/classroom-media-generation.ts (新建 fork)
import {
  generateImage as upstreamGenerateImage,
  // ...
} from '../../server/classroom-media-generation';  // ← 相对路径直击上游文件，与 callLLM 拦截同款破解
import { aiTraceContext } from '@lib-extends/observability/trace-context';

export async function generateImage(...) {
  return aiTraceContext.withSpan(
    { kind: 'media-call', name: `image[${providerId}]`, attrs: { mediaKind: 'image', mediaPrompt: prompt } },
    () => upstreamGenerateImage(...),
  );
}

export * from '../../server/classroom-media-generation';   // 透传其他 export
```

媒体、TTS、ASR 的所有 fork wrapper 都遵循同一模式：alias 重定向 + 相对路径绕自指 + withSpan 包裹 + 透传其余 export。

---

## 6 教师 UI

### 6.1 设计原则：一个详情弹窗，多种入口

`TraceDetailDialog` 是唯一的详情组件，所有入口都打开它（按 traceId）。通过全局 Zustand store 管理弹窗状态：

```ts
// lib/extends/observability/trace-detail-store.ts
export const useTraceDetailStore = create<{
  traceId: string | null;
  openTrace: (traceId: string) => void;
  closeTrace: () => void;
}>((set) => ({
  traceId: null,
  openTrace: (traceId) => set({ traceId }),
  closeTrace: () => set({ traceId: null }),
}));
```

挂在 root layout 的 `<GlobalTraceDetailDialog />` 监听此 store，任何位置（toast action、按钮点击、URL 参数）都可一行 `useTraceDetailStore.getState().openTrace(traceId)` 触发。

### 6.2 入口 1：菜单 - 设计工作台「AI 运行记录」

设计工作台章节列表头部加一个「🔍 AI 运行记录」按钮，点击打开右侧 Drawer（不抢占主区域）展示 `ProjectTraceListPane`：

- 按当前 `projectId` 过滤；
- 显示最近 50 次 trace（kind / 章节 / 耗时 / 状态 / 时间）；
- 点击任一行 → `openTrace(traceId)` 弹出 `TraceDetailDialog`；
- 底部链接「在 /dev/ai-traces 中查看更多」跳开发者 Web UI。

### 6.3 入口 2：失败章节卡片新增「诊断」按钮

`chapter-list-editor.tsx` 失败章节卡片新增独立「🔍 诊断」按钮，与现有「查看错误」按钮并存：

| 按钮 | 行为 |
| --- | --- |
| 查看错误（保留） | 现有 `ChapterFailureDetailDialog`（一句话原因） |
| 🔍 诊断（新增） | `openTrace(chapterClassroom.lastTraceId)` 弹出 `TraceDetailDialog` |

`chapterClassroom` 类型新增字段 `lastTraceId?: string`，章节生成 route 在 `aiTraceContext.run` 内把 `currentTraceId()` 写回 chapterClassroom。

为兼顾「先点查看错误，看完想深入诊断」的路径，**`ChapterFailureDetailDialog` 底部追加一行链接 `打开完整诊断 →`**，点击 = `openTrace(lastTraceId)`。这样用户既可以一步直达，也可以从快速摘要切换到深度诊断。

### 6.4 入口 3：生成进度卡失败态新增「诊断」按钮

`chapter-generation-progress-card.tsx` failed phase 加并排「诊断」按钮：

```text
[重试]  [🔍 诊断]
```

### 6.5 入口 4：失败 toast action

`sonner` 支持 `action`，给所有 AI 失败 toast 加：

```ts
toast.error(
  t('courseEditor.redesignBackgroundError', { title, message }),
  {
    action: {
      label: t('observability.diagnoseLink'),
      onClick: () => useTraceDetailStore.getState().openTrace(traceId),
    },
  },
);
```

应用范围：scene-redesign、knowledge-base AI、generation-preview 失败、媒体 fallback warn。

### 6.6 `TraceDetailDialog` UI

```
┌─────────────────────────────────────────────────────────────────────┐
│ ⚠ 生成失败：AI编程的演进历史                                    × │
│ 章节生成过程出现问题，下方是 AI 各阶段的实际执行情况              │
├─────────────────────────────────────────────────────────────────────┤
│ 总耗时 2:30 · 模型 xiaomi/mimo-v2.5-pro · 失败于 scene-content    │
│                                                                     │
│ ┌─ 步骤时间线 ───────────────────────────────────────────────────┐ │
│ │ ✅ outline               42.2s    mimo-v2.5-pro · 1,450 tok    │ │
│ │ ✅ scene-content[1]     12.0s    mimo-v2.5-pro · 1,210 tok    │ │
│ │ ✅ scene-content[2]     15.5s    ...                          │ │
│ │ ❌ scene-content[3]     91.0s    AI_RetryError · HTTP 502  ▾  │ │
│ │     ↻ 重试 1/3 (失败 30.0s 后)                                 │ │
│ │     ↻ 重试 2/3 (失败 30.5s 后)                                 │ │
│ │     ↻ 重试 3/3 (失败 30.5s 后)                                 │ │
│ │     错误类别：AI_RetryError (上游 HTTP 502 Bad Gateway)        │ │
│ │     错误信息：Failed after 3 attempts. Last error: ...         │ │
│ │     Prompt 摘要（前 200 字符）："根据以下章节大纲生成..."      │ │
│ │     [查看完整 Prompt] (dev 模式)                               │ │
│ │     上游响应：<html><head><title>502 Bad Gateway</title>...   │ │
│ │ ⏸ scene-content[4]    未执行（前序失败）                       │ │
│ └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Trace ID: abc123def456    [复制]    [在 /dev/ai-traces 中打开]    │
│                                                                     │
│                              [关闭]   [重试章节]                   │
└─────────────────────────────────────────────────────────────────────┘
```

行为：

- 嵌套缩进：workflow-step 在第一层，其下 llm-call sub-span 缩进展示（默认折叠）；
- 错误 span 自动展开；
- 进行中状态：成功 span 后接 `◐ scene-content[3] · 已用时 45.0s · 正在生成中…`，每 3 秒重读 trace 文件刷新；
- 状态图标：✅ ok / ❌ error / ⏸ skipped / ◐ in-progress / ⚠ fallback。

### 6.7 数据获取流程

```
教师打开 TraceDetailDialog (按 traceId)
   ▼
GET /api/extends/ai-traces/<traceId>?view=teacher
   ▼
新建 app/extends/api/ai-traces/[traceId]/route.ts → TraceReader.readTrace(traceId, 'teacher')
   ▼
读 data/ai-traces/<date>/<traceId>.jsonl → 解析所有 span
   ▼
经 redaction.ts 教师视图脱敏：
  - promptText / responseText / upstreamBody → 前 200 字符 + "..."
  - SpanError.stack → 删
  - SpanAttrs.httpRequestBody → 删
  - 保留 model / usage / latency / error.message / event 列表
   ▼
返回脱敏 trace JSON → 弹窗渲染
```

```ts
// lib/extends/observability/redaction.ts
export function redactSpanForTeacher(span: AiSpan): AiSpan {
  const attrs = { ...span.attrs };
  if (attrs.promptText) attrs.promptText = truncate(attrs.promptText, 200);
  if (attrs.responseText) attrs.responseText = truncate(attrs.responseText, 200);
  delete attrs.httpRequestBody;
  if (attrs.httpResponseBody) attrs.httpResponseBody = truncate(stringify(attrs.httpResponseBody), 400);

  const error = span.error ? {
    message: span.error.message,
    kind: span.error.kind,
    httpStatus: span.error.httpStatus,
    upstreamBody: span.error.upstreamBody ? truncate(span.error.upstreamBody, 400) : undefined,
  } : undefined;

  return { ...span, attrs, error };
}
```

**只在读路径脱敏**——磁盘上始终是原文（dev 全采时），不丢失任何诊断信息；prod 默认 metadata-only，磁盘本身就不存 promptText（除非 status=error）。

---

## 7 开发者 Web UI 与 CLI

### 7.1 Web UI 路由

```text
URL（教师/开发者可见）              rewrite to（实现路径）
/dev/ai-traces                  →  /extends/dev/ai-traces            （列表页）
/dev/ai-traces/<traceId>        →  /extends/dev/ai-traces/<traceId>  （详情页）
```

在 `extends/fork-aliases.json` 的 `rewrites` 段加 2 条（与现有 `/knowledge-base → /extends/knowledge-base` 同款）。

### 7.2 Web UI 列表页

```
┌─ AI 运行记录 ──────────────────────────────────────────────────────────────┐
│                                                                            │
│ 流程: [全部 ▾]  状态: [全部 ▾]  时间: [近 7 天 ▾]  搜索: [____________]    │
│ 项目: [全部 ▾]                                                            │
│                                                                            │
│ 状态  Trace ID    流程              项目/章节            耗时    时间      │
│ ❌    abc123def   chapter-generation NcO1.../ifOQ...    2:30  11 min ago │
│       (regenerate) AI编程的演进历史                                       │
│       → Failed at scene-content[1]: AI_RetryError 502                    │
│ ✅    def456ghi   scene-redesign     NcO1.../ifOQ.../s3 0:28  1 hour ago │
│       第3节阶段练习                                                       │
│ ◐     ghi789jkl   pbl-generation     NcO1.../mvA...     ...   in-progress │
│                                                                            │
│ 显示 50 条 / 共 1,234 条               [上一页]  Page 1 / 25  [下一页]   │
└────────────────────────────────────────────────────────────────────────────┘
```

数据源：直接读 `data/ai-traces/index.jsonl`（不读单 trace 文件），过滤 / 排序在内存做（10w 行索引 ≈ 30 MB）。

### 7.3 Web UI 详情页

教师视图与开发者视图差异：

| 字段 | 教师视图 | 开发者视图 |
| --- | --- | --- |
| `promptText` | 前 200 字符 | 完整 + 复制 / 下载 |
| `responseText` | 前 200 字符 | 完整 |
| `error.stack` | 不显示 | 完整 stack |
| `error.upstreamBody` | 前 400 字符 | 完整 |
| `httpRequestBody` | 不显示 | 完整 |
| 「下载原始 JSONL」 | 不提供 | 提供 |
| `redaction.ts` | 调用 | 不调用 |

API 端点 `GET /api/extends/ai-traces/<traceId>?view=developer`，与教师视图共用 endpoint，`view` 参数控制脱敏。

### 7.4 CLI 工具

```bash
pnpm trace:inspect <traceId>           # 默认：格式化输出主要信息（不含 prompt/response 全文）
pnpm trace:inspect <traceId> --full    # 含 prompt / response 全文 + 完整 stack
pnpm trace:inspect <traceId> --json    # 原始 JSON 输出（适合 pipe 给 jq）
pnpm trace:inspect --list              # 列出最近 20 条 trace
pnpm trace:inspect --list --kind=chapter-generation --status=error --since=1h
pnpm trace:inspect --search "AI_RetryError"  # 跨 trace grep error message
pnpm trace:inspect --gc                # 立即触发 TTL 清理（debug 用）
```

CLI 复用 `TraceReader` 库，独立 entry 点，无终端颜色依赖（ANSI + 终端检测）。`package.json` scripts 段加：

```json
"trace:inspect": "node lib/extends/observability/cli/inspect.mjs"
```

### 7.5 访问控制

```ts
// lib/extends/observability/access-control.ts
export function isDevUiEnabled(): boolean {
  if (process.env.AI_TRACE_DEV_UI === '1') return true;
  if (process.env.AI_TRACE_DEV_UI === '0') return false;
  return process.env.NODE_ENV !== 'production';
}
```

```ts
// app/extends/dev/ai-traces/page.tsx
import { isDevUiEnabled } from '@lib-extends/observability/access-control';
import { notFound } from 'next/navigation';

export default async function Page() {
  if (!isDevUiEnabled()) notFound();
  // ...
}
```

API 端点 `/api/extends/ai-traces/*` 也走同一 gate。**教师菜单 / toast action 不受此 gate 影响**——教师视图（脱敏）始终可用，被关掉的只是开发者全量视图与列表页。

---

## 8 完整改动清单

### 8.1 新建文件（全在 extends 下）

| 文件 | 用途 |
| --- | --- |
| `lib/extends/observability/trace-context.ts` | AsyncLocalStorage + startSpan / withLLMSpan |
| `lib/extends/observability/trace-sink.ts` | JSONL 持久化层 |
| `lib/extends/observability/trace-reader.ts` | 列表 / 详情查询 |
| `lib/extends/observability/trace-types.ts` | TS 类型定义 |
| `lib/extends/observability/redaction.ts` | 教师视图脱敏 |
| `lib/extends/observability/config.ts` | env 解析（detail level / retention） |
| `lib/extends/observability/access-control.ts` | dev UI gate |
| `lib/extends/observability/trace-detail-store.ts` | Zustand 全局弹窗状态 |
| `lib/extends/observability/cli/inspect.mjs` | CLI 入口 |
| `lib/extends/observability/cli/format.ts` | CLI 格式化工具 |
| `lib/extends/ai/llm.ts` | callLLM 拦截器（fork wrapper） |
| `lib/extends/server/classroom-media-generation.ts` | 媒体调用埋点 fork |
| `lib/extends/pbl/generate-pbl.ts` | PBL 流程 fork |
| `app/extends/api/generate/scene-content/route.ts` | 学生流 scene-content fork（带 trace propagation） |
| `app/extends/api/generate/scene-actions/route.ts` | 同上 |
| `app/extends/api/ai-traces/route.ts` | GET trace 列表（教师视图） |
| `app/extends/api/ai-traces/[traceId]/route.ts` | GET 单 trace（view 参数控制） |
| `app/extends/dev/ai-traces/page.tsx` | Web UI 列表页 |
| `app/extends/dev/ai-traces/[traceId]/page.tsx` | Web UI 详情页 |
| `app/extends/dev/ai-traces/components/trace-list-table.tsx` | 列表表格 |
| `app/extends/dev/ai-traces/components/trace-filter-bar.tsx` | 过滤栏 |
| `app/extends/dev/ai-traces/components/developer-span-detail.tsx` | 开发者 span 详情 |
| `components/extends/observability/trace-detail-dialog.tsx` | 统一详情弹窗 |
| `components/extends/observability/trace-timeline.tsx` | 步骤时间线 |
| `components/extends/observability/span-detail-pane.tsx` | span 展开内容 |
| `components/extends/observability/trace-summary-header.tsx` | 顶部摘要 |
| `components/extends/observability/global-trace-detail-dialog.tsx` | root layout 挂载点 |
| `components/extends/observability/project-trace-list-pane.tsx` | 设计工作台 Drawer 内容 |

### 8.2 改动现有 extends 文件

| 文件 | 改动 |
| --- | --- |
| `app/extends/api/teacher/projects/[projectId]/chapters/[chapterId]/generate/route.ts` | 最外层包 `aiTraceContext.run` |
| `app/extends/api/teacher/projects/[projectId]/generate-chapter/route.ts` | 同上 |
| `app/extends/api/teacher/projects/[projectId]/generate-outline/route.ts` | 同上 |
| `app/extends/api/generate-classroom/route.ts` | 同上 |
| `app/extends/api/generate/scene-outlines-stream/route.ts` | 同上 |
| `app/extends/api/knowledge-base/ai/plan/route.ts` | 同上 |
| `lib/extends/hooks/use-scene-redesign.ts` | client trace propagation header；toast 加 diagnose action |
| `components/extends/teacher/course-project-design-shell.tsx` | 章节列表头部加「AI 运行记录」按钮 |
| `components/extends/teacher/design-workbench/chapter-list-editor.tsx` | 失败章节卡片新增「诊断」按钮 |
| `components/extends/teacher/chapter-generation-progress-card.tsx` | failed 态新增「诊断」按钮 |
| `components/extends/teacher/chapter-failure-detail-dialog.tsx` | 底部加「打开诊断」链接（指向 TraceDetailDialog） |
| `lib/extends/teacher/course-types.ts` | `CourseChapterClassroom` 新增可选字段 `lastTraceId?: string` |
| `extends/bootstrap.ts` | 加 `void scheduleAiTraceCleanup()` |
| `lib/extends/i18n/locales/*.json` | 新增 `observability.*` namespace（~20 key） |

### 8.3 基础设施改动（AGENTS.md 允许）

| 文件 | 改动 |
| --- | --- |
| `extends/fork-aliases.json` | 新增 ~6 条 fork alias（callLLM、媒体、PBL、scene-content / actions、ai-traces.test 等）、2 条 rewrite（`/dev/ai-traces`） |
| `tsconfig.json` | 在 alias 变更后由 `pnpm sync:fork-tsconfig-paths` 自动同步（不直接手编辑） |
| `package.json` | 新增 `trace:inspect` script |

### 8.4 零修改清单

**所有非 `extends/` / `lib/extends/` / `app/extends/` / `components/extends/` 下的上游 `.ts` / `.tsx` 业务文件保持字节级不变**。

---

## 9 测试策略

| 层 | 测试位置 | 关键用例 |
| --- | --- | --- |
| 单元 | `tests/extends/observability/trace-context.test.ts` | `run` 嵌套 / `startSpan` stack / `withLLMSpan` 抽 usage / 异常时 status=error |
| 单元 | `tests/extends/observability/trace-sink.test.ts` | JSONL 行交错防护 / error 立即 fsync / TTL 清理边界 |
| 单元 | `tests/extends/observability/trace-reader.test.ts` | index 解析 / readTrace 拼装 / view=teacher 脱敏正确 |
| 单元 | `tests/extends/observability/redaction.test.ts` | 截断 / stack 删除 / httpBody 屏蔽 |
| 单元 | `tests/extends/observability/config.test.ts` | env 解析 / 默认值 / detail level 分支 |
| 单元 | `tests/extends/observability/access-control.test.ts` | NODE_ENV + AI_TRACE_DEV_UI 组合矩阵 |
| 集成 | `tests/extends/observability/llm-interceptor.test.ts` | callLLM 拦截后调用上游 / 自动 traceId 关联 / 异常时 span error 持久化 |
| 集成 | `tests/extends/observability/api-routes.test.ts` | `/api/extends/ai-traces/*` 端点权限、脱敏、list 过滤 |
| 渲染 | `tests/extends/observability/trace-detail-dialog.test.tsx` | dialog 在 mock trace 下渲染时间线 / span 详情 / 进行中态轮询 |
| 渲染 | `tests/extends/observability/cli-format.test.ts` | CLI 输出对照 snapshot |
| E2E（可选） | `e2e/extends/observability.spec.ts` | 触发一次章节生成 → trace 文件落盘 → /dev/ai-traces 能看到 |

测试沿用 `tests/extends/` 镜像上游的现有模式。所有 i18n key 添加后执行 `node scripts/extract-i18n-overlay.mjs` + `pnpm check:i18n-keys`。

---

## 10 风险与回滚

### 10.1 风险

| 风险 | 概率 | 影响 | 缓解 |
| --- | --- | --- | --- |
| 拦截 callLLM 引入性能开销 | 低 | 单 span 写盘是 < 1 ms 的 append 操作；critical 路径阻塞可忽略 | 写盘异步（不 await）；error path 才强制 fsync |
| AsyncLocalStorage 在 Next.js Edge runtime 不可用 | 中 | route handler 必须是 Node runtime | 现有 generate route 已经是 Node runtime（`export const maxDuration = 300`）。新建 fork route 默认 Node。文档明确不支持 Edge |
| 大 prompt（PDF 抽出 > 100KB）落盘膨胀 | 中 | dev 全采时单 trace 可达 100 MB+ | sink 层对 `promptText` 长度做 cap（>50 KB 截断 + 标记 truncated）；config 提供 `AI_TRACE_PROMPT_MAX_CHARS` |
| 教师在 UI 看到敏感 prompt | 低 | 教师视图已经强制 redaction（前 200 字符 + 删除 stack/httpBody） | redaction.test.ts 覆盖；prod 默认 metadata-only |
| 自指循环（fork llm.ts import alias 路径） | 低 | 构建失败 | fork 版**强制用相对路径** `'../../ai/llm'`；CI 加 lint 规则禁止 fork extends 文件用 `@/lib/...` 引用自身原文 |
| 并发写 index.jsonl 行交错 | 中 | 索引损坏，列表少几行 | proper-lockfile 已是 transitive dep；或 advisory file lock + atomic rename |

### 10.2 回滚

如果发现严重问题，分级回滚：

1. **关闭采集**：`AI_TRACE_DETAIL=off` —— trace 文件停止写入，业务流程零影响；
2. **关闭 dev UI**：`AI_TRACE_DEV_UI=0` —— Web UI / API 端点 404；
3. **回滚 callLLM 拦截**：删除 `extends/fork-aliases.json` 里 `@/lib/ai/llm.ts` 这一条 alias，所有 callLLM 调用直接走上游，业务行为完全恢复，trace-context 仍可用但没有 LLM span（只有业务步骤 span）；
4. **完全回滚**：`git revert` 本 feature 的 commit 范围，由于零修改上游，回滚是干净的 alias / 新文件删除。

---

## 11 增量扩展预留（不进 phase 1）

- **OTLP exporter** —— `lib/extends/observability/exporters/otlp.ts` 可作为后续 phase；TraceSink 接受 `sinks: TraceSinkAdapter[]`，初始只 JSONL 一个；future 加 OTLP 一行 config 即可。
- **跨进程 trace propagation** —— W3C `traceparent` header 已在 5.2 `x-ai-trace-id` 自定义头里实现简化版；future 切到标准 header 是 API 调整，存储层不变。
- **trace 聚合分析**（按章节统计成功率、按 model 看失败分布）—— 留给 Web UI v2 / 单独 dashboard。
- **trace replay** —— 拿一次 trace 的 prompt 重放给当前 LLM provider，用于回归测试。

---

## 12 附：环境变量速查

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `AI_TRACE_DETAIL` | dev=`full`, prod=`metadata` | 持久化粒度（off / metadata / full） |
| `AI_TRACE_RETENTION_DAYS` | `7` | trace 文件保留天数 |
| `AI_TRACE_DEV_UI` | 未设 → 跟 NODE_ENV | `1` 强制开发者 UI 开 / `0` 强制关 |
| `AI_TRACE_PROMPT_MAX_CHARS` | `50000` | 单 prompt 截断长度（防膨胀） |

---

**spec 终态：** 待用户审查 → 调 writing-plans 出实现计划。
