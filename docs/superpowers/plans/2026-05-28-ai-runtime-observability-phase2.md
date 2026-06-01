# AI 运行时观测系统 · Plan 2（教师 UI）

## 1. 范围

教师视角的诊断闭环：从「章节失败」到「打开统一详情弹窗」到「看清 AI 各阶段实际执行」。

**含**

- Zustand 全局弹窗 store + GlobalTraceDetailDialog mount 在 layout
- 教师 API：`GET /api/extends/ai-traces?projectId=...` 列表 + `GET /api/extends/ai-traces/[traceId]?view=teacher` 详情（view=teacher 自动调 redaction）
- TraceDetailDialog 完整渲染（timeline / 嵌套 span / 错误展开 / metadata 行 / 复制 trace-id）
- 4 处入口：章节失败卡「诊断」按钮 / chapter-failure-detail-dialog 底部「打开完整诊断」链接 / chapter-generation-progress-card 失败态「诊断」按钮 / scene-redesign hook toast action
- 设计工作台章节列表头部「AI 运行记录」按钮 + 右侧 Drawer ProjectTraceListPane（按 projectId 过滤 50 条）
- 6 locales i18n overlay
- 集成测试 + 文档

**不含**（Plan 3/4 范围）

- 开发者全量视图（`view=developer` 不在本 Plan 实现，仅 API 层先预留参数）
- `/dev/ai-traces` Web UI 列表 + 详情页
- access control gate（`AI_TRACE_DEV_UI` env）
- 其余 6 流程接入（媒体 / PBL / 学生流 / TTS / ASR / KB）

## 2. 前置依赖（Plan 1 全部已完成 ✓）

- HEAD `d564478` on `feat/ai-runtime-observability`
- 155 测试通过（observability 54 + teacher 101）
- `createJsonlTraceReader.readTrace(traceId, { view: 'teacher' })` 自动调 `redactSpanForTeacher`
- `chapterClassroom.lastTraceId` 已落盘
- `data/ai-traces/` 已有真实 trace 数据（>20 文件）

## 3. 任务列表（10 任务）

每任务遵循「**implementer → 合并审查（spec + quality）→ 如有问题修复 → re-verify**」流程。

### 任务 1：Zustand store + 类型定义

**文件**
- 新建：`lib/extends/observability/trace-detail-store.ts`
- 测试：`tests/extends/observability/trace-detail-store.test.ts`

**契约**

```ts
export interface TraceDetailStoreState {
  readonly traceId: string | null;
  readonly source?: 'chapter-card' | 'progress-card' | 'toast' | 'drawer' | 'failure-dialog';
  readonly openTrace: (traceId: string, source?: TraceDetailStoreState['source']) => void;
  readonly closeTrace: () => void;
}
export const useTraceDetailStore: <T>(selector: (s: TraceDetailStoreState) => T) => T;
```

zustand `create<TraceDetailStoreState>()` 写法（与项目其他 store 一致，如 `lib/extends/store/`）。`source` 字段用于后续埋点 / 测试断言入口来源。

**测试**：open → 状态切换；close → 清空；不同 source 标识保留。

### 任务 2：详情 API endpoint

**文件**
- 新建：`app/extends/api/ai-traces/[traceId]/route.ts`

**契约**

```
GET /api/extends/ai-traces/<traceId>?view=teacher
  → 200 { trace, spans, status } (TraceDetailView)
  → 404 if traceId not found
  → 400 if view!='teacher' (Plan 2 暂只允许 teacher；developer 留 Plan 3 + gate)
```

实现：

1. `const reader = createJsonlTraceReader({ rootDir: process.env.AI_TRACE_ROOT_DIR ?? 'data/ai-traces' });`
2. `const detail = await reader.readTrace(traceId, { view: 'teacher' });`
3. `if (!detail) return apiError(...404)`
4. `return apiSuccess(detail)`

使用既有 `lib/server/api-response.ts` 的 `apiSuccess / apiError`。

