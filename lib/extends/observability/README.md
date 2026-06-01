# AI 运行时观测（observability）

捕获 AI 各阶段调用（LLM、媒体、TTS / ASR）的运行状态、token、prompt、错误现场，
以结构化 trace 形式持久化到 `data/ai-traces/`，并通过 CLI（Plan 1）与 UI（Plan 2/3）暴露。

## 快速开始

```bash
# 触发一次章节生成后，查看最近 trace
pnpm trace:inspect <traceId>
pnpm trace:inspect <traceId> --full         # 含 prompt / response 全文 + 完整 stack
pnpm trace:inspect <traceId> --json | jq    # JSON 输出
```

最近 traceId 也写入 chapterClassroom.lastTraceId（出现在 chapter API 响应里）；
或扫 `data/ai-traces/index.jsonl` 末尾。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `AI_TRACE_DETAIL` | dev=full / prod=metadata | 持久化粒度（off / metadata / full） |
| `AI_TRACE_RETENTION_DAYS` | 7 | trace 文件保留天数（启动期 TTL 清理） |
| `AI_TRACE_PROMPT_MAX_CHARS` | 50000 | 单 prompt 截断长度（防膨胀） |
| `AI_TRACE_ROOT_DIR` | data/ai-traces | trace 文件根目录 |

## 架构

见设计规格：[docs/superpowers/specs/2026-05-28-ai-runtime-observability-design.md](../../../docs/superpowers/specs/2026-05-28-ai-runtime-observability-design.md)

核心组件：

- `trace-context.ts` — AsyncLocalStorage + `aiTraceContext.run / withSpan / withLLMSpan`
- `trace-sink.ts` — JSONL 持久化（按 trace 单文件 + index.jsonl 索引）
- `trace-reader.ts` — 列表 + 详情查询（教师/开发者双视图）
- `redaction.ts` — 教师视图脱敏（promptText 前 200 / stack 删除 / httpBody 屏蔽）
- `config.ts` — env 解析
- `cli/` — `pnpm trace:inspect` 命令

callLLM 拦截通过 fork alias 实现：`@/lib/ai/llm` → `lib/extends/ai/llm.ts`，
所有 LLM 调用自动包 `llm-call` span。

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

- 核心库（trace-context / sink / reader / config / redaction / 类型）
- callLLM 拦截器（fork alias 自指破解）
- 章节生成 route 接入
- 启动期 TTL 清理（`instrumentation.ts` → `server-bootstrap.ts`，仅 Node 运行时）
- 极简 CLI（inspect 单 trace）
- 端到端集成测试

## Plan 2（教师 UI）

- `trace-detail-store.ts` — 全局 `openTrace(traceId, source)`
- `GET /api/extends/ai-traces` — 列表（按 projectId 等筛选）
- `GET /api/extends/ai-traces/[traceId]?view=teacher` — 详情（脱敏）
- `TraceDetailDialog` + `GlobalTraceDetailDialog`（挂在 fork `components/extends/header.tsx`）
- 入口：章节失败卡、失败摘要弹窗、生成进度页、设计工作台「AI 运行记录」Drawer
- `chapterClassroom.lastTraceId` → `ChapterClassroomUiState.lastTraceId`（fork alias `chapter-classroom-ui`）

scene-redesign toast 诊断入口待生成 API 回写 `x-ai-trace-id` 后启用。

## Plan 3（开发者 UI + CLI）

**访问控制：** `AI_TRACE_DEV_UI=1|0`；未设置时 dev 环境启用、production 禁用。教师脱敏视图不受此开关影响。

**Web UI（rewrite `/dev/ai-traces` → `/extends/dev/ai-traces`）：**

- 列表：过滤 kind / status / since / search / projectId，分页
- 详情：`?view=developer` 全文 prompt/stack；「Download raw JSONL」→ `GET .../raw`

**CLI：**

```bash
pnpm trace:inspect --list [--kind=...] [--status=error] [--since=1h] [--limit=50]
pnpm trace:inspect --search "AI_RetryError"
pnpm trace:inspect --gc
```

## Plan 4（其余流程 trace 接入）

| kind | 入口 |
| --- | --- |
| `chapter-media-generation` | `generate-chapter` 媒体段 + `lib/extends/server/classroom-media-generation.ts` |
| `scene-redesign` | 客户端 `x-ai-trace-*` headers → `scene-content` / `scene-actions` |
| `preview-outline-stream` | `scene-outlines-stream` route |
| `preview-scene-content` / `preview-scene-actions` | fork route wrappers |
| `pbl-generation` | `lib/extends/pbl/generate-pbl.ts` |
| `tts` / `asr` | fork TTS + transcription routes |
| `knowledge-base-ai-plan` | `knowledge-base/ai/plan` route |

共享工具：`lib/extends/observability/trace-route.ts`（header 解析 + route 包装）。
