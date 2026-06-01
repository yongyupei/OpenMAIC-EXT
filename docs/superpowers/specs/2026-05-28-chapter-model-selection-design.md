# 设计工作台章节级模型选择 — 设计规格

**日期：** 2026-05-28  
**状态：** 待实现  
**范围：** 设计工作台每个章节可选择生成课程使用的 LLM；未选择时继承全局设置。

---

## 1. 背景与目标

### 问题

设计工作台章节生成目前**写死使用全局设置中的模型**（`getTeacherGenerationHeaders()` → `getCurrentModelConfig()`）。教师无法为不同章节指定不同模型（例如：大纲用轻量模型、重点章节用强模型）。

### 目标

- 每个章节提供**模型选择入口**
- 章节可**覆盖**全局默认模型；未覆盖时**继承全局设置**
- 整章生成流程（outline → scene-content → scene-actions → media 等）使用**同一模型**
- 选择持久化到项目数据，刷新/重进后仍生效

### 非目标

- 课程级默认模型字段（默认即全局设置）
- 按工作流步骤分别选模型（`stepOverrides.modelId` 不在本需求范围）
- 修改设置页全局模型选择器本身
- 设计工作台 AI 聊天面板的模型选择（仍用全局设置）

---

## 2. 已确认决策

| 决策 | 选择 |
|------|------|
| 粒度 | **章节级单一模型**（A） |
| 默认来源 | **继承全局设置**（A）；章节可覆盖 |
| 实现策略 | **客户端解析为主 + 服务端 fallback**（方案 1 + 轻量方案 2） |

---

## 3. 数据模型

### 3.1 Schema 变更

在 `lib/extends/teacher/generation-profile.ts` 的 `generationProfileSchema` 顶层新增：

```typescript
providerId: z.string().optional(),
modelId: z.string().optional(),
```

- `generationProfileOverrideSchema` 为 `generationProfileSchema.partial()`，章节 override 自动包含上述字段
- 与全局 settings store 的 `{ providerId, modelId }` 结构一致

### 3.2 存储语义

| 状态 | `generationProfileOverride` | 生成时使用的模型 |
|------|----------------------------|------------------|
| 未设置 override | 无 `providerId`/`modelId` | 全局 `getCurrentModelConfig()` |
| 显式「继承全局」 | 清除 `providerId`/`modelId`（或整个 override 中这两项） | 全局设置 |
| 章节覆盖 | `{ providerId, modelId }` | 指定模型 + 该 provider 的 apiKey/baseUrl |

存储位置：`CourseChapter.generationProfileOverride`（已有字段，扩展内容）。

### 3.3 持久化路径

- 设计工作台 `ChapterDraft.generationProfileOverride` → debounce PATCH `/api/teacher/projects/{id}`
- `chaptersToPatch()` / `applyChapterPatches()` 已支持 `generationProfileOverride`，无需新 PATCH 字段
- `shouldDirty()` 可选扩展：模型 override 变更是否标记章节 dirty（与 generationMode 变更对齐，实现时按现有模式决定）

---

## 4. UI 设计

### 4.1 入口

`ChapterGenerationSettingsField`（章节展开区）内，与幻灯片模板、生成模式并列。

### 4.2 新组件

**`ChapterModelSelectField`** — `components/extends/teacher/design-workbench/chapter-model-select-field.tsx`

| 元素 | 行为 |
|------|------|
| Popover 选择器 | 复用 `generation-toolbar` 中 `ModelSettingsPopover` 的 provider + 模型列表交互，样式适配章节卡片 |
| 「继承全局默认」 | 首项；选中后清除 override 中的 `providerId`/`modelId` |
| 有效值提示 | 底部小字：`当前生效：{{modelName}}（{{source}}）` |
| 禁用 | `disabled` prop（chatBusy 等） |

### 4.3 状态流

```
用户选模型
  → onChapterChange(chapterId, {
       generationProfileOverride: {
         ...chapter.generationProfileOverride,
         providerId, modelId,
       },
     })
  → design-shell-reducer 更新 ChapterDraft
  → flushPatch → PATCH project
```

### 4.4 i18n

新增键（6 语言 + fork overlay）：

| Key | 中文示例 |
|-----|----------|
| `teacher.design.chapterModel.label` | 生成模型 |
| `teacher.design.chapterModel.inheritGlobal` | 继承全局默认 |
| `teacher.design.chapterModel.effectiveHint` | 当前生效：{{model}}（{{source}}） |
| `teacher.design.chapterModel.sourceGlobal` | 全局 |
| `teacher.design.chapterModel.sourceChapter` | 本章 |

运行 `node scripts/extract-i18n-overlay.mjs` 与 `pnpm check:i18n-keys`。

---

## 5. 生成链路

### 5.1 客户端

**新文件：** `lib/extends/teacher/resolve-chapter-model-config.ts`