**测试**：mock reader → 200 路径 / 404 路径 / 400 拒绝 view=developer。

### 任务 3：列表 API endpoint

**文件**
- 新建：`app/extends/api/ai-traces/route.ts`

**契约**

```
GET /api/extends/ai-traces?projectId=...&limit=50&kind=&status=
  → 200 { items: TraceIndexEntry[], total: number }
```

实现：`reader.listTraces({ projectId, kind, status, limit })` 直接返回结果。

`total` 字段：先实现为 `items.length` 即可（Plan 2 不做完整 pagination）。

**测试**：mock reader → projectId 过滤 / kind 过滤 / 不传参数返回最近 50。

### 任务 4：TraceDetailDialog 组件

**文件**
- 新建：`components/extends/observability/trace-detail-dialog.tsx`（统一弹窗）
- 新建：`lib/extends/observability/use-trace-detail.ts`（数据获取 hook，fetch + SWR-like cache）
- 新建：`components/extends/observability/trace-span-timeline.tsx`（span 列表渲染子组件，与 dialog 解耦便于测试）
- 测试：`tests/extends/observability/trace-detail-dialog.test.tsx`

**契约**

- Dialog 由 `useTraceDetailStore.traceId` 控制开关；`traceId === null` 时 unmount
- 用 `use-trace-detail.ts` 通过 traceId fetch `/api/extends/ai-traces/<traceId>?view=teacher`
- loading 状态显示骨架；error 状态显示重试
- 渲染：
  - 头部：`生成失败：<userVisibleTitle>` + 关闭 X
  - metadata 行：总耗时 / 模型 / 失败 step / Trace ID + 复制按钮
  - span timeline：每个 span 一行，含 ✓/✗/◐ 状态图标 + 名称 + 耗时 + 模型 + token 数
  - 错误 span 自动展开，显示 retry events + error.message + httpStatus + upstreamBody 摘要 + promptText 摘要
  - 底部：[关闭]（Plan 2 不实现「重试章节」——那要回调入口方）
- 嵌套 sub-span（llm-call 在 workflow-step 内）缩进展示，默认折叠，点击 ▾ 展开

**测试**（component test with @testing-library/react）：

- given traceId=null → dialog 不渲染
- given valid traceId + mock fetch → 头部正确、span list 渲染、错误 span 默认展开
- given fetch 404 → 显示「未找到该 trace」
- given fetch 500 → 显示「加载失败 [重试]」按钮
- 复制按钮点击 → navigator.clipboard.writeText 被调（mock 后断言）

### 任务 5：GlobalTraceDetailDialog mount

**文件**
- 新建：`components/extends/observability/global-trace-detail-dialog.tsx`（薄包装，只有 mount 责任）
- 修改：`extends/bootstrap.ts` 或 fork `app/layout.tsx` 让 GlobalTraceDetailDialog 在 root provider 内 mount

**实现策略选择**：

- **优选**：fork 不动 `app/layout.tsx`，而是在 `components/extends/header.tsx`（fork 文件，所有 page 都会渲染 Header）末尾追加 `<GlobalTraceDetailDialog />`。这样无侵入 layout，所有有 Header 的页面都自动挂上。
- 备选：fork `app/layout.tsx`（仅在不能用 header 方案时考虑）

任务 5 由 implementer 看现有 layout / header 结构决定具体挂点。

**测试**：Header 渲染包含 GlobalTraceDetailDialog；点击 close 后 store.traceId 变 null。

### 任务 6：入口 1 章节失败卡 + 入口 2 失败详情底部链接

**文件**
- 修改：`components/extends/teacher/design-workbench/chapter-list-editor.tsx`（已是 fork）
- 修改：`components/extends/teacher/design-workbench/chapter-failure-detail-dialog.tsx`（已是 fork）

