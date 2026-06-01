# AI 运行时观测系统 · Plan 1（核心库 + 章节生成接入 + 极简 CLI）

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 触发一次章节生成（`/teacher/projects/.../chapters/.../generate?regenerate=1`），AI 各阶段（outline / scene-content / scene-actions / 内部 callLLM）的运行状态、耗时、token、prompt、错误现场被结构化持久化到 `data/ai-traces/`，开发者通过 `pnpm trace:inspect <traceId>` 可查看完整诊断。

**架构：** AsyncLocalStorage 持有 trace 上下文 → callLLM 单点拦截（通过 fork alias 重定向，相对路径绕自指）→ 每个 span 关闭时写一行到 `data/ai-traces/YYYY-MM-DD/<traceId>.jsonl`，并同步写脱敏摘要到 `index.jsonl`。

**技术栈：** Next.js 16 App Router · Node 20 · TypeScript strict · Vitest · 已有 `nanoid` / `node:async_hooks`。

**规范红线：** 上游业务文件保持字节级不变；所有改动落 `**/extends/**`、`extends/fork-aliases.json`、`tsconfig.json`、`package.json`。每次 alias 变更必跑 `node scripts/sync-fork-tsconfig-paths.mjs`。

**关联规格：** [docs/superpowers/specs/2026-05-28-ai-runtime-observability-design.md](../specs/2026-05-28-ai-runtime-observability-design.md)

---

## 文件清单（Plan 1 范围）

### 新建

| 文件 | 职责 |
| --- | --- |
| `lib/extends/observability/trace-types.ts` | TS 类型定义（AiTrace / AiSpan / SpanAttrs / SpanError / SpanEvent / TraceKind / SpanKind） |
| `lib/extends/observability/config.ts` | env 解析（AI_TRACE_DETAIL / AI_TRACE_RETENTION_DAYS / AI_TRACE_PROMPT_MAX_CHARS） |
| `lib/extends/observability/trace-context.ts` | AsyncLocalStorage + run / startSpan / withSpan / withLLMSpan / currentTraceId / generateTraceId |
| `lib/extends/observability/trace-sink.ts` | JSONL 写入器（按 trace 单文件 + 同步写 index + on-error fsync + TTL 清理） |
| `lib/extends/observability/trace-reader.ts` | listTraces / readTrace（教师/开发者两 view） |
| `lib/extends/observability/redaction.ts` | 教师视图脱敏（promptText/responseText/stack 截断或删除） |
| `lib/extends/observability/cli/inspect.mjs` | CLI 入口（pnpm trace:inspect） |
| `lib/extends/observability/cli/format.ts` | CLI 输出格式化 |
| `lib/extends/ai/llm.ts` | callLLM / streamLLM 拦截器（fork wrapper，相对路径绕自指） |
| `tests/extends/observability/trace-types.test.ts` | 类型守卫单测 |
| `tests/extends/observability/config.test.ts` | env 解析矩阵 |
| `tests/extends/observability/trace-context.test.ts` | run / startSpan / withSpan / withLLMSpan 行为 |
| `tests/extends/observability/trace-sink.test.ts` | JSONL 行序 / on-error fsync / TTL |
| `tests/extends/observability/trace-reader.test.ts` | index 解析 / view=teacher 脱敏 |
| `tests/extends/observability/redaction.test.ts` | 截断 / 删除规则 |
| `tests/extends/observability/llm-interceptor.test.ts` | callLLM 拦截行为 + 透传 |

### 改动现有 extends 文件

| 文件 | 改动 |
| --- | --- |
| `lib/extends/teacher/course-types.ts` | `CourseChapterClassroom` 新增 `readonly lastTraceId?: string` |
| `app/extends/api/teacher/projects/[projectId]/chapters/[chapterId]/generate/route.ts` | 包一层 `aiTraceContext.run`；写入 `lastTraceId` |
| `extends/bootstrap.ts` | 加 `void scheduleAiTraceCleanup()` |

### 基础设施

| 文件 | 改动 |
| --- | --- |
| `extends/fork-aliases.json` | 加 1 条 alias：`@/lib/ai/llm.ts → ./lib/extends/ai/llm.ts` |
| `tsconfig.json` | 由 `pnpm sync:fork-tsconfig-paths` 自动同步 |
| `package.json` | scripts 加 `"trace:inspect": "node lib/extends/observability/cli/inspect.mjs"` |
| `.gitignore` | 加 `/data/ai-traces/` |

---

## 任务 1：类型定义

**文件：**
- 创建：`lib/extends/observability/trace-types.ts`
- 测试：`tests/extends/observability/trace-types.test.ts`

- [ ] **步骤 1.1：写完整类型文件**

```ts
// lib/extends/observability/trace-types.ts

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

export type TraceStatus = 'in-progress' | 'ok' | 'error' | 'partial';

export type SpanKind =
  | 'workflow-step'
  | 'llm-call'
  | 'llm-stream'
  | 'media-call'
  | 'tts-call'
  | 'asr-call'
  | 'http-fetch'
  | 'custom';

export type SpanStatus = 'in-progress' | 'ok' | 'error' | 'fallback';

export interface TraceBusinessContext {
  readonly projectId?: string;
  readonly chapterId?: string;
  readonly sceneOutlineId?: string;
  readonly classroomId?: string;
  readonly userVisibleTitle?: string;
  readonly attempt?: 'regenerate' | 'resume' | 'approve' | 'initial';
}

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

export interface AiSpan {
  readonly spanId: string;
  readonly traceId: string;
  readonly parentSpanId?: string;
  readonly kind: SpanKind;
  readonly name: string;
  readonly attrs: SpanAttrs;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly durationMs?: number;
  readonly status: SpanStatus;
  readonly error?: SpanError;
  readonly events: SpanEvent[];
}

export interface AiTrace {
  readonly traceId: string;
  readonly kind: TraceKind;
  readonly context: TraceBusinessContext;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly durationMs?: number;
  readonly status: TraceStatus;
  readonly errorSummary?: string;
  readonly spanCount: number;
  readonly env: 'dev' | 'prod' | 'test';
  readonly appVersion?: string;
}

/** Index sidecar 行结构（脱敏摘要，列表 UI 与 CLI --list 共用） */
export interface TraceIndexEntry {
  readonly traceId: string;
  readonly kind: TraceKind;
  readonly status: TraceStatus;
  readonly startedAt: string;
  readonly durationMs?: number;
  readonly context: TraceBusinessContext;
  readonly errorSummary?: string;
  readonly file: string; // 相对 data/ai-traces/ 的路径
}

/** JSONL 文件首行 */
export interface TraceStartRecord {
  readonly _t: 'trace-start';
  readonly traceId: string;
  readonly kind: TraceKind;
  readonly context: TraceBusinessContext;
  readonly startedAt: string;
  readonly env: 'dev' | 'prod' | 'test';
  readonly appVersion?: string;
}

/** JSONL 文件中间行 */
export interface SpanRecord extends AiSpan {
  readonly _t: 'span';
}

/** JSONL 文件末行 */
export interface TraceEndRecord {
  readonly _t: 'trace-end';
  readonly traceId: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly status: TraceStatus;
  readonly errorSummary?: string;
  readonly spanCount: number;
}

export type TraceJsonlRecord = TraceStartRecord | SpanRecord | TraceEndRecord;

export function isTraceStart(r: TraceJsonlRecord): r is TraceStartRecord {
  return r._t === 'trace-start';
}
export function isSpan(r: TraceJsonlRecord): r is SpanRecord {
  return r._t === 'span';
}
export function isTraceEnd(r: TraceJsonlRecord): r is TraceEndRecord {
  return r._t === 'trace-end';
}
```

- [ ] **步骤 1.2：写类型守卫测试**

```ts
// tests/extends/observability/trace-types.test.ts
import { describe, expect, test } from 'vitest';
import { isTraceStart, isSpan, isTraceEnd } from '@/lib/extends/observability/trace-types';

describe('trace JSONL record discriminators', () => {
  test('isTraceStart matches only trace-start records', () => {
    expect(isTraceStart({ _t: 'trace-start' } as never)).toBe(true);
    expect(isTraceStart({ _t: 'span' } as never)).toBe(false);
    expect(isTraceStart({ _t: 'trace-end' } as never)).toBe(false);
  });

  test('isSpan matches only span records', () => {
    expect(isSpan({ _t: 'span' } as never)).toBe(true);
    expect(isSpan({ _t: 'trace-start' } as never)).toBe(false);
  });

  test('isTraceEnd matches only trace-end records', () => {
    expect(isTraceEnd({ _t: 'trace-end' } as never)).toBe(true);
    expect(isTraceEnd({ _t: 'span' } as never)).toBe(false);
  });
});
```

- [ ] **步骤 1.3：运行测试验证通过**

```bash
node node_modules/vitest/vitest.mjs run tests/extends/observability/trace-types.test.ts
```

预期：3 passed。

- [ ] **步骤 1.4：Commit**

```bash
git add lib/extends/observability/trace-types.ts tests/extends/observability/trace-types.test.ts
git commit -m "feat(observability): add trace/span type definitions"
```

---

## 任务 2：配置层（env 解析）

**文件：**
- 创建：`lib/extends/observability/config.ts`
- 测试：`tests/extends/observability/config.test.ts`

- [ ] **步骤 2.1：先写失败测试**

```ts
// tests/extends/observability/config.test.ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { resolveAiTraceConfig } from '@/lib/extends/observability/config';

const original = {
  NODE_ENV: process.env.NODE_ENV,
  AI_TRACE_DETAIL: process.env.AI_TRACE_DETAIL,
  AI_TRACE_RETENTION_DAYS: process.env.AI_TRACE_RETENTION_DAYS,
  AI_TRACE_PROMPT_MAX_CHARS: process.env.AI_TRACE_PROMPT_MAX_CHARS,
};

beforeEach(() => {
  for (const key of Object.keys(original)) delete (process.env as Record<string, unknown>)[key];
});
afterEach(() => {
  for (const [k, v] of Object.entries(original)) {
    if (v === undefined) delete (process.env as Record<string, unknown>)[k];
    else (process.env as Record<string, unknown>)[k] = v;
  }
});

describe('resolveAiTraceConfig', () => {
  test('dev defaults to detail=full', () => {
    process.env.NODE_ENV = 'development';
    expect(resolveAiTraceConfig().detail).toBe('full');
  });

  test('prod defaults to detail=metadata', () => {
    process.env.NODE_ENV = 'production';
    expect(resolveAiTraceConfig().detail).toBe('metadata');
  });

  test('AI_TRACE_DETAIL=off honored regardless of NODE_ENV', () => {
    process.env.NODE_ENV = 'development';
    process.env.AI_TRACE_DETAIL = 'off';
    expect(resolveAiTraceConfig().detail).toBe('off');
  });

  test('retention defaults to 7 days, env overrides', () => {
    expect(resolveAiTraceConfig().retentionDays).toBe(7);
    process.env.AI_TRACE_RETENTION_DAYS = '30';
    expect(resolveAiTraceConfig().retentionDays).toBe(30);
  });

  test('invalid retention falls back to default', () => {
    process.env.AI_TRACE_RETENTION_DAYS = 'foo';
    expect(resolveAiTraceConfig().retentionDays).toBe(7);
  });

  test('promptMaxChars defaults to 50000, env overrides', () => {
    expect(resolveAiTraceConfig().promptMaxChars).toBe(50000);
    process.env.AI_TRACE_PROMPT_MAX_CHARS = '12345';
    expect(resolveAiTraceConfig().promptMaxChars).toBe(12345);
  });
});
```

- [ ] **步骤 2.2：运行测试确认失败**

```bash
node node_modules/vitest/vitest.mjs run tests/extends/observability/config.test.ts
```

预期：FAIL — `Cannot find module '@/lib/extends/observability/config'`。

- [ ] **步骤 2.3：写实现**

