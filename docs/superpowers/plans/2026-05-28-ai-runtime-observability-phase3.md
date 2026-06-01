# AI Runtime Observability — Plan 3（开发者 Web UI + 完整 CLI）

**分支：** `feat/ai-runtime-observability`  
**前置：** Plan 1 + Plan 2 完成

## 任务清单

| # | 内容 | 关键文件 |
| --- | --- | --- |
| 1 | `access-control.ts` + API gate | `lib/extends/observability/access-control.ts`, `api-guard.ts` |
| 2 | Detail API `view=developer` + raw JSONL | `[traceId]/route.ts`, `[traceId]/raw/route.ts` |
| 3 | List API `search` / `since` | `ai-traces/route.ts` |
| 4 | CLI `--list` / `--search` / `--gc` | `cli/inspect.ts`, `cli/format.ts` |
| 5 | `/dev/ai-traces` 列表页 | `app/extends/dev/ai-traces/*` |
| 6 | `/dev/ai-traces/[traceId]` 详情页 | 同上 + `developer-span-detail.tsx` |
| 7 | rewrites + 教师入口链接 | `fork-aliases.json`, `project-trace-list-pane.tsx` |
| 8 | 测试 + README | `tests/extends/observability/*` |