**入口 1**：chapter-list-editor 失败卡片在「查看错误」按钮旁加「🔍 诊断」（仅当 `chapter.classroom?.lastTraceId` 存在时显示）。点击调 `useTraceDetailStore.getState().openTrace(lastTraceId, 'chapter-card')`。

**入口 2**：chapter-failure-detail-dialog 底部追加链接「打开完整诊断 →」（同上条件 + source='failure-dialog'），点击先关闭当前 dialog 再 openTrace。

**测试**：扩展 `tests/extends/teacher/chapter-list-editor.test.tsx`（如果存在），断言诊断按钮的渲染条件与点击行为。

### 任务 7：入口 3 进度卡失败态诊断按钮

**文件**
- 修改：`components/extends/teacher/chapter-generation-progress-card.tsx`（已是 fork）

在 `phase === 'failed'` 分支「[重试]」旁追加「[🔍 诊断]」按钮，仅当 `lastTraceId` 存在时显示。点击 `openTrace(lastTraceId, 'progress-card')`。

`lastTraceId` 来源：父组件 `chapter-generate-shell.tsx` 已经持有 `chapterClassroom`，传 prop `lastTraceId` 下来即可（不要重新 fetch）。

**测试**：扩展 `tests/extends/teacher/chapter-generation-progress-card.test.tsx`，断言失败 phase 含诊断按钮。

### 任务 8：入口 4 scene-redesign toast action

**文件**
- 修改：`lib/extends/hooks/use-scene-redesign.ts`（已是 fork）

在 `toast.error(...)` 调用处追加 `action: { label: t('observability.diagnoseLink'), onClick: () => useTraceDetailStore.getState().openTrace(traceId, 'toast') }`。

**关键问题**：客户端 hook 不直接拥有 traceId（trace 在服务端生成）。两个选择：

- **A**：服务端响应 header `x-ai-trace-id` 回写 traceId 给客户端；hook 在 fetch 后 `response.headers.get('x-ai-trace-id')` 取出。需要在 API（任务 2/3 实现的 endpoint 不涉及，这里需要的是 scene-redesign 调用的实际生成 API：`POST /api/extends/courses/.../scenes/.../redesign` 或类似）增加 header 回写。
- **B**：跳过 toast action 入口，仅保留章节卡 + 进度卡 + 失败 dialog 三处。

implementer 任务 8 时先检查 scene-redesign 调用的 API 路径，确认是否能加 `x-ai-trace-id` header；如不能则与控制者沟通是否降级到 B。

**测试**：mock toast.error → action 配置正确 + onClick 触发 openTrace。

### 任务 9：设计工作台 Drawer + ProjectTraceListPane

**文件**
- 新建：`components/extends/observability/project-trace-list-pane.tsx`（drawer 内的列表表格）
- 新建：`components/extends/observability/use-project-trace-list.ts`（数据获取 hook）
- 修改：`components/extends/teacher/design-workbench/chapter-list-editor.tsx`（章节列表头部加按钮 + Drawer state）

**实现**：

- 章节列表头部追加「🔍 AI 运行记录」按钮（next to 章节列表标题），点击 setOpen(true)
- 右侧 Drawer（用既有 `components/ui/sheet.tsx` 或类似 shadcn 组件）
- Drawer 内容：ProjectTraceListPane，fetch `/api/extends/ai-traces?projectId=<current>&limit=50`
- 列：状态图标 / 流程 kind / 章节 ID / 耗时 / 状态文字 / 时间
- 行点击：`openTrace(item.traceId, 'drawer')`
- 底部 footer：「在 /dev/ai-traces 中查看更多」（Plan 2 这个链接先渲染但跳转可以是 alert/disabled，Plan 3 实装）

**测试**：

- Pane 在 mock data 下渲染列表
- 点击行触发 openTrace
- 按钮点击切换 Drawer open

### 任务 10：i18n + 集成测试 + 文档

**i18n（6 locales）**

新增 keys（namespace `observability`）：