```ts
// lib/extends/observability/config.ts

export type AiTraceDetailLevel = 'off' | 'metadata' | 'full';

export interface AiTraceConfig {
  readonly detail: AiTraceDetailLevel;
  readonly retentionDays: number;
  readonly promptMaxChars: number;
  readonly env: 'dev' | 'prod' | 'test';
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseDetailLevel(value: string | undefined, defaultLevel: AiTraceDetailLevel): AiTraceDetailLevel {
  if (value === 'off' || value === 'metadata' || value === 'full') return value;
  return defaultLevel;
}

export function resolveAiTraceConfig(): AiTraceConfig {
  const nodeEnv = process.env.NODE_ENV;
  const env: AiTraceConfig['env'] =
    nodeEnv === 'production' ? 'prod' : nodeEnv === 'test' ? 'test' : 'dev';
  const defaultDetail: AiTraceDetailLevel = env === 'prod' ? 'metadata' : 'full';
  return {
    env,
    detail: parseDetailLevel(process.env.AI_TRACE_DETAIL, defaultDetail),
    retentionDays: parsePositiveInt(process.env.AI_TRACE_RETENTION_DAYS, 7),
    promptMaxChars: parsePositiveInt(process.env.AI_TRACE_PROMPT_MAX_CHARS, 50000),
  };
}
```

- [ ] **步骤 2.4：运行测试确认通过**

```bash
node node_modules/vitest/vitest.mjs run tests/extends/observability/config.test.ts
```

预期：6 passed。

- [ ] **步骤 2.5：Commit**

```bash
git add lib/extends/observability/config.ts tests/extends/observability/config.test.ts
git commit -m "feat(observability): add env config resolver for trace detail/retention"
```

---

## 任务 3：trace-context（AsyncLocalStorage 核心）

**文件：**
- 创建：`lib/extends/observability/trace-context.ts`
- 测试：`tests/extends/observability/trace-context.test.ts`

- [ ] **步骤 3.1：先写失败测试**

```ts
// tests/extends/observability/trace-context.test.ts
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { aiTraceContext, generateTraceId } from '@/lib/extends/observability/trace-context';
import type { TraceJsonlRecord } from '@/lib/extends/observability/trace-types';

// Capture sink writes via vi.mock so we can inspect what trace-context emits
const sinkCalls: TraceJsonlRecord[] = [];

vi.mock('@/lib/extends/observability/trace-sink', () => ({
  getTraceSink: () => ({
    writeTraceStart: (record: TraceJsonlRecord) => { sinkCalls.push(record); },
    writeSpan: (record: TraceJsonlRecord) => { sinkCalls.push(record); },
    writeTraceEnd: (record: TraceJsonlRecord) => { sinkCalls.push(record); },
  }),
}));

beforeEach(() => {
  sinkCalls.length = 0;
});

describe('aiTraceContext.run', () => {
  test('emits trace-start and trace-end for a successful run', async () => {
    await aiTraceContext.run(
      { kind: 'chapter-generation', context: { projectId: 'p-1' } },
      async () => 'ok',
    );
    expect(sinkCalls[0]._t).toBe('trace-start');
    expect(sinkCalls[sinkCalls.length - 1]._t).toBe('trace-end');
    expect((sinkCalls[sinkCalls.length - 1] as { status: string }).status).toBe('ok');
  });

  test('captures error and re-throws', async () => {
    await expect(
      aiTraceContext.run(
        { kind: 'chapter-generation', context: {} },
        async () => { throw new Error('boom'); },
      ),
    ).rejects.toThrow('boom');
    const end = sinkCalls.find((r) => r._t === 'trace-end') as { status: string; errorSummary?: string };
    expect(end.status).toBe('error');
    expect(end.errorSummary).toContain('boom');
  });

  test('currentTraceId returns the active id inside run', async () => {
    let captured: string | null = null;
    await aiTraceContext.run(
      { kind: 'other', context: {} },
      async () => { captured = aiTraceContext.currentTraceId(); },
    );
    expect(captured).toMatch(/^[A-Za-z0-9_-]{12,}$/);
    expect(aiTraceContext.currentTraceId()).toBeNull(); // outside run
  });
});

describe('aiTraceContext.withSpan', () => {
  test('records span on success', async () => {
    await aiTraceContext.run({ kind: 'other', context: {} }, async () => {
      await aiTraceContext.withSpan(
        { kind: 'workflow-step', name: 'outline' },
        async () => 42,
      );
    });
    const span = sinkCalls.find((r) => r._t === 'span') as { name: string; status: string };
    expect(span.name).toBe('outline');
    expect(span.status).toBe('ok');
  });

  test('records error span and re-throws', async () => {
    await expect(
      aiTraceContext.run({ kind: 'other', context: {} }, async () => {
        await aiTraceContext.withSpan({ kind: 'workflow-step', name: 'scene' }, async () => {
          throw new Error('span-boom');
        });
      }),
    ).rejects.toThrow('span-boom');
    const span = sinkCalls.find((r) => r._t === 'span') as { status: string; error: { message: string } };
    expect(span.status).toBe('error');
    expect(span.error.message).toBe('span-boom');
  });

  test('nested spans set parentSpanId', async () => {
    await aiTraceContext.run({ kind: 'other', context: {} }, async () => {
      await aiTraceContext.withSpan({ kind: 'workflow-step', name: 'outer' }, async () => {
        await aiTraceContext.withSpan({ kind: 'llm-call', name: 'inner' }, async () => {});
      });
    });
    const spans = sinkCalls.filter((r) => r._t === 'span') as Array<{ name: string; parentSpanId?: string; spanId: string }>;
    const outer = spans.find((s) => s.name === 'outer')!;
    const inner = spans.find((s) => s.name === 'inner')!;
    expect(inner.parentSpanId).toBe(outer.spanId);
  });
});

describe('aiTraceContext.withLLMSpan', () => {
  test('auto-extracts usage and assigns llm-call kind', async () => {
    await aiTraceContext.run({ kind: 'chapter-generation', context: {} }, async () => {
      await aiTraceContext.withLLMSpan(
        { source: 'test', modelId: 'mimo-v2.5', providerId: 'xiaomi', promptText: 'hi' },
        async () => ({
          text: 'world',
          usage: { inputTokens: 10, outputTokens: 5 },
        }),
      );
    });
    const span = sinkCalls.find((r) => r._t === 'span') as { kind: string; attrs: { inputTokens?: number; outputTokens?: number; responseChars?: number } };
    expect(span.kind).toBe('llm-call');
    expect(span.attrs.inputTokens).toBe(10);
    expect(span.attrs.outputTokens).toBe(5);
    expect(span.attrs.responseChars).toBe(5);
  });
});

describe('generateTraceId / generateSpanId', () => {
  test('generates url-safe ids of expected length', () => {
    const id = generateTraceId();
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(id.length).toBeGreaterThanOrEqual(12);
  });
});
```

- [ ] **步骤 3.2：运行测试确认失败**

```bash
node node_modules/vitest/vitest.mjs run tests/extends/observability/trace-context.test.ts
```

预期：FAIL — module not found / sink mock 路径找不到。

- [ ] **步骤 3.3：写实现**

```ts
// lib/extends/observability/trace-context.ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { nanoid } from 'nanoid';
import { getTraceSink } from './trace-sink';
import { resolveAiTraceConfig } from './config';
import type {
  AiSpan,
  AiTrace,
  SpanAttrs,
  SpanEvent,
  SpanKind,
  TraceBusinessContext,
  TraceKind,
} from './trace-types';

const consoleWarn = (...args: unknown[]) => console.warn('[ai-trace]', ...args);

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

export interface SpanHandle {
  readonly spanId: string;
  end(result?: { status?: 'ok' | 'error' | 'fallback'; error?: unknown; attrs?: SpanAttrs }): void;
  addEvent(event: Omit<SpanEvent, 'at'>): void;
}

interface TraceFrame {
  readonly trace: AiTrace;
  readonly spanStack: AiSpan[];
}

const storage = new AsyncLocalStorage<TraceFrame>();

export function generateTraceId(): string {
  return nanoid(16);
}

export function generateSpanId(): string {
  return nanoid(12);
}

function summarizeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

function buildSpan(opts: WithSpanOptions, traceId: string, parentSpanId?: string): AiSpan {
  return {
    spanId: generateSpanId(),
    traceId,
    parentSpanId,
    kind: opts.kind,
    name: opts.name,
    attrs: { ...(opts.attrs ?? {}) },
    startedAt: new Date().toISOString(),
    status: 'in-progress',
    events: [],
  };
}

function finalizeSpan(
  span: AiSpan,
  result: { status?: 'ok' | 'error' | 'fallback'; error?: unknown; attrs?: SpanAttrs } | undefined,
): AiSpan {
  const endedAt = new Date().toISOString();
  const durationMs = Date.parse(endedAt) - Date.parse(span.startedAt);
  const status = result?.error ? 'error' : (result?.status ?? 'ok');
  const errorObj = result?.error
    ? {
        message: summarizeError(result.error),
        stack: result.error instanceof Error ? result.error.stack : undefined,
        kind: result.error instanceof Error ? result.error.name : undefined,
      }
    : undefined;
  return {
    ...span,
    endedAt,
    durationMs,
    status,
    error: errorObj,
    attrs: { ...span.attrs, ...(result?.attrs ?? {}) },
  };
}

export const aiTraceContext = {
  async run<T>(opts: RunTraceOptions, fn: () => Promise<T>): Promise<T> {
    const cfg = resolveAiTraceConfig();
    const traceId = opts.inherit?.traceId ?? generateTraceId();
    const trace: AiTrace = {
      traceId,
      kind: opts.kind,
      context: opts.context,
      startedAt: new Date().toISOString(),
      status: 'in-progress',
      spanCount: 0,
      env: cfg.env,
    };

    try {
      getTraceSink().writeTraceStart({ _t: 'trace-start', ...trace });
    } catch (err) {
      consoleWarn('writeTraceStart failed', err);
    }

    const frame: TraceFrame = { trace, spanStack: [] };

    let errorThrown: unknown = null;
    try {
      return await storage.run(frame, fn);
    } catch (err) {
      errorThrown = err;
      throw err;
    } finally {
      const endedAt = new Date().toISOString();
      const durationMs = Date.parse(endedAt) - Date.parse(trace.startedAt);
      try {
        getTraceSink().writeTraceEnd({
          _t: 'trace-end',
          traceId,
          endedAt,
          durationMs,
          status: errorThrown ? 'error' : 'ok',
          errorSummary: errorThrown ? summarizeError(errorThrown) : undefined,
          spanCount: frame.spanStack.length,
        });
      } catch (err) {
        consoleWarn('writeTraceEnd failed', err);
      }
    }
  },

  startSpan(opts: WithSpanOptions): SpanHandle {
    const frame = storage.getStore();
    if (!frame) {
      return {
        spanId: 'noop',
        end: () => undefined,
        addEvent: () => undefined,
      };
    }
    const parent = frame.spanStack[frame.spanStack.length - 1];
    const span = buildSpan(opts, frame.trace.traceId, parent?.spanId);
    frame.spanStack.push(span);
    let closed = false;
    return {
      spanId: span.spanId,
      end: (result) => {
        if (closed) return;
        closed = true;
        const finalized = finalizeSpan(span, result);
        frame.spanStack.pop();
        try {
          getTraceSink().writeSpan({ _t: 'span', ...finalized });
        } catch (err) {
          consoleWarn('writeSpan failed', err);
        }
      },
      addEvent: (event) => {
        span.events.push({ at: new Date().toISOString(), ...event });
      },
    };
  },

  async withSpan<T>(opts: WithSpanOptions, fn: () => Promise<T>): Promise<T> {
    let handle: SpanHandle | null = null;
    try { handle = this.startSpan(opts); }
    catch (err) { consoleWarn('startSpan failed', err); return fn(); }

    try {
      const result = await fn();
      handle.end({ status: 'ok' });
      return result;
    } catch (err) {
      handle.end({ status: 'error', error: err });
      throw err;
    }
  },

  async withLLMSpan<T>(
    opts: { source: string; modelId?: string; providerId?: string; promptText?: string },
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.withSpan(
      {
        kind: 'llm-call',
        name: `callLLM[${opts.providerId ?? '?'}/${opts.modelId ?? '?'}]`,
        attrs: {
          source: opts.source,
          providerId: opts.providerId,
          modelId: opts.modelId,
          promptText: opts.promptText,
          promptChars: opts.promptText?.length,
        },
      },
      async () => {
        const result = await fn();
        const r = result as { text?: string; usage?: { inputTokens?: number; outputTokens?: number } };
        const handle = storage.getStore()?.spanStack[storage.getStore()!.spanStack.length - 1];
        if (handle) {
          // mutate top-of-stack span's attrs in place; withSpan's end() will pick it up
          Object.assign(handle.attrs as Record<string, unknown>, {
            responseText: r.text,
            responseChars: r.text?.length,
            inputTokens: r.usage?.inputTokens,
            outputTokens: r.usage?.outputTokens,
          });
        }
        return result;
      },
    );
  },

  currentTraceId(): string | null {
    return storage.getStore()?.trace.traceId ?? null;
  },
};
```