```typescript
export function resolveChapterGenerationModelConfig(
  chapter?: { generationProfileOverride?: GenerationProfileOverride },
): ReturnType<typeof getCurrentModelConfig>
```

逻辑：

1. 若 `chapter.generationProfileOverride.providerId` 且 `modelId` 均有值 → 从 `useSettingsStore.getState().providersConfig` 取 apiKey/baseUrl/thinkingConfig
2. 否则 → `getCurrentModelConfig()`

**扩展：** `lib/teacher/client-generation-config.ts`（或 extends 镜像）

```typescript
export function getTeacherGenerationHeadersForChapter(
  chapter?: { generationProfileOverride?: GenerationProfileOverride },
): Record<string, string>
```

### 5.2 调用点

| 位置 | 变更 |
|------|------|
| `components/extends/teacher/chapter-generate-shell.tsx` | mount 时 GET project 取章节 → `getTeacherGenerationHeadersForChapter(chapter)` 用于所有 POST |
| 其他 teacher 生成客户端 | 若传入 chapter context，同步改用章节感知 headers |

`course-project-design-shell` 的 `goToChapterGeneration` 仅 navigate，模型解析在 generate 页完成。

### 5.3 服务端 fallback

**新 helper：** `lib/extends/server/resolve-chapter-model.ts`（或 extends teacher server 目录）

```typescript
export async function resolveModelForChapterGeneration(
  request: NextRequest,
  body: unknown,
  chapter: CourseChapter,
): Promise<ResolvedModel>
```

逻辑：

1. 若 `chapter.generationProfileOverride` 含 `providerId` + `modelId` → `resolveModel({ modelString: \`${providerId}:${modelId}\`, ... })`（credentials 来自 server provider registry）
2. 否则 → `resolveModelFromRequest(request, body)`（现有行为）

**接入：** `app/extends/api/teacher/projects/[projectId]/chapters/[chapterId]/generate/route.ts`

同样评估 `generate-outline/route.ts` 是否需一致行为（单章 outline 生成）。

### 5.4 子流程与 internal fetch

`executeChapterGenerationWorkflow` 内若有 internal HTTP 调用依赖 request headers，需验证 headers 从原始 request 转发。若无 headers 的路径，实现阶段逐项核对并在 workflow params 中传递已解析的 `languageModel`（当前 workflow 已接收 `languageModel` 参数，子步骤应复用）。

### 5.5 可观测性

确保 `callLLM` / trace span 的 `modelId`/`providerId` 反映**实际解析结果**（章节 override 或全局）。

---

## 6. 边界与错误处理

| 场景 | 处理 |
|------|------|
| 选了模型但 provider 未配置 | UI toast 提示配置 Provider；与全局模型校验一致 |
| 全局模型变更，章节有 override | 章节 override 不变 |
| override 指向已删除/不可用模型 | UI 显示 ID + 警告样式；生成失败走现有 failed + trace 诊断 |
| regenerate / resume / approveOutline | 均用同一章节模型解析 |
| locked 章节 | 不可修改模型选择 |

---

## 7. 测试计划

| 测试 | 内容 |
|------|------|
| `resolve-chapter-model-config.test.ts` | inherit vs override；provider credentials 拼接 |
| `resolve-model-for-chapter.test.ts` | 服务端 override 优先于空 headers |
| `generation-profile.test.ts`（可选） | schema 接受顶层 providerId/modelId |
| 组件测试（可选） | `ChapterModelSelectField` 继承/选择回调 |

验证命令：`pnpm test` 相关文件、`npx tsc --noEmit`、`pnpm check:i18n-keys`。

---

## 8. 文件清单（实现参考）

| 操作 | 路径 |
|------|------|
| 修改 | `lib/extends/teacher/generation-profile.ts` |
| 新增 | `lib/extends/teacher/resolve-chapter-model-config.ts` |
| 修改 | `lib/teacher/client-generation-config.ts` 或 extends 镜像 |
| 新增 | `lib/extends/server/resolve-chapter-model.ts` |
| 修改 | `app/extends/api/teacher/projects/.../generate/route.ts` |
| 新增 | `components/extends/teacher/design-workbench/chapter-model-select-field.tsx` |
| 修改 | `components/extends/teacher/design-workbench/chapter-generation-settings-field.tsx` |
| 修改 | `components/extends/teacher/chapter-generate-shell.tsx` |
| 修改 | `lib/extends/i18n/locales/*.json` + overlays |
| 新增 | `tests/extends/teacher/resolve-chapter-model-config.test.ts` |

---

## 9. 规格自检

- [x] 无「待定」/ TODO 占位
- [x] 数据模型、UI、生成链路描述一致
- [x] 范围聚焦单 feature，可用一个实现计划覆盖
- [x] 继承语义明确：未 override = 全局；显式继承 = 清除 override 字段
- [x] 与现有 `generationProfileOverride` / PATCH 流程对齐