```
observability.diagnoseButton       "诊断" / "Diagnose"
observability.diagnoseLink         "打开完整诊断 →" / "Open full diagnosis →"
observability.menuLabel            "AI 运行记录" / "AI Run Records"
observability.dialogTitleOk        "AI 运行详情" / "AI Run Detail"
observability.dialogTitleError     "生成失败：{{title}}" / "Generation failed: {{title}}"
observability.metadataDuration     "总耗时 {{duration}}" / "Total {{duration}}"
observability.metadataModel        "模型 {{model}}" / "Model {{model}}"
observability.metadataFailedAt     "失败于 {{step}}" / "Failed at {{step}}"
observability.copyTraceId          "复制 Trace ID" / "Copy Trace ID"
observability.copied               "已复制" / "Copied"
observability.traceNotFound        "未找到该 trace（可能已过 TTL）" / "Trace not found (possibly past TTL)"
observability.loading              "加载中..." / "Loading..."
observability.retry                "重试" / "Retry"
observability.openInDevUi          "在 /dev/ai-traces 中查看更多 →" / "View more in /dev/ai-traces →"
observability.emptyList            "暂无运行记录" / "No run records yet"
observability.spanRetryEvents      "重试 {{current}}/{{total}}（{{delay}} 后）" / "Retry {{current}}/{{total}} (after {{delay}})"
observability.spanPromptExcerpt    "Prompt 摘要（前 200 字符）" / "Prompt excerpt (first 200 chars)"
observability.spanUpstreamBody     "上游响应（前 400 字符）" / "Upstream response (first 400 chars)"
```

跑 `node scripts/extract-i18n-overlay.mjs && pnpm check:i18n-keys`。

**集成测试**

- `tests/extends/observability/dialog-roundtrip.test.tsx`：mock fetch + open trace → dialog 渲染包含 mock spans
- `tests/extends/observability/api-detail.test.ts`：handler 直调 + mock reader → 200/404/400 路径

**文档**

- 在 `lib/extends/observability/README.md` 追加「Plan 2 教师 UI」章节，列入口位置与用法
- 在 `extends/SYNC_MANIFEST.md` 追加 Plan 2 新增文件

## 4. 完成验收

- 任务 1-10 implementer 全部 DONE + 合并审查 ✅
- 全套测试通过（预计 ~180 tests，原 155 + 新增 ~25）
- 手动 smoke：
  1. 触发一次章节失败（用现有 trace 数据，或 mock 上游 LLM 抛错）
  2. 章节列表卡 / 进度卡 / 失败详情都能看到「诊断」按钮
  3. 点击任一个 → TraceDetailDialog 弹出 → 显示 timeline / 错误现场 / Prompt 摘要 + ellipsis
  4. 设计工作台「AI 运行记录」按钮 → Drawer 展示项目维度列表
  5. 复制 Trace ID 按钮工作
  6. 关闭 dialog / drawer → store 状态清空

## 5. 后续 Plan 入口条件

| Plan | 入口条件 | 预计任务数 |
| --- | --- | --- |
| Plan 3（开发者 Web UI + 完整 CLI） | Plan 2 完成 → TraceDetailDialog 稳定 | 6-8 任务 |
| Plan 4（其余 6 流程接入） | Plan 1 完成（Plan 2 不阻塞，可并行） | 6 任务（每个流程 1） |

Plan 3 主要工作：`/dev/ai-traces` Web UI（列表 + 详情）+ CLI `--list/--search/--gc` + access control gate (`AI_TRACE_DEV_UI`) + 开发者视图（promptText 全文 + stack 完整 + 「下载原始 JSONL」按钮）。

Plan 4 主要工作：把 `aiTraceContext.run` 包到剩下 6 个流程的服务端入口：
- 章节媒体生成 batch
- 场景重设计 hook 调用的服务端 endpoint
- 学生流 preview-outline-stream / preview-scene-content / preview-scene-actions
- PBL 生成
- TTS / ASR
- 知识库 AI 规划