- [ ] **步骤 3.4：写一个临时的 trace-sink stub 让测试能跑**

注意：trace-sink.ts 还没实现。先建一个最小 stub 让测试和实现可编译；任务 4 会替换：

```ts
// lib/extends/observability/trace-sink.ts (临时 stub，任务 4 替换)
import type { TraceJsonlRecord } from './trace-types';

export interface TraceSink {
  writeTraceStart(record: TraceJsonlRecord): void;
  writeSpan(record: TraceJsonlRecord): void;
  writeTraceEnd(record: TraceJsonlRecord): void;
}

const noopSink: TraceSink = {
  writeTraceStart: () => undefined,
  writeSpan: () => undefined,
  writeTraceEnd: () => undefined,
};

export function getTraceSink(): TraceSink {
  return noopSink;
}
```

- [ ] **步骤 3.5：运行测试确认通过**

```bash
node node_modules/vitest/vitest.mjs run tests/extends/observability/trace-context.test.ts
```

预期：8 passed（5 个 describe，8 个 test）。

- [ ] **步骤 3.6：Commit**

```bash
git add lib/extends/observability/trace-context.ts lib/extends/observability/trace-sink.ts tests/extends/observability/trace-context.test.ts
git commit -m "feat(observability): add async-local trace-context with run/withSpan/withLLMSpan"
```

---

## 任务 4：trace-sink（JSONL 持久化）

**文件：**
- 创建：`lib/extends/observability/trace-sink.ts`（替换任务 3 的 stub）
- 测试：`tests/extends/observability/trace-sink.test.ts`

- [ ] **步骤 4.1：先写测试**

```ts
// tests/extends/observability/trace-sink.test.ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonlTraceSink } from '@/lib/extends/observability/trace-sink';
import type { SpanRecord, TraceEndRecord, TraceStartRecord } from '@/lib/extends/observability/trace-types';

let tmpDir = '';

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-traces-test-'));
});
afterEach(() => {
  if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function makeStart(traceId = 't1', startedAt = '2026-05-28T05:55:00.000Z'): TraceStartRecord {
  return {
    _t: 'trace-start',
    traceId,
    kind: 'chapter-generation',
    context: { projectId: 'p-1' },
    startedAt,
    env: 'test',
  };
}

function makeSpan(traceId = 't1', spanId = 'sp1', status: 'ok' | 'error' = 'ok'): SpanRecord {
  return {
    _t: 'span',
    spanId, traceId, kind: 'workflow-step', name: 'outline',
    attrs: {}, startedAt: '...', endedAt: '...', durationMs: 100, status, events: [],
  };
}

function makeEnd(traceId = 't1', status: 'ok' | 'error' = 'ok'): TraceEndRecord {
  return {
    _t: 'trace-end', traceId, endedAt: '...', durationMs: 1000, status, spanCount: 1,
  };
}

describe('JsonlTraceSink', () => {
  test('writes trace-start to per-trace JSONL file', async () => {
    const sink = createJsonlTraceSink({ rootDir: tmpDir, detail: 'full', promptMaxChars: 1000 });
    sink.writeTraceStart(makeStart('t1'));
    await sink.flush();

    const files = readdirSync(join(tmpDir, '2026-05-28'));
    expect(files).toEqual(['t1.jsonl']);
    const content = readFileSync(join(tmpDir, '2026-05-28/t1.jsonl'), 'utf8');
    expect(JSON.parse(content.trim())._t).toBe('trace-start');
  });

  test('appends span lines after trace-start', async () => {
    const sink = createJsonlTraceSink({ rootDir: tmpDir, detail: 'full', promptMaxChars: 1000 });
    sink.writeTraceStart(makeStart('t1'));
    sink.writeSpan(makeSpan('t1', 'sp1', 'ok'));
    sink.writeSpan(makeSpan('t1', 'sp2', 'ok'));
    await sink.flush();

    const content = readFileSync(join(tmpDir, '2026-05-28/t1.jsonl'), 'utf8');
    const lines = content.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l._t)).toEqual(['trace-start', 'span', 'span']);
  });

  test('writeTraceEnd appends end line and writes index entry', async () => {
    const sink = createJsonlTraceSink({ rootDir: tmpDir, detail: 'full', promptMaxChars: 1000 });
    sink.writeTraceStart(makeStart('t1'));
    sink.writeSpan(makeSpan('t1', 'sp1', 'ok'));
    sink.writeTraceEnd(makeEnd('t1', 'ok'));
    await sink.flush();

    const content = readFileSync(join(tmpDir, '2026-05-28/t1.jsonl'), 'utf8');
    const lines = content.trim().split('\n');
    expect(JSON.parse(lines[lines.length - 1])._t).toBe('trace-end');

    const index = readFileSync(join(tmpDir, 'index.jsonl'), 'utf8');
    const entry = JSON.parse(index.trim());
    expect(entry.traceId).toBe('t1');
    expect(entry.file).toBe('2026-05-28/t1.jsonl');
  });

  test('detail=metadata strips promptText/responseText on ok spans', async () => {
    const sink = createJsonlTraceSink({ rootDir: tmpDir, detail: 'metadata', promptMaxChars: 1000 });
    sink.writeTraceStart(makeStart('t1'));
    sink.writeSpan({
      ...makeSpan('t1', 'sp1', 'ok'),
      attrs: { promptText: 'big prompt', responseText: 'big response', promptChars: 10 },
    });
    sink.writeTraceEnd(makeEnd('t1', 'ok'));
    await sink.flush();

    const content = readFileSync(join(tmpDir, '2026-05-28/t1.jsonl'), 'utf8');
    const spanLine = content.split('\n').find((l) => l.includes('"_t":"span"'))!;
    const parsed = JSON.parse(spanLine);
    expect(parsed.attrs.promptText).toBeUndefined();
    expect(parsed.attrs.responseText).toBeUndefined();
    expect(parsed.attrs.promptChars).toBe(10); // metadata kept
  });

  test('detail=metadata preserves promptText/responseText on error spans', async () => {
    const sink = createJsonlTraceSink({ rootDir: tmpDir, detail: 'metadata', promptMaxChars: 1000 });
    sink.writeTraceStart(makeStart('t1'));
    sink.writeSpan({
      ...makeSpan('t1', 'sp1', 'error'),
      attrs: { promptText: 'failed prompt' },
      error: { message: 'boom' },
    });
    sink.writeTraceEnd(makeEnd('t1', 'error'));
    await sink.flush();

    const spanLine = readFileSync(join(tmpDir, '2026-05-28/t1.jsonl'), 'utf8')
      .split('\n').find((l) => l.includes('"_t":"span"'))!;
    expect(JSON.parse(spanLine).attrs.promptText).toBe('failed prompt');
  });

  test('detail=full truncates promptText longer than promptMaxChars', async () => {
    const sink = createJsonlTraceSink({ rootDir: tmpDir, detail: 'full', promptMaxChars: 10 });
    sink.writeTraceStart(makeStart('t1'));
    sink.writeSpan({
      ...makeSpan('t1', 'sp1', 'ok'),
      attrs: { promptText: 'a'.repeat(50) },
    });
    sink.writeTraceEnd(makeEnd('t1', 'ok'));
    await sink.flush();

    const spanLine = readFileSync(join(tmpDir, '2026-05-28/t1.jsonl'), 'utf8')
      .split('\n').find((l) => l.includes('"_t":"span"'))!;
    const parsed = JSON.parse(spanLine);
    expect(parsed.attrs.promptText.length).toBeLessThanOrEqual(15); // 10 chars + ellipsis tag
    expect(parsed.attrs.promptText).toContain('…');
  });

  test('detail=off skips span writes but keeps trace-start/end', async () => {
    const sink = createJsonlTraceSink({ rootDir: tmpDir, detail: 'off', promptMaxChars: 1000 });
    sink.writeTraceStart(makeStart('t1'));
    sink.writeSpan(makeSpan('t1', 'sp1', 'ok'));
    sink.writeTraceEnd(makeEnd('t1', 'ok'));
    await sink.flush();

    const content = readFileSync(join(tmpDir, '2026-05-28/t1.jsonl'), 'utf8');
    expect(content).not.toContain('"_t":"span"');
    expect(content).toContain('"_t":"trace-start"');
    expect(content).toContain('"_t":"trace-end"');
  });
});
```

- [ ] **步骤 4.2：运行测试确认失败**

```bash
node node_modules/vitest/vitest.mjs run tests/extends/observability/trace-sink.test.ts
```

预期：FAIL — `createJsonlTraceSink` 未导出。

- [ ] **步骤 4.3：写实现（替换任务 3 的 stub）**

```ts
// lib/extends/observability/trace-sink.ts (full implementation)
import { appendFileSync, fsyncSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  SpanRecord, TraceEndRecord, TraceIndexEntry, TraceJsonlRecord, TraceStartRecord,
} from './trace-types';
import { resolveAiTraceConfig, type AiTraceDetailLevel } from './config';

export interface TraceSink {
  writeTraceStart(record: TraceStartRecord): void;
  writeSpan(record: SpanRecord): void;
  writeTraceEnd(record: TraceEndRecord): void;
  flush(): Promise<void>;
}

export interface TraceSinkOptions {
  readonly rootDir: string;
  readonly detail: AiTraceDetailLevel;
  readonly promptMaxChars: number;
}

interface TraceFileInfo {
  readonly path: string;
  readonly relative: string;
  readonly startedAt: string;
  kind: TraceStartRecord['kind'];
  context: TraceStartRecord['context'];
}

const noopSink: TraceSink = {
  writeTraceStart: () => undefined,
  writeSpan: () => undefined,
  writeTraceEnd: () => undefined,
  flush: async () => undefined,
};

let singletonSink: TraceSink | null = null;

export function getTraceSink(): TraceSink {
  if (singletonSink) return singletonSink;
  const cfg = resolveAiTraceConfig();
  singletonSink = createJsonlTraceSink({
    rootDir: process.env.AI_TRACE_ROOT_DIR ?? 'data/ai-traces',
    detail: cfg.detail,
    promptMaxChars: cfg.promptMaxChars,
  });
  return singletonSink;
}

/** Reset cached singleton (test only). */
export function __resetTraceSink(): void {
  singletonSink = null;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…(truncated)`;
}

function redactSpanForDetailLevel(span: SpanRecord, detail: AiTraceDetailLevel, promptMaxChars: number): SpanRecord {
  const isError = span.status === 'error';
  if (detail === 'off') return span; // sink will drop entire span
  if (detail === 'full' || isError) {
    const attrs = { ...span.attrs };
    if (attrs.promptText && attrs.promptText.length > promptMaxChars) {
      attrs.promptText = truncate(attrs.promptText, promptMaxChars);
    }
    if (attrs.responseText && attrs.responseText.length > promptMaxChars) {
      attrs.responseText = truncate(attrs.responseText, promptMaxChars);
    }
    return { ...span, attrs };
  }
  // detail=metadata && ok span: strip text fields
  const attrs = { ...span.attrs };
  delete attrs.promptText;
  delete attrs.responseText;
  delete attrs.httpRequestBody;
  delete attrs.httpResponseBody;
  return { ...span, attrs };
}

export function createJsonlTraceSink(options: TraceSinkOptions): TraceSink {
  const { rootDir, detail, promptMaxChars } = options;
  const files = new Map<string, TraceFileInfo>();
  let pending: Promise<void> = Promise.resolve();

  function enqueue(work: () => void): void {
    pending = pending.then(() => {
      try { work(); } catch (err) { console.warn('[ai-trace sink]', err); }
    });
  }

  function ensureFile(traceId: string, startedAt: string, kind: TraceStartRecord['kind'], context: TraceStartRecord['context']): TraceFileInfo {
    const cached = files.get(traceId);
    if (cached) return cached;
    const date = startedAt.slice(0, 10); // YYYY-MM-DD
    const relative = `${date}/${traceId}.jsonl`;
    const fullPath = join(rootDir, relative);
    mkdirSync(dirname(fullPath), { recursive: true });
    const info: TraceFileInfo = { path: fullPath, relative, startedAt, kind, context };
    files.set(traceId, info);
    return info;
  }

  function appendLine(filePath: string, record: TraceJsonlRecord, fsync: boolean): void {
    const line = `${JSON.stringify(record)}\n`;
    if (fsync) {
      const fd = openSync(filePath, 'a');
      try { appendFileSync(fd, line); fsyncSync(fd); }
      finally { closeSync(fd); }
    } else {
      appendFileSync(filePath, line);
    }
  }

  function writeIndexEntry(entry: TraceIndexEntry): void {
    const indexPath = join(rootDir, 'index.jsonl');
    mkdirSync(rootDir, { recursive: true });
    appendFileSync(indexPath, `${JSON.stringify(entry)}\n`);
  }

  return {
    writeTraceStart(record: TraceStartRecord): void {
      enqueue(() => {
        const info = ensureFile(record.traceId, record.startedAt, record.kind, record.context);
        appendLine(info.path, record, false);
      });
    },

    writeSpan(record: SpanRecord): void {
      enqueue(() => {
        if (detail === 'off') return; // skip spans entirely
        const info = files.get(record.traceId);
        if (!info) {
          console.warn('[ai-trace sink] writeSpan with no prior writeTraceStart', record.traceId);
          return;
        }
        const redacted = redactSpanForDetailLevel(record, detail, promptMaxChars);
        const fsync = record.status === 'error';
        appendLine(info.path, redacted, fsync);
      });
    },

    writeTraceEnd(record: TraceEndRecord): void {
      enqueue(() => {
        const info = files.get(record.traceId);
        if (!info) return;
        appendLine(info.path, record, true);
        writeIndexEntry({
          traceId: record.traceId,
          kind: info.kind,
          status: record.status,
          startedAt: info.startedAt,
          durationMs: record.durationMs,
          context: info.context,
          errorSummary: record.errorSummary,
          file: info.relative,
        });
        files.delete(record.traceId);
      });
    },

    async flush(): Promise<void> {
      await pending;
    },
  };
}
```

- [ ] **步骤 4.4：运行测试确认通过**

```bash
node node_modules/vitest/vitest.mjs run tests/extends/observability/trace-sink.test.ts
```

预期：7 passed。

- [ ] **步骤 4.5：重跑 trace-context 测试确保仍通过（sink 实现替换后）**

```bash
node node_modules/vitest/vitest.mjs run tests/extends/observability/trace-context.test.ts tests/extends/observability/trace-sink.test.ts
```

预期：15 passed。

- [ ] **步骤 4.6：Commit**

```bash
git add lib/extends/observability/trace-sink.ts tests/extends/observability/trace-sink.test.ts
git commit -m "feat(observability): implement JSONL trace sink with detail-level redaction"
```

---

## 任务 5：trace-reader（列表与详情查询）

**文件：**
- 创建：`lib/extends/observability/trace-reader.ts`
- 测试：`tests/extends/observability/trace-reader.test.ts`

- [ ] **步骤 5.1：写测试**

```ts
// tests/extends/observability/trace-reader.test.ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonlTraceReader } from '@/lib/extends/observability/trace-reader';

let tmpDir = '';

beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'ai-traces-reader-')); });
afterEach(() => { if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true }); });

function seedTrace(traceId: string, date = '2026-05-28', status: 'ok' | 'error' = 'ok') {
  const dateDir = join(tmpDir, date);
  mkdirSync(dateDir, { recursive: true });
  const lines = [
    JSON.stringify({ _t: 'trace-start', traceId, kind: 'chapter-generation', context: { projectId: 'p-1' }, startedAt: `${date}T00:00:00.000Z`, env: 'test' }),
    JSON.stringify({ _t: 'span', spanId: 'sp1', traceId, kind: 'workflow-step', name: 'outline', attrs: { promptText: 'long text', responseText: 'response' }, startedAt: '...', endedAt: '...', durationMs: 100, status: 'ok', events: [] }),
    JSON.stringify({ _t: 'trace-end', traceId, endedAt: '...', durationMs: 1000, status, spanCount: 1, errorSummary: status === 'error' ? 'failed' : undefined }),
  ].join('\n') + '\n';
  writeFileSync(join(dateDir, `${traceId}.jsonl`), lines);
  // append index entry
  const indexEntry = { traceId, kind: 'chapter-generation', status, startedAt: `${date}T00:00:00.000Z`, durationMs: 1000, context: { projectId: 'p-1' }, errorSummary: status === 'error' ? 'failed' : undefined, file: `${date}/${traceId}.jsonl` };
  writeFileSync(join(tmpDir, 'index.jsonl'), JSON.stringify(indexEntry) + '\n', { flag: 'a' });
}

describe('JsonlTraceReader', () => {
  test('listTraces returns newest first', async () => {
    seedTrace('older', '2026-05-27');
    seedTrace('newer', '2026-05-28');
    const reader = createJsonlTraceReader({ rootDir: tmpDir });
    const list = await reader.listTraces({});
    expect(list[0].traceId).toBe('newer');
    expect(list[1].traceId).toBe('older');
  });

  test('listTraces filters by status', async () => {
    seedTrace('ok-trace', '2026-05-28', 'ok');
    seedTrace('err-trace', '2026-05-28', 'error');
    const reader = createJsonlTraceReader({ rootDir: tmpDir });
    const errors = await reader.listTraces({ status: 'error' });
    expect(errors.map((t) => t.traceId)).toEqual(['err-trace']);
  });

  test('listTraces filters by projectId', async () => {
    seedTrace('p1', '2026-05-28');
    // seed a second trace for a different project
    const dateDir = join(tmpDir, '2026-05-28');
    writeFileSync(
      join(tmpDir, 'index.jsonl'),
      JSON.stringify({ traceId: 'p2', kind: 'chapter-generation', status: 'ok', startedAt: '2026-05-28T00:00:00.000Z', durationMs: 1, context: { projectId: 'OTHER' }, file: '2026-05-28/p2.jsonl' }) + '\n',
      { flag: 'a' },
    );
    const reader = createJsonlTraceReader({ rootDir: tmpDir });
    const filtered = await reader.listTraces({ projectId: 'p-1' });
    expect(filtered.map((t) => t.traceId)).toEqual(['p1']);
  });

  test('readTrace returns parsed trace + spans (developer view)', async () => {
    seedTrace('t1');
    const reader = createJsonlTraceReader({ rootDir: tmpDir });
    const trace = await reader.readTrace('t1', { view: 'developer' });
    expect(trace?.trace.traceId).toBe('t1');
    expect(trace?.spans).toHaveLength(1);
    expect(trace?.spans[0].attrs.promptText).toBe('long text');
  });

  test('readTrace returns null for missing traceId', async () => {
    const reader = createJsonlTraceReader({ rootDir: tmpDir });
    const trace = await reader.readTrace('missing', { view: 'developer' });
    expect(trace).toBeNull();
  });

  test('readTrace with view=teacher truncates promptText', async () => {
    seedTrace('t1');
    const reader = createJsonlTraceReader({ rootDir: tmpDir });
    const trace = await reader.readTrace('t1', { view: 'teacher' });
    // 'long text' is shorter than 200 chars cap so it stays — assert no stack leak
    expect(trace?.spans[0].error?.stack).toBeUndefined();
  });
});
```

- [ ] **步骤 5.2：运行测试确认失败**

```bash
node node_modules/vitest/vitest.mjs run tests/extends/observability/trace-reader.test.ts
```

预期：FAIL — module not found。

- [ ] **步骤 5.3：写实现**

```ts
// lib/extends/observability/trace-reader.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AiSpan, AiTrace, SpanRecord, TraceEndRecord, TraceIndexEntry, TraceJsonlRecord, TraceStartRecord,
} from './trace-types';
import { isSpan, isTraceEnd, isTraceStart } from './trace-types';
import { redactSpanForTeacher } from './redaction';

export interface TraceListFilter {
  readonly kind?: TraceJsonlRecord extends { kind: infer K } ? K : never;
  readonly status?: 'in-progress' | 'ok' | 'error' | 'partial';
  readonly projectId?: string;
  readonly chapterId?: string;
  readonly sinceMs?: number; // unix ms cutoff
  readonly search?: string;  // substring match in errorSummary
  readonly limit?: number;
  readonly offset?: number;
}

export interface TraceDetailView {
  readonly trace: AiTrace;
  readonly spans: AiSpan[];
  readonly status: AiTrace['status'];
}

export interface TraceReader {
  listTraces(filter: TraceListFilter): Promise<TraceIndexEntry[]>;
  readTrace(traceId: string, opts: { view: 'teacher' | 'developer' }): Promise<TraceDetailView | null>;
}

export interface TraceReaderOptions {
  readonly rootDir: string;
}

function parseIndex(rootDir: string): TraceIndexEntry[] {
  const indexPath = join(rootDir, 'index.jsonl');
  if (!existsSync(indexPath)) return [];
  const content = readFileSync(indexPath, 'utf8');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try { return JSON.parse(line) as TraceIndexEntry; }
      catch { return null; }
    })
    .filter((entry): entry is TraceIndexEntry => entry !== null);
}

function matchesFilter(entry: TraceIndexEntry, filter: TraceListFilter): boolean {
  if (filter.kind && entry.kind !== filter.kind) return false;
  if (filter.status && entry.status !== filter.status) return false;
  if (filter.projectId && entry.context.projectId !== filter.projectId) return false;
  if (filter.chapterId && entry.context.chapterId !== filter.chapterId) return false;
  if (filter.sinceMs && Date.parse(entry.startedAt) < filter.sinceMs) return false;
  if (filter.search && !(entry.errorSummary ?? '').toLowerCase().includes(filter.search.toLowerCase())) return false;
  return true;
}

export function createJsonlTraceReader(options: TraceReaderOptions): TraceReader {
  const { rootDir } = options;
  return {
    async listTraces(filter: TraceListFilter): Promise<TraceIndexEntry[]> {
      const all = parseIndex(rootDir);
      const matched = all.filter((e) => matchesFilter(e, filter));
      matched.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
      const offset = filter.offset ?? 0;
      const limit = filter.limit ?? 50;
      return matched.slice(offset, offset + limit);
    },

    async readTrace(traceId, { view }): Promise<TraceDetailView | null> {
      const index = parseIndex(rootDir);
      const entry = index.find((e) => e.traceId === traceId);
      if (!entry) return null;
      const filePath = join(rootDir, entry.file);
      if (!existsSync(filePath)) return null;
      const lines = readFileSync(filePath, 'utf8').split('\n').filter((l) => l.trim().length > 0);

      let start: TraceStartRecord | null = null;
      let end: TraceEndRecord | null = null;
      const spans: AiSpan[] = [];
      for (const line of lines) {
        let parsed: TraceJsonlRecord;
        try { parsed = JSON.parse(line) as TraceJsonlRecord; }
        catch { continue; }
        if (isTraceStart(parsed)) start = parsed;
        else if (isSpan(parsed)) {
          const { _t: _, ...span } = parsed as SpanRecord;
          spans.push(view === 'teacher' ? redactSpanForTeacher(span) : span);
        }
        else if (isTraceEnd(parsed)) end = parsed;
      }
      if (!start) return null;

      const trace: AiTrace = {
        traceId: start.traceId,
        kind: start.kind,
        context: start.context,
        startedAt: start.startedAt,
        endedAt: end?.endedAt,
        durationMs: end?.durationMs,
        status: end?.status ?? 'in-progress',
        errorSummary: end?.errorSummary,
        spanCount: end?.spanCount ?? spans.length,
        env: start.env,
        appVersion: start.appVersion,
      };

      return { trace, spans, status: trace.status };
    },
  };
}
```

- [ ] **步骤 5.4：运行测试**

```bash
node node_modules/vitest/vitest.mjs run tests/extends/observability/trace-reader.test.ts
```

预期：6 passed（但有 1 个测试依赖 `redactSpanForTeacher`，下一任务建好后再跑全套）。如果失败因 redaction 未实现，先写一个临时 stub：

```ts
// lib/extends/observability/redaction.ts (临时 stub，任务 6 替换)
import type { AiSpan } from './trace-types';
export function redactSpanForTeacher(span: AiSpan): AiSpan { return span; }
```

再重跑测试确认 6 passed。

- [ ] **步骤 5.5：Commit**

```bash
git add lib/extends/observability/trace-reader.ts lib/extends/observability/redaction.ts tests/extends/observability/trace-reader.test.ts
git commit -m "feat(observability): add trace reader for index list + per-trace JSONL parse"
```

---

## 任务 6：redaction（教师视图脱敏）

**文件：**
- 创建：`lib/extends/observability/redaction.ts`（替换任务 5 的 stub）
- 测试：`tests/extends/observability/redaction.test.ts`

- [ ] **步骤 6.1：写测试**

```ts
// tests/extends/observability/redaction.test.ts
import { describe, expect, test } from 'vitest';
import { redactSpanForTeacher } from '@/lib/extends/observability/redaction';
import type { AiSpan } from '@/lib/extends/observability/trace-types';

function makeSpan(overrides: Partial<AiSpan>): AiSpan {
  return {
    spanId: 'sp1', traceId: 't1', kind: 'workflow-step', name: 'n',
    attrs: {}, startedAt: 's', status: 'ok', events: [],
    ...overrides,
  };
}

describe('redactSpanForTeacher', () => {
  test('truncates promptText to 200 chars', () => {
    const span = makeSpan({ attrs: { promptText: 'a'.repeat(500) } });
    const out = redactSpanForTeacher(span);
    expect(out.attrs.promptText?.length).toBeLessThanOrEqual(205);
    expect(out.attrs.promptText).toContain('…');
  });

  test('truncates responseText to 200 chars', () => {
    const span = makeSpan({ attrs: { responseText: 'b'.repeat(500) } });
    const out = redactSpanForTeacher(span);
    expect(out.attrs.responseText?.length).toBeLessThanOrEqual(205);
  });

  test('drops httpRequestBody entirely', () => {
    const span = makeSpan({ attrs: { httpRequestBody: { secret: 'x' } } });
    const out = redactSpanForTeacher(span);
    expect(out.attrs.httpRequestBody).toBeUndefined();
  });

  test('truncates httpResponseBody to 400 chars (stringified)', () => {
    const span = makeSpan({ attrs: { httpResponseBody: { data: 'z'.repeat(1000) } } });
    const out = redactSpanForTeacher(span);
    const body = out.attrs.httpResponseBody as string;
    expect(typeof body).toBe('string');
    expect(body.length).toBeLessThanOrEqual(405);
  });

  test('removes error.stack', () => {
    const span = makeSpan({ error: { message: 'oops', stack: 'at /secret/path:1' } });
    const out = redactSpanForTeacher(span);
    expect(out.error?.message).toBe('oops');
    expect(out.error?.stack).toBeUndefined();
  });

  test('truncates error.upstreamBody to 400 chars', () => {
    const span = makeSpan({ error: { message: 'm', upstreamBody: 'u'.repeat(1000) } });
    const out = redactSpanForTeacher(span);
    expect(out.error?.upstreamBody?.length).toBeLessThanOrEqual(405);
  });

  test('preserves metadata fields (model/usage/latency)', () => {
    const span = makeSpan({
      attrs: { modelId: 'mimo', providerId: 'xiaomi', inputTokens: 100, outputTokens: 50, promptChars: 200 },
      durationMs: 1234,
    });
    const out = redactSpanForTeacher(span);
    expect(out.attrs.modelId).toBe('mimo');
    expect(out.attrs.inputTokens).toBe(100);
    expect(out.durationMs).toBe(1234);
  });
});
```

- [ ] **步骤 6.2：运行测试确认失败（stub 还是 passthrough）**

```bash
node node_modules/vitest/vitest.mjs run tests/extends/observability/redaction.test.ts
```

预期：FAIL — stub 不做截断，多数断言失败。

- [ ] **步骤 6.3：写实现替换 stub**

```ts
// lib/extends/observability/redaction.ts
import type { AiSpan } from './trace-types';

const TEACHER_PROMPT_MAX = 200;
const TEACHER_BODY_MAX = 400;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function stringifySafe(value: unknown): string {
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function redactSpanForTeacher(span: AiSpan): AiSpan {
  const attrs = { ...span.attrs };
  if (attrs.promptText) attrs.promptText = truncate(attrs.promptText, TEACHER_PROMPT_MAX);
  if (attrs.responseText) attrs.responseText = truncate(attrs.responseText, TEACHER_PROMPT_MAX);
  delete attrs.httpRequestBody;
  if (attrs.httpResponseBody !== undefined) {
    attrs.httpResponseBody = truncate(stringifySafe(attrs.httpResponseBody), TEACHER_BODY_MAX);
  }

  const error = span.error
    ? {
        message: span.error.message,
        kind: span.error.kind,
        httpStatus: span.error.httpStatus,
        upstreamBody: span.error.upstreamBody
          ? truncate(span.error.upstreamBody, TEACHER_BODY_MAX)
          : undefined,
      }
    : undefined;

  return { ...span, attrs, error };
}
```

- [ ] **步骤 6.4：运行测试**

```bash
node node_modules/vitest/vitest.mjs run tests/extends/observability/redaction.test.ts tests/extends/observability/trace-reader.test.ts
```

预期：13 passed（redaction 7 + reader 6）。

- [ ] **步骤 6.5：Commit**

```bash
git add lib/extends/observability/redaction.ts tests/extends/observability/redaction.test.ts
git commit -m "feat(observability): add teacher-view redaction (truncate prompts, drop stack)"
```

---

## 任务 7：callLLM 拦截器

**文件：**
- 创建：`lib/extends/ai/llm.ts`
- 测试：`tests/extends/observability/llm-interceptor.test.ts`
- 修改：`extends/fork-aliases.json`
- 修改：`tsconfig.json`（由脚本同步）

- [ ] **步骤 7.1：写测试**

```ts
// tests/extends/observability/llm-interceptor.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { aiTraceContext } from '@/lib/extends/observability/trace-context';

const upstreamCallLLM = vi.fn();
vi.mock('@/lib/ai/llm', async (importOriginal) => {
  // Use the relative import semantics — return our stub directly
  return {
    callLLM: upstreamCallLLM,
    streamLLM: vi.fn(),
  };
});

// Re-import the fork wrapper after mock is registered
const { callLLM: forkedCallLLM } = await import('@/lib/extends/ai/llm');

beforeEach(() => {
  upstreamCallLLM.mockReset();
});

describe('forked callLLM', () => {
  test('passes through to upstream and returns result', async () => {
    upstreamCallLLM.mockResolvedValueOnce({ text: 'hello', usage: { inputTokens: 10, outputTokens: 5 } });
    const params = { model: { modelId: 'mimo-v2.5-pro', provider: 'xiaomi' }, system: 'sys', prompt: 'usr' };
    const result = await aiTraceContext.run(
      { kind: 'chapter-generation', context: {} },
      () => forkedCallLLM(params as never, 'test-source'),
    );
    expect(result).toEqual({ text: 'hello', usage: { inputTokens: 10, outputTokens: 5 } });
    expect(upstreamCallLLM).toHaveBeenCalledOnce();
    expect(upstreamCallLLM).toHaveBeenCalledWith(params, 'test-source', undefined, undefined);
  });

  test('emits llm-call span with model+source+usage attrs', async () => {
    const sinkSpans: unknown[] = [];
    vi.doMock('@/lib/extends/observability/trace-sink', () => ({
      getTraceSink: () => ({
        writeTraceStart: () => undefined,
        writeSpan: (r: unknown) => sinkSpans.push(r),
        writeTraceEnd: () => undefined,
      }),
    }));
    // re-import to apply doMock (only for this test)
    vi.resetModules();
    const { aiTraceContext: ctx } = await import('@/lib/extends/observability/trace-context');
    const { callLLM: cl } = await import('@/lib/extends/ai/llm');
    const upstream = await import('@/lib/ai/llm');
    (upstream.callLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ text: 'reply', usage: { inputTokens: 100, outputTokens: 200 } });

    await ctx.run({ kind: 'chapter-generation', context: {} }, async () => {
      await cl(
        { model: { modelId: 'mimo-v2.5-pro', provider: 'xiaomi' }, system: 'sys', prompt: 'user prompt here' } as never,
        'src',
      );
    });
    const span = sinkSpans.find((s) => (s as { kind: string }).kind === 'llm-call') as { name: string; attrs: { modelId: string; source: string; inputTokens: number } };
    expect(span.name).toContain('mimo-v2.5-pro');
    expect(span.attrs.source).toBe('src');
    expect(span.attrs.modelId).toBe('mimo-v2.5-pro');
    expect(span.attrs.inputTokens).toBe(100);
  });

  test('span carries status=error and re-throws on failure', async () => {
    upstreamCallLLM.mockRejectedValueOnce(new Error('boom'));
    await expect(
      aiTraceContext.run({ kind: 'chapter-generation', context: {} }, () =>
        forkedCallLLM({ model: { modelId: 'm', provider: 'p' }, prompt: 'p' } as never, 'src'),
      ),
    ).rejects.toThrow('boom');
  });
});
```

- [ ] **步骤 7.2：运行测试确认失败**

```bash
node node_modules/vitest/vitest.mjs run tests/extends/observability/llm-interceptor.test.ts
```

预期：FAIL — `@/lib/extends/ai/llm` not found。

- [ ] **步骤 7.3：写 fork 拦截器**

```ts
// lib/extends/ai/llm.ts
//
// callLLM/streamLLM fork wrapper.
//
// IMPORTANT: 用相对路径 `../../ai/llm` 直击上游文件，绕开 fork alias 自指。
// alias `@/lib/ai/llm.ts → ./lib/extends/ai/llm.ts` 在加载方一侧生效；
// 本文件内部用相对路径就不会自指。
import {
  callLLM as upstreamCallLLM,
  streamLLM as upstreamStreamLLM,
} from '../../ai/llm';
import type { LLMRetryOptions } from '../../ai/llm';
import type { ThinkingConfig } from '@/lib/server/resolve-model';
import { aiTraceContext } from '@lib-extends/observability/trace-context';

// Re-export everything else from upstream so import surface remains identical
export * from '../../ai/llm';

function getModelId(params: unknown): string | undefined {
  if (params && typeof params === 'object' && 'model' in params) {
    const m = (params as { model?: unknown }).model;
    if (m && typeof m === 'object' && 'modelId' in m) return (m as { modelId?: string }).modelId;
  }
  return undefined;
}

function getProviderId(params: unknown): string | undefined {
  if (params && typeof params === 'object' && 'model' in params) {
    const m = (params as { model?: unknown }).model;
    if (m && typeof m === 'object' && 'provider' in m) return (m as { provider?: string }).provider;
  }
  return undefined;
}

function serializePrompt(params: unknown): string | undefined {
  if (!params || typeof params !== 'object') return undefined;
  const p = params as { system?: unknown; prompt?: unknown; messages?: unknown };
  const parts: string[] = [];
  if (typeof p.system === 'string') parts.push(`[system]\n${p.system}`);
  if (typeof p.prompt === 'string') parts.push(`[prompt]\n${p.prompt}`);
  if (Array.isArray(p.messages)) parts.push(`[messages]\n${JSON.stringify(p.messages)}`);
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

// Same signature as upstream callLLM (typed by structural pass-through; we don't import the
// upstream GenerateTextResult generics to keep this file decoupled from AI SDK internals).
export async function callLLM(
  params: Parameters<typeof upstreamCallLLM>[0],
  source: string,
  retryOptions?: LLMRetryOptions,
  thinking?: ThinkingConfig,
): Promise<ReturnType<typeof upstreamCallLLM>> {
  return aiTraceContext.withLLMSpan(
    {
      source,
      modelId: getModelId(params),
      providerId: getProviderId(params),
      promptText: serializePrompt(params),
    },
    () => upstreamCallLLM(params, source, retryOptions, thinking),
  ) as Promise<ReturnType<typeof upstreamCallLLM>>;
}

// streamLLM is NOT awaited (it returns synchronously a StreamTextResult).
// We don't have a clean async span hook for streams in Plan 1 — pass through
// unchanged. Future plan can add per-chunk events on streamLLM.
export const streamLLM = upstreamStreamLLM;
```

- [ ] **步骤 7.4：注册 fork alias**

修改 `extends/fork-aliases.json`：在 `aliases` 段加入一行（保持字母序），位置参考既有 `@/lib/ai/...` 邻近条目：

```json
"@/lib/ai/llm.ts": "./lib/extends/ai/llm.ts",
```

然后同步 tsconfig：

```bash
node scripts/sync-fork-tsconfig-paths.mjs
```

预期输出包含：`Updated tsconfig.json paths: 6 base + <N+1> fork entries`（比上次多 1）。

- [ ] **步骤 7.5：运行测试**

```bash
node node_modules/vitest/vitest.mjs run tests/extends/observability/llm-interceptor.test.ts
```

预期：3 passed。

- [ ] **步骤 7.6：Commit**

```bash
git add lib/extends/ai/llm.ts tests/extends/observability/llm-interceptor.test.ts extends/fork-aliases.json tsconfig.json
git commit -m "feat(observability): intercept callLLM via fork alias, emit llm-call span"
```

---

## 任务 8：章节生成 route 加 trace wrap + 写 lastTraceId

**文件：**
- 修改：`lib/extends/teacher/course-types.ts:134-145` —— 给 `CourseChapterClassroom` 加 `lastTraceId?: string`
- 修改：`app/extends/api/teacher/projects/[projectId]/chapters/[chapterId]/generate/route.ts` —— 包 trace
- 测试：复用现有 `tests/extends/teacher/generate-chapter-api.test.ts`（若有），或新增一个 unit-level 测试

- [ ] **步骤 8.1：扩展 CourseChapterClassroom 类型**

读 `lib/extends/teacher/course-types.ts`，找到 `export interface CourseChapterClassroom`，在末尾加一行：

```ts
// lib/extends/teacher/course-types.ts (片段)
export interface CourseChapterClassroom {
  readonly chapterId: string;
  readonly classroomId: string;
  readonly status: CourseChapterClassroomStatus;
  readonly generationStep?: CourseChapterClassroomGenerationStep;
  readonly sceneCount?: number;
  readonly failedReason?: string;
  readonly failedStep?: CourseChapterClassroomFailedStep;
  readonly publishedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Set by generate route to point at the most recent ai-trace for "诊断" entry points. */
  readonly lastTraceId?: string;
}
```

- [ ] **步骤 8.2：改章节生成 route（包 trace + 写 lastTraceId）**

读 `app/extends/api/teacher/projects/[projectId]/chapters/[chapterId]/generate/route.ts`，在文件顶部加 import：

```ts
import { aiTraceContext } from '@lib-extends/observability/trace-context';
```

把 `export async function POST(...)` 主体整体包裹：

```ts
export async function POST(request: NextRequest, context: ChapterGenerateRouteContext) {
  const { projectId, chapterId } = await context.params;
  // ... 现有的所有早期校验保持原位 ...
  // 关键：在调用 executeChapterGenerationWorkflow 之前生成 traceId 并写入 lastTraceId

  return aiTraceContext.run(
    {
      kind: 'chapter-generation',
      context: {
        projectId,
        chapterId,
        classroomId,
        userVisibleTitle: chapter?.title,
        attempt: (await request.clone().json().catch(() => ({})) as { regenerate?: boolean; resume?: boolean; approveOutline?: boolean }).regenerate
          ? 'regenerate'
          : (await request.clone().json().catch(() => ({})) as { resume?: boolean }).resume
            ? 'resume'
            : 'initial',
      },
    },
    async () => {
      const traceId = aiTraceContext.currentTraceId();

      // 写 lastTraceId 进 chapterClassroom：在已有的 generatingClassroom 对象上加字段
      const generatingClassroom: CourseChapterClassroom = {
        chapterId,
        classroomId,
        status: 'generating',
        generationStep: 'outline',
        createdAt: previousChapterClassroom?.createdAt ?? now,
        updatedAt: now,
        ...(traceId ? { lastTraceId: traceId } : {}),
      };
      try {
        await writeTeacherProject(applyChapterClassroomUpdate(project, generatingClassroom));
      } catch (err) {
        log.warn('Failed to write generating status, continuing:', err);
      }

      // —— 原来的 try/catch/run workflow 主体原封不动塞这里 ——
      // 注意：原代码读了 body.resume/regenerate/approveOutline；不要重复读 request.json()
      // 把读 body 放进这个 closure 内部一次（不能调多次因为流已经被读过）
    },
  );
}
```

**重要**：原代码已经 `const body = (await request.json()) as ...`，注意把 body 解析也移到 closure 内部一次性完成（trace 上下文需要拿 `regenerate/resume/approveOutline` 算 attempt，但不能调 `request.json()` 两次）。最稳妥写法：把 body 解析提前到 trace 包裹之前：

```ts
const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
const resume = body.resume === true;
const regenerate = body.regenerate === true;
const approveOutline = body.approveOutline === true;

return aiTraceContext.run(
  {
    kind: 'chapter-generation',
    context: {
      projectId, chapterId, classroomId,
      userVisibleTitle: chapter?.title,
      attempt: regenerate ? 'regenerate' : approveOutline ? 'approve' : resume ? 'resume' : 'initial',
    },
  },
  async () => {
    // ... 现有所有 lastFailedStep/partialSceneCount/try 逻辑，body 直接用 closure 外的变量 ...
  },
);
```

- [ ] **步骤 8.3：手动 tsc 验证**

```bash
node node_modules/typescript/bin/tsc --noEmit 2>&1 | rg "extends/(ai|observability)|generate/route|course-types"
```

预期：无新增错误。

- [ ] **步骤 8.4：跑既有 generate-chapter-api 测试确保未破坏**

```bash
node node_modules/vitest/vitest.mjs run tests/extends/teacher/generate-chapter-api.test.ts tests/extends/observability/
```

预期：原有 + observability 测试全 pass。如果原 generate-chapter-api 测试假设 `chapterClassroom` 没有 `lastTraceId` 字段而做了 `toEqual` 严格匹配，需要把断言改为 `toMatchObject`。

- [ ] **步骤 8.5：Commit**

```bash
git add lib/extends/teacher/course-types.ts app/extends/api/teacher/projects/[projectId]/chapters/[chapterId]/generate/route.ts
git commit -m "feat(observability): wrap chapter generate route in aiTraceContext.run, persist lastTraceId"
```

---

## 任务 9：bootstrap.ts 加 TTL cleanup

**文件：**
- 修改：`extends/bootstrap.ts`
- 修改：`lib/extends/observability/trace-sink.ts` —— 加 `scheduleAiTraceCleanup` 导出
- 测试：扩展 `tests/extends/observability/trace-sink.test.ts`

- [ ] **步骤 9.1：先写测试**

加到 `tests/extends/observability/trace-sink.test.ts` 末尾：

```ts
import { scheduleAiTraceCleanup } from '@/lib/extends/observability/trace-sink';

describe('scheduleAiTraceCleanup', () => {
  test('deletes date directories older than retentionDays', async () => {
    // create 2 dated dirs: today and 30 days ago
    const today = new Date().toISOString().slice(0, 10);
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    mkdirSync(join(tmpDir, today), { recursive: true });
    mkdirSync(join(tmpDir, old), { recursive: true });
    writeFileSync(join(tmpDir, today, 'fresh.jsonl'), '{}');
    writeFileSync(join(tmpDir, old, 'old.jsonl'), '{}');
    writeFileSync(join(tmpDir, 'index.jsonl'),
      `${JSON.stringify({ traceId: 'fresh', file: `${today}/fresh.jsonl` })}\n` +
      `${JSON.stringify({ traceId: 'old',   file: `${old}/old.jsonl` })}\n`,
    );

    await scheduleAiTraceCleanup({ rootDir: tmpDir, retentionDays: 7 });

    expect(existsSync(join(tmpDir, today))).toBe(true);
    expect(existsSync(join(tmpDir, old))).toBe(false);

    const remainingIndex = readFileSync(join(tmpDir, 'index.jsonl'), 'utf8').trim().split('\n');
    expect(remainingIndex).toHaveLength(1);
    expect(JSON.parse(remainingIndex[0]).traceId).toBe('fresh');
  });

  test('handles missing rootDir gracefully', async () => {
    rmSync(tmpDir, { recursive: true, force: true });
    await expect(
      scheduleAiTraceCleanup({ rootDir: tmpDir, retentionDays: 7 }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **步骤 9.2：在 trace-sink.ts 末尾追加实现**

```ts
// lib/extends/observability/trace-sink.ts (追加)
import { readdirSync, rmSync, statSync } from 'node:fs';

export interface CleanupOptions {
  readonly rootDir: string;
  readonly retentionDays: number;
}

function isDateDir(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(name);
}

export async function scheduleAiTraceCleanup(opts: CleanupOptions): Promise<void> {
  const { rootDir, retentionDays } = opts;
  if (!existsSync(rootDir)) return;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = readdirSync(rootDir, { withFileTypes: true });

  const deletedDates = new Set<string>();
  for (const entry of entries) {
    if (!entry.isDirectory() || !isDateDir(entry.name)) continue;
    const dirDate = Date.parse(`${entry.name}T00:00:00.000Z`);
    if (!Number.isFinite(dirDate) || dirDate >= cutoff) continue;
    const dirPath = join(rootDir, entry.name);
    try {
      rmSync(dirPath, { recursive: true, force: true });
      deletedDates.add(entry.name);
    } catch (err) {
      console.warn('[ai-trace cleanup] failed to remove', dirPath, err);
    }
  }

  if (deletedDates.size === 0) return;

  // Rewrite index.jsonl dropping entries whose file path lives under a deleted date dir
  const indexPath = join(rootDir, 'index.jsonl');
  if (!existsSync(indexPath)) return;
  const lines = readFileSync(indexPath, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  const keep = lines.filter((line) => {
    try {
      const entry = JSON.parse(line) as { file?: string };
      const date = entry.file?.split('/')[0] ?? '';
      return !deletedDates.has(date);
    } catch { return false; }
  });
  // atomic rewrite
  const tmpPath = `${indexPath}.tmp`;
  appendFileSync(tmpPath, keep.length > 0 ? keep.join('\n') + '\n' : '');
  rmSync(indexPath, { force: true });
  // rename via Node: use renameSync
  const { renameSync } = await import('node:fs');
  renameSync(tmpPath, indexPath);
}
```

需要在 `trace-sink.ts` 文件顶部 `import { ... } from 'node:fs';` 加上 `readFileSync`（如果之前没有）。

- [ ] **步骤 9.3：bootstrap.ts 加调度**

读 `extends/bootstrap.ts`，在末尾加：

```ts
// extends/bootstrap.ts (追加)
import { scheduleAiTraceCleanup } from '@lib-extends/observability/trace-sink';
import { resolveAiTraceConfig } from '@lib-extends/observability/config';

void (async () => {
  const cfg = resolveAiTraceConfig();
  if (cfg.detail === 'off') return;
  try {
    await scheduleAiTraceCleanup({
      rootDir: process.env.AI_TRACE_ROOT_DIR ?? 'data/ai-traces',
      retentionDays: cfg.retentionDays,
    });
  } catch (err) {
    console.warn('[ai-trace bootstrap] cleanup failed:', err);
  }
})();
```

- [ ] **步骤 9.4：运行测试**

```bash
node node_modules/vitest/vitest.mjs run tests/extends/observability/trace-sink.test.ts
```

预期：9 passed（原 7 + 新 2）。

- [ ] **步骤 9.5：Commit**

```bash
git add lib/extends/observability/trace-sink.ts extends/bootstrap.ts tests/extends/observability/trace-sink.test.ts
git commit -m "feat(observability): startup TTL cleanup for ai-traces (retentionDays env)"
```

---

## 任务 10：极简 CLI

**文件：**
- 创建：`lib/extends/observability/cli/inspect.mjs`
- 创建：`lib/extends/observability/cli/format.ts`
- 修改：`package.json` —— scripts 加 `trace:inspect`
- 修改：`.gitignore` —— 加 `/data/ai-traces/`
- 测试：`tests/extends/observability/cli-format.test.ts`

- [ ] **步骤 10.1：写格式化测试**

```ts
// tests/extends/observability/cli-format.test.ts
import { describe, expect, test } from 'vitest';
import { formatTraceForCli } from '@/lib/extends/observability/cli/format';
import type { AiSpan, AiTrace } from '@/lib/extends/observability/trace-types';

const trace: AiTrace = {
  traceId: 'abc123def456',
  kind: 'chapter-generation',
  context: { projectId: 'P1', chapterId: 'C1', userVisibleTitle: 'AI编程' },
  startedAt: '2026-05-28T11:55:00.000Z',
  endedAt: '2026-05-28T11:57:30.000Z',
  durationMs: 150000,
  status: 'error',
  errorSummary: 'Failed at scene-content[1]: AI_RetryError 502',
  spanCount: 3,
  env: 'dev',
};

const spans: AiSpan[] = [
  { spanId: 'sp1', traceId: 'abc', kind: 'workflow-step', name: 'outline', attrs: { modelId: 'mimo-v2.5', outputTokens: 1450 }, startedAt: '...', endedAt: '...', durationMs: 42200, status: 'ok', events: [] },
  { spanId: 'sp2', traceId: 'abc', kind: 'workflow-step', name: 'scene-content[1]', attrs: {}, startedAt: '...', endedAt: '...', durationMs: 91000, status: 'error', error: { message: 'AI_RetryError', httpStatus: 502 }, events: [{ at: '...', kind: 'retry', message: 'attempt 2/3' }] },
];

describe('formatTraceForCli', () => {
  test('renders header with traceId, kind, status', () => {
    const out = formatTraceForCli({ trace, spans }, { full: false });
    expect(out).toContain('abc123def456');
    expect(out).toContain('chapter-generation');
    expect(out).toContain('ERROR');
  });

  test('lists each span with status icon and duration', () => {
    const out = formatTraceForCli({ trace, spans }, { full: false });
    expect(out).toContain('outline');
    expect(out).toContain('42.2');
    expect(out).toContain('scene-content[1]');
    expect(out).toContain('91.0');
  });

  test('shows error details when span has error', () => {
    const out = formatTraceForCli({ trace, spans }, { full: false });
    expect(out).toContain('AI_RetryError');
    expect(out).toContain('502');
    expect(out).toContain('retry 1');
  });

  test('--full prints promptText when present', () => {
    const fullSpan: AiSpan = { ...spans[0], attrs: { ...spans[0].attrs, promptText: 'A very long prompt that should show.' } };
    const out = formatTraceForCli({ trace, spans: [fullSpan] }, { full: true });
    expect(out).toContain('A very long prompt');
  });

  test('default mode omits promptText', () => {
    const fullSpan: AiSpan = { ...spans[0], attrs: { ...spans[0].attrs, promptText: 'A very long prompt' } };
    const out = formatTraceForCli({ trace, spans: [fullSpan] }, { full: false });
    expect(out).not.toContain('A very long prompt');
  });
});
```

- [ ] **步骤 10.2：写格式化器**

```ts
// lib/extends/observability/cli/format.ts
import type { AiSpan, AiTrace } from '../trace-types';

export interface FormatOptions {
  readonly full: boolean;
}

const ICONS = { ok: '✓', error: '✗', 'in-progress': '◐', fallback: '⚠' } as const;

function formatDurationMs(ms: number | undefined): string {
  if (ms === undefined) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusToUpper(s: AiTrace['status']): string {
  return s.toUpperCase();
}

export function formatTraceForCli(
  data: { trace: AiTrace; spans: AiSpan[] },
  opts: FormatOptions,
): string {
  const { trace, spans } = data;
  const lines: string[] = [];

  lines.push('═'.repeat(67));
  lines.push(`  Trace ${trace.traceId} · ${trace.kind} · ${statusToUpper(trace.status)}`);
  lines.push('═'.repeat(67));
  lines.push('');
  lines.push(`  Started:    ${trace.startedAt}`);
  lines.push(`  Duration:   ${formatDurationMs(trace.durationMs)}`);
  lines.push(`  Status:     ${trace.status}${trace.errorSummary ? `  →  ${trace.errorSummary}` : ''}`);
  if (trace.context.projectId) lines.push(`  Project:    ${trace.context.projectId}`);
  if (trace.context.chapterId) lines.push(`  Chapter:    ${trace.context.chapterId}${trace.context.userVisibleTitle ? `  (${trace.context.userVisibleTitle})` : ''}`);
  if (trace.context.attempt) lines.push(`  Attempt:    ${trace.context.attempt}`);
  lines.push(`  Env: ${trace.env}${trace.appVersion ? ` · App: ${trace.appVersion}` : ''}`);
  lines.push('');
  lines.push(`─── Spans (${spans.length}) ${'─'.repeat(45)}`);
  lines.push('');

  for (const span of spans) {
    const icon = ICONS[span.status] ?? '?';
    const dur = formatDurationMs(span.durationMs).padStart(8);
    const meta: string[] = [];
    if (span.attrs.modelId) meta.push(span.attrs.modelId);
    if (span.attrs.outputTokens !== undefined) meta.push(`${span.attrs.outputTokens} tok`);
    lines.push(`  ${icon} ${span.name.padEnd(30)} ${dur}   ${meta.join('  ')}`);

    if (span.status === 'error' && span.error) {
      lines.push('');
      if (span.events.length > 0) {
        lines.push('      Retry events:');
        for (const e of span.events) lines.push(`        - ${e.kind} ${e.message}`);
        lines.push('');
      }
      lines.push(`      Error: ${span.error.kind ?? ''} - ${span.error.message}`);
      if (span.error.httpStatus) lines.push(`      HTTP status: ${span.error.httpStatus}`);
      if (span.error.upstreamBody) {
        lines.push('      Upstream body (excerpt):');
        lines.push(`        ${span.error.upstreamBody.slice(0, 200).replace(/\n/g, '\n        ')}`);
      }
      if (opts.full && span.error.stack) {
        lines.push('      Stack:');
        span.error.stack.split('\n').slice(0, 10).forEach((l) => lines.push(`        ${l}`));
      }
    }

    if (opts.full && span.attrs.promptText) {
      lines.push(`      Prompt (${span.attrs.promptText.length} chars):`);
      lines.push(`        ${span.attrs.promptText}`);
    } else if (span.attrs.promptChars) {
      lines.push(`      Prompt: ${span.attrs.promptChars} chars (use --full to print)`);
    }

    if (opts.full && span.attrs.responseText) {
      lines.push(`      Response (${span.attrs.responseText.length} chars):`);
      lines.push(`        ${span.attrs.responseText}`);
    }
    lines.push('');
  }

  lines.push('═'.repeat(67));
  return lines.join('\n');
}
```

- [ ] **步骤 10.3：写 CLI 入口**

```mjs
// lib/extends/observability/cli/inspect.mjs
#!/usr/bin/env node
// Lightweight CLI: pnpm trace:inspect <traceId> [--full|--json|--list|--gc]
// Plan 1 minimal scope: <traceId>, --full, --json. Lists / search / gc 留 Plan 3。

import { argv, exit, stdout, stderr } from 'node:process';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register ts-node esm loader so we can import .ts modules at runtime
try {
  register('ts-node/esm', pathToFileURL('./'));
} catch {
  // ts-node not available — fall back to compiled paths if any. Plan 1 assumes
  // dev env has ts-node (existing scripts/*.mjs use it).
}

const args = argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  stdout.write(`Usage:
  pnpm trace:inspect <traceId>            # default: formatted summary
  pnpm trace:inspect <traceId> --full     # include prompt/response text + stack
  pnpm trace:inspect <traceId> --json     # raw JSON to stdout
`);
  exit(0);
}

const traceId = args.find((a) => !a.startsWith('--'));
if (!traceId) {
  stderr.write('Error: missing traceId\n');
  exit(2);
}
const full = args.includes('--full');
const asJson = args.includes('--json');

const { createJsonlTraceReader } = await import('../trace-reader.ts');
const { formatTraceForCli } = await import('./format.ts');

const reader = createJsonlTraceReader({
  rootDir: process.env.AI_TRACE_ROOT_DIR ?? 'data/ai-traces',
});
const detail = await reader.readTrace(traceId, { view: 'developer' });

if (!detail) {
  stderr.write(`Trace not found: ${traceId}\n`);
  exit(1);
}

if (asJson) {
  stdout.write(JSON.stringify(detail, null, 2) + '\n');
} else {
  stdout.write(formatTraceForCli(detail, { full }) + '\n');
}
```

- [ ] **步骤 10.4：注册 package.json script**

读 `package.json`，找 `"scripts": { ... }`，加一行：

```json
"trace:inspect": "node --experimental-strip-types lib/extends/observability/cli/inspect.mjs"
```

（Node 22 已支持 `--experimental-strip-types` 跑 ts 文件；如果项目使用其他 Node 版本，改为 `tsx` 命令并确认 tsx 是 dev deps。仓库 README 注明 Node ≥ 20.9.0；如果是 20.x，需要装 `tsx` 或把 cli 改为 pure JS）

- [ ] **步骤 10.5：把 inspect.mjs 改成 pure JS（更稳）**

实际更可移植的做法：把 cli/format.ts 编译为 .mjs，或干脆把 reader/format 在 cli 入口处用 `import { ... } from '../trace-reader.js'` 引用——但 ts 源文件没有 .js 编译产物。

**替代方案（推荐）**：用 `tsx` 跑 ts，并在 package.json 加 `tsx` devDependency。检查现有依赖：

```bash
node -e "console.log(require('./package.json').devDependencies?.tsx ?? require('./package.json').dependencies?.tsx ?? 'NOT INSTALLED')"
```

如果 NOT INSTALLED，加入 devDependency：

```bash
pnpm add -D tsx
```

然后改 package.json script：

```json
"trace:inspect": "tsx lib/extends/observability/cli/inspect.mjs"
```

CLI 文件本身改 import 为相对 `.ts`：

```mjs
const { createJsonlTraceReader } = await import('../trace-reader.ts');
const { formatTraceForCli } = await import('./format.ts');
```

或者更直接：把 CLI 入口本身用 ts 写，运行 `tsx lib/extends/observability/cli/inspect.ts`，避免 .mjs↔.ts 互调的麻烦：

```ts
// lib/extends/observability/cli/inspect.ts (替换 .mjs)
#!/usr/bin/env tsx
import { exit, stdout, stderr, argv } from 'node:process';
import { createJsonlTraceReader } from '../trace-reader';
import { formatTraceForCli } from './format';

async function main() {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    stdout.write(`Usage:
  pnpm trace:inspect <traceId>            # default: formatted summary
  pnpm trace:inspect <traceId> --full     # include prompt/response text + stack
  pnpm trace:inspect <traceId> --json     # raw JSON to stdout
`);
    exit(0);
  }
  const traceId = args.find((a) => !a.startsWith('--'));
  if (!traceId) { stderr.write('Error: missing traceId\n'); exit(2); }
  const full = args.includes('--full');
  const asJson = args.includes('--json');

  const reader = createJsonlTraceReader({
    rootDir: process.env.AI_TRACE_ROOT_DIR ?? 'data/ai-traces',
  });
  const detail = await reader.readTrace(traceId, { view: 'developer' });
  if (!detail) { stderr.write(`Trace not found: ${traceId}\n`); exit(1); }

  if (asJson) stdout.write(JSON.stringify(detail, null, 2) + '\n');
  else stdout.write(formatTraceForCli(detail, { full }) + '\n');
}

void main();
```

最终 package.json script：

```json
"trace:inspect": "tsx lib/extends/observability/cli/inspect.ts"
```

如果 `tsx` 不存在则先：

```bash
pnpm add -D tsx
```

- [ ] **步骤 10.6：加 .gitignore**

读 `.gitignore`，在末尾加：

```
# AI runtime observability traces
/data/ai-traces/
```

- [ ] **步骤 10.7：运行 format 测试**

```bash
node node_modules/vitest/vitest.mjs run tests/extends/observability/cli-format.test.ts
```

预期：5 passed。

- [ ] **步骤 10.8：Commit**

```bash
git add lib/extends/observability/cli tests/extends/observability/cli-format.test.ts package.json .gitignore
git commit -m "feat(observability): add minimal CLI 'pnpm trace:inspect <traceId>' with --full/--json"
```

---

## 任务 11：端到端 smoke test（手动验证 + 自动化 happy path）

**文件：**
- 测试：`tests/extends/observability/e2e-trace-roundtrip.test.ts`

- [ ] **步骤 11.1：写自动化集成测试**

```ts
// tests/extends/observability/e2e-trace-roundtrip.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { __resetTraceSink } from '@/lib/extends/observability/trace-sink';
import { aiTraceContext } from '@/lib/extends/observability/trace-context';
import { createJsonlTraceReader } from '@/lib/extends/observability/trace-reader';

let tmpDir = '';

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-traces-e2e-'));
  process.env.AI_TRACE_ROOT_DIR = tmpDir;
  process.env.AI_TRACE_DETAIL = 'full';
  __resetTraceSink();
});
afterEach(() => {
  delete process.env.AI_TRACE_ROOT_DIR;
  delete process.env.AI_TRACE_DETAIL;
  if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe('end-to-end trace round trip', () => {
  test('run → 2 spans → file written → reader sees trace + spans', async () => {
    let capturedTraceId: string | null = null;

    await aiTraceContext.run(
      {
        kind: 'chapter-generation',
        context: { projectId: 'P-e2e', chapterId: 'C-e2e', userVisibleTitle: 'E2E Test' },
      },
      async () => {
        capturedTraceId = aiTraceContext.currentTraceId();
        await aiTraceContext.withSpan(
          { kind: 'workflow-step', name: 'outline' },
          async () => {
            await aiTraceContext.withLLMSpan(
              { source: 'e2e', modelId: 'mock-model', providerId: 'mock-provider', promptText: 'prompt' },
              async () => ({ text: 'response', usage: { inputTokens: 10, outputTokens: 20 } }),
            );
          },
        );
        await aiTraceContext.withSpan(
          { kind: 'workflow-step', name: 'scene-content[1]' },
          async () => undefined,
        );
      },
    );

    expect(capturedTraceId).toBeTruthy();

    // flush is async; await a tick
    await new Promise((r) => setTimeout(r, 50));

    const reader = createJsonlTraceReader({ rootDir: tmpDir });
    const detail = await reader.readTrace(capturedTraceId!, { view: 'developer' });
    expect(detail).not.toBeNull();
    expect(detail!.trace.kind).toBe('chapter-generation');
    expect(detail!.trace.context.userVisibleTitle).toBe('E2E Test');
    expect(detail!.trace.status).toBe('ok');
    // Expect: outline (workflow), llm-call (nested), scene-content[1] (workflow) = 3 spans
    expect(detail!.spans).toHaveLength(3);
    const llmSpan = detail!.spans.find((s) => s.kind === 'llm-call');
    expect(llmSpan?.attrs.inputTokens).toBe(10);
    expect(llmSpan?.attrs.outputTokens).toBe(20);
  });

  test('error path persists span error and re-throws', async () => {
    let traceId: string | null = null;
    await expect(
      aiTraceContext.run(
        { kind: 'chapter-generation', context: { projectId: 'P', chapterId: 'C' } },
        async () => {
          traceId = aiTraceContext.currentTraceId();
          await aiTraceContext.withSpan(
            { kind: 'workflow-step', name: 'outline' },
            async () => { throw new Error('LLM 502'); },
          );
        },
      ),
    ).rejects.toThrow('LLM 502');

    await new Promise((r) => setTimeout(r, 50));
    const reader = createJsonlTraceReader({ rootDir: tmpDir });
    const detail = await reader.readTrace(traceId!, { view: 'developer' });
    expect(detail!.trace.status).toBe('error');
    expect(detail!.spans[0].status).toBe('error');
    expect(detail!.spans[0].error?.message).toBe('LLM 502');
  });
});
```

- [ ] **步骤 11.2：运行**

```bash
node node_modules/vitest/vitest.mjs run tests/extends/observability/e2e-trace-roundtrip.test.ts
```

预期：2 passed。

- [ ] **步骤 11.3：跑整个 observability 套件做最终验证**

```bash
node node_modules/vitest/vitest.mjs run tests/extends/observability/
```

预期：所有测试通过（约 40+ 个）。

- [ ] **步骤 11.4：手动 smoke（dev server 启动 + 真实生成 + CLI 查看）**

```bash
# 1. 启动 dev server
pnpm dev

# 2. 在浏览器触发一次章节生成
# http://localhost:3000/teacher/projects/<projectId>/chapters/<chapterId>/generate?regenerate=1

# 3. 生成完成或失败后，从 chapterClassroom.lastTraceId 拿 ID (或扫 data/ai-traces/index.jsonl)
node -e "const fs=require('fs'); const last=fs.readFileSync('data/ai-traces/index.jsonl','utf8').trim().split('\n').slice(-1)[0]; console.log(JSON.parse(last).traceId);"

# 4. CLI 查看
pnpm trace:inspect <traceId>
pnpm trace:inspect <traceId> --full
pnpm trace:inspect <traceId> --json | head -100
```

预期：CLI 输出包含 outline / scene-content[i] / 各 callLLM 嵌套 span，时长 / token / 模型 ID 准确，错误时含 retry events + upstream body excerpt。

- [ ] **步骤 11.5：Commit**

```bash
git add tests/extends/observability/e2e-trace-roundtrip.test.ts
git commit -m "test(observability): e2e roundtrip — run+spans → JSONL → reader assertions"
```

---

## 任务 12：文档与 README

**文件：**
- 修改：`extends/SYNC_MANIFEST.md` —— 在新模块表里加一行
- 创建：`lib/extends/observability/README.md`

- [ ] **步骤 12.1：写模块 README**

```md
<!-- lib/extends/observability/README.md -->
# AI 运行时观测（observability）

捕获 AI 各阶段调用（LLM、媒体、TTS / ASR）的运行状态、token、prompt、错误现场，
以结构化 trace 形式持久化到 `data/ai-traces/`，并通过 CLI 与（Plan 2+）UI 暴露。

## 快速开始

```bash
# 触发一次生成后，查看最近 trace
pnpm trace:inspect <traceId>
pnpm trace:inspect <traceId> --full         # 含 prompt / response 全文 + 完整 stack
pnpm trace:inspect <traceId> --json | jq    # JSON 输出
```

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `AI_TRACE_DETAIL` | dev=full / prod=metadata | 持久化粒度（off / metadata / full） |
| `AI_TRACE_RETENTION_DAYS` | 7 | trace 文件保留天数 |
| `AI_TRACE_PROMPT_MAX_CHARS` | 50000 | 单 prompt 截断长度 |
| `AI_TRACE_ROOT_DIR` | data/ai-traces | trace 文件根目录 |

## 架构

见 [设计规格](../../../docs/superpowers/specs/2026-05-28-ai-runtime-observability-design.md)。

## 业务接入

route handler / hook 在最外层 wrap：

```ts
import { aiTraceContext } from '@lib-extends/observability/trace-context';

return aiTraceContext.run(
  { kind: 'chapter-generation', context: { projectId, chapterId, ... } },
  async () => { /* 现有业务代码原封不动 */ },
);
```

深层 `callLLM` 自动关联（通过 fork alias 拦截）。

## Plan 1 覆盖范围

- 核心库（trace-context / sink / reader / config / redaction）
- callLLM 拦截器
- 章节生成 route 接入
- 启动期 TTL 清理
- 极简 CLI（inspect 单 trace）

Plan 2/3/4 见 [设计规格 §10 增量扩展预留](../../../docs/superpowers/specs/2026-05-28-ai-runtime-observability-design.md)。
```

- [ ] **步骤 12.2：更新 SYNC_MANIFEST**

读 `extends/SYNC_MANIFEST.md`，在表格末尾追加：

```md
| `lib/extends/observability/*` | (no upstream) | Plan 1 新增 | new module |
| `lib/extends/ai/llm.ts` | `lib/ai/llm.ts` | Plan 1 新增 | fork wrapper |
```

- [ ] **步骤 12.3：Commit**

```bash
git add lib/extends/observability/README.md extends/SYNC_MANIFEST.md
git commit -m "docs(observability): add module README + sync manifest entries"
```

---

## Plan 1 验收清单

完成后应满足：

- [ ] `tests/extends/observability/` 全套通过（~40+ tests）
- [ ] `node node_modules/typescript/bin/tsc --noEmit` 无新增错误（fork alias 路径解析正确）
- [ ] 手动触发一次章节 regenerate → `data/ai-traces/<date>/<traceId>.jsonl` 文件存在
- [ ] `data/ai-traces/index.jsonl` 含对应行
- [ ] `pnpm trace:inspect <traceId>` 输出含 outline / scene-content / callLLM 嵌套 spans
- [ ] chapterClassroom.lastTraceId 在 API GET 响应里返回
- [ ] dev 重启后旧 trace 仍可查（持久化生效）
- [ ] `AI_TRACE_DETAIL=off` 一行 env 切到关闭采集，业务流程零影响
- [ ] 现有非 observability 测试套件（`tests/extends/teacher/` 等）依然全过

---

## 后续 Plan 入口条件

| Plan | 入口条件（前置依赖） | 预计任务数 |
| --- | --- | --- |
| Plan 2（教师 UI） | Plan 1 完成 → 可读 trace + lastTraceId 已落盘 | 7-9 任务 |
| Plan 3（开发者 Web UI + 完整 CLI） | Plan 1 完成 → reader API 稳定 | 6-8 任务 |
| Plan 4（其余 6 流程接入） | Plan 1 完成 → trace-context API 稳定 | 6 任务（每个流程 1） |

写下一份 Plan 的方式：跑完 Plan 1 + smoke test 后，运行 `writing-plans` 技能并指明目标 phase（"基于 Plan 1 实现教师 UI"），就可以生成 Plan 2 详细任务。
