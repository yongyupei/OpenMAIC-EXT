# 教师端生成流程改造：统一学生端管道设计规格

**日期：** 2026-05-15  
**状态：** 待实现  
**相关文件：** `app/teacher/projects/[projectId]/preview/`, `app/api/generate/scene-outlines-stream/`, `lib/generation/outline-generator.ts`

---

## 1. 背景与目标

### 当前问题

教师端存在一套独立的生成管道（`generate-outline` → `generate-chapter` → `publish`），与学生端生成管道（`scene-outlines-stream` → `scene-content` → `scene-actions`）完全分离。两套管道维护成本高、功能演进不同步，且教师端管道产出格式需额外转换才能进入 `CourseEditorShell`。

### 改造目标

将教师设计工作台中**章节的"生成课程"操作**，改为使用学生端生成管道（统一入口）。具体：

1. 教师在设计工作台完成章节配置后，点击"生成课程"
2. 进入新建的教师生成预览页（`/teacher/projects/:id/preview`）
3. 该页面以教师章节配置作为 LLM 种子提示，走学生端 SSE 大纲 + 场景生成流水线
4. 生成完毕后双写（IndexedDB + 服务端 classroom），并链接到教师项目
5. 跳转到 Teacher Studio 进行编辑

### 范围边界

- **不改动**：学生端 `/generation-preview` 页面及其所有依赖路径
- **不改动**：旧的 `/teacher/projects/:id/generate` 页面（保留以兼容旧链接）
- **不改动**：Teacher Studio 本身（`/teacher/projects/:id/studio`）
- **不改动**：`CourseProjectDesignShell` 的设计工作台逻辑，仅改导航目标

---

## 2. 架构概览

### 改造前后对比

```
【改造前 - 教师端专属管道】
设计工作台 → goToChapterGeneration()
  → /teacher/projects/:id/generate?chapterId=xxx
    → POST /api/teacher/projects/:id/generate-outline
    → POST /api/teacher/projects/:id/generate-chapter
    → POST /api/teacher/projects/:id/publish
  → /teacher/projects/:id/studio

【改造后 - 统一学生端管道】
设计工作台 → goToChapterPreview()
  → /teacher/projects/:id/preview?chapterId=xxx   ← 新页面
    → POST /api/generate/scene-outlines-stream    ← 扩展（接受 presetChapters）
    → POST /api/generate/scene-content            ← 复用学生端
    → POST /api/generate/scene-actions            ← 复用学生端
    → saveToStorage()                             ← IndexedDB
    → POST /api/teacher/projects/:id/publish      ← 服务端持久化
  → /teacher/projects/:id/studio
```

### 完整数据流

```
CourseChapter[]                     教师设计产物
    │
    ▼  buildChapterHints()
ChapterHint[]                       { title, objectives, summary, targetSceneCount }
    │
    ▼  POST /api/generate/scene-outlines-stream + presetChapters
SceneOutline[]                      LLM 精化后，SSE 流式输出
    │
    ├─▶ setOutlines() → Zustand stage store
    │
    ▼  循环 POST scene-content + scene-actions
Scene[]                             每条大纲一个完整 scene
    │
    ├─▶ addScene() → Zustand + IndexedDB saveToStorage()
    │
    ▼  POST /api/teacher/projects/:id/publish
publishedClassroomId                服务端 classroom 记录
    │
    ▼  router.push('/teacher/projects/:id/studio')
```

---

## 3. 前端：新页面 `app/teacher/projects/[projectId]/preview/page.tsx`

### 页面状态机

```
idle
  → loading-project       加载教师项目
  → streaming-outlines    SSE 接收大纲（逐条显示）
  → generating-scenes     场景内容/动作生成（进度条）
  → publishing            服务端发布
  → done                  跳转 studio
  → error                 任意阶段失败
```

### URL 参数

- `projectId`：教师项目 ID（路由参数）
- `chapterId`（可选查询参数）：指定单章生成；缺省时生成全部章节

### UI 结构

```
┌─────────────────────────────────────────────┐
│  📚 正在为「{课程标题}」生成课程内容            │
│                                             │
│  ① 大纲生成中...                            │
│     ┌── Chapter 1: {标题} ───────────────┐  │
│     │  Scene 1: {场景标题}               │  │
│     │  Scene 2: {场景标题} ✓             │  │
│     └────────────────────────────────── ┘  │
│                                             │
│  ② 场景内容生成 {n} / {total}               │
│     [████████░░░░░░░░░░░] {pct}%            │
│                                             │
│  ③ 发布中...  （生成完毕后短暂显示）          │
│                                             │
│  [错误时] 显示错误信息 + 重试/返回按钮         │
└─────────────────────────────────────────────┘
```

### 页面核心逻辑

```typescript
// 1. 加载教师项目
const project = await fetchTeacherProject(projectId)
const targetChapters = chapterId
  ? project.outline.chapters.filter(c => c.id === chapterId)
  : project.outline.chapters

// 2. 初始化 stage store（用于场景存储）
const stage = initStageFromProject(project)
store.setStage(stage)

// 3. SSE 大纲生成（带教师章节提示）
const outlines = await streamOutlines({
  requirements: buildRequirementsFromProject(project),
  presetChapters: buildChapterHints(targetChapters),
})
store.setOutlines(outlines)

// 4. 场景内容生成（逐条，复用学生端 API）
for (const outline of outlines) {
  const content = await fetchSceneContent(outline, stageInfo, genParams)
  const withActions = await fetchSceneActions(content, stageInfo, genParams)
  store.addScene(withActions)
  await store.saveToStorage()          // IndexedDB 增量写入
}

// 5. 服务端发布
await fetch(`/api/teacher/projects/${projectId}/publish`, { method: 'POST' })

// 6. 导航到 Studio
router.push(buildTeacherStudioPath(projectId))
```

### 错误处理

| 阶段 | 处理策略 |
|---|---|
| 加载项目失败 | 显示错误 + "返回设计页"按钮 |
| SSE 大纲生成失败 | 显示错误 + "重试"按钮（重新进入 preview 页） |
| 单个场景生成失败 | 跳过该场景，继续其余；完成后提示"X 个场景生成失败，其余已保存" |
| 发布失败 | 显示错误 + "重试发布"按钮；IndexedDB 中已有数据不丢失 |
| 用户导航离开 | AbortController 取消进行中的请求，不显示错误 |

---

## 4. 前端：导航改动

### `lib/teacher/routes.ts`

新增函数：

```typescript
export function buildTeacherPreviewPath(
  projectId: string,
  options?: { chapterId?: string },
): string {
  const base = `/teacher/projects/${encodeURIComponent(projectId)}/preview`
  if (options?.chapterId) {
    return `${base}?chapterId=${encodeURIComponent(options.chapterId)}`
  }
  return base
}
```

### `components/teacher/course-project-design-shell.tsx`

- 函数 `goToChapterGeneration` 改名为 `goToChapterPreview`
- `router.push(buildTeacherGeneratePath(projectId, { chapterId }))` 改为 `router.push(buildTeacherPreviewPath(projectId, { chapterId }))`
- 旧 `buildTeacherGeneratePath` 调用从此组件移除（旧路由页面文件本身保留）

### `components/teacher/design-workbench/chapter-list-editor.tsx`

- `onGenerateChapter` prop 的类型和调用方不变
- 变更在 shell 层，不涉及此组件内部逻辑

---

## 5. 后端：API 扩展

### `app/api/generate/scene-outlines-stream/route.ts`

**新增可选请求字段：**

```typescript
interface SceneOutlinesStreamRequest {
  requirements: UserRequirements     // 已有，不变
  pdfText?: string                   // 已有，不变
  pdfImages?: PdfImage[]            // 已有，不变
  imageMapping?: Record<string, string>  // 已有，不变
  researchContext?: string           // 已有，不变
  // ── 新增 ──
  presetChapters?: ChapterHint[]    // 教师章节提示，可选
}

interface ChapterHint {
  title: string
  learningObjectives: string[]
  summary?: string
  targetSceneCount: number
}
```

**兼容性保证：** `presetChapters` 完全可选，不传时行为与现在完全相同，学生端零影响。

### `lib/generation/outline-generator.ts`

当 `presetChapters` 存在时，在系统提示中注入章节结构约束段：

```
【教师预设章节结构】（请严格按照此章节顺序生成场景大纲）

第 1 章：{chapter.title}
  学习目标：{chapter.learningObjectives.join('；')}
  章节摘要：{chapter.summary}
  期望场景数：{chapter.targetSceneCount}

第 2 章：...

请为每个章节生成对应数量的场景大纲，场景类型（slide/quiz/pbl）
由你根据学习目标自主决定，内容需贴合章节主题和学习目标。
```

---

## 6. 辅助函数

辅助函数提取到 **`lib/teacher/preview-helpers.ts`**（独立模块，便于测试导入）。

### `buildChapterHints(chapters: CourseChapter[]): ChapterHint[]`

```typescript
// lib/teacher/preview-helpers.ts
export function buildChapterHints(chapters: CourseChapter[]): ChapterHint[] {
  return chapters.map((ch) => ({
    title: ch.title,
    learningObjectives: ch.learningObjectives,
    summary: ch.summary,
    targetSceneCount:
      ch.sceneOutlines.length > 0 ? ch.sceneOutlines.length : 3,
  }))
}
```

### `buildRequirementsFromProject(project: CourseProject): UserRequirements`

```typescript
export function buildRequirementsFromProject(project: CourseProject): UserRequirements {
  const lines = [
    project.overview ?? project.requirements?.requirement ?? project.title,
    project.targetAudience ? `目标受众：${project.targetAudience}` : null,
    project.durationMinutes ? `课程时长：${project.durationMinutes} 分钟` : null,
  ].filter(Boolean) as string[]

  return { requirement: lines.join('\n') }
}
```

### Stage 初始化策略

在新建预览页中，Stage 的初始化遵循以下规则：

- **首次生成**（`project.publishedClassroomId` 为空）：用 `nanoid()` 新建 Stage ID，title 取 `project.title`，description 取 `project.overview`
- **重新生成**（`project.publishedClassroomId` 已存在）：复用相同 Stage ID（即 `publishedClassroomId`），覆盖原有 classroom 内容

```typescript
const stageId = project.publishedClassroomId ?? nanoid()
store.setStage({
  id: stageId,
  name: project.title,
  description: project.overview ?? '',
  style: 'default',
})
```

---

## 7. 测试策略

### 新增单元测试

| 文件 | 测试内容 |
|---|---|
| `tests/teacher/build-chapter-hints.test.ts` | `buildChapterHints` 转换逻辑，含 sceneOutlines 为空时默认 3 |
| `tests/teacher/build-requirements-from-project.test.ts` | 缺 overview / requirements / targetAudience 各边界情况 |
| `tests/generation/outline-generator-preset-chapters.test.ts` | 有 `presetChapters` 时提示词包含章节结构段；无时不包含 |

### 新增集成测试

| 文件 | 测试内容 |
|---|---|
| `tests/teacher/preview-api.test.ts` | scene-outlines-stream 接受 `presetChapters` 正常响应；`presetChapters` 为空时行为不变 |

### 现有测试影响

- 学生端所有测试：**无影响**（API 新增字段为可选）
- 教师端已有测试（`generate-chapter`、`outline-api` 等）：**无影响**（旧页面和 API 保留）
- `tests/teacher/routes.test.ts`：需补充 `buildTeacherPreviewPath` 测试

---

## 8. 改动文件清单

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `app/teacher/projects/[projectId]/preview/page.tsx` | **新建** | 教师生成预览页（主体实现） |
| `lib/teacher/preview-helpers.ts` | **新建** | `buildChapterHints` + `buildRequirementsFromProject` 工具函数 |
| `lib/teacher/routes.ts` | **修改** | 新增 `buildTeacherPreviewPath` |
| `components/teacher/course-project-design-shell.tsx` | **修改** | `goToChapterGeneration` → `goToChapterPreview`，导航改为 preview 路径 |
| `app/api/generate/scene-outlines-stream/route.ts` | **修改** | 接受并透传可选 `presetChapters` |
| `lib/generation/outline-generator.ts` | **修改** | 提示词中注入章节结构提示 |
| `tests/teacher/preview-helpers.test.ts` | **新建** | `buildChapterHints` + `buildRequirementsFromProject` 单元测试 |
| `tests/generation/outline-generator-preset-chapters.test.ts` | **新建** | 单元测试 |
| `tests/teacher/preview-api.test.ts` | **新建** | 集成测试 |
| `tests/teacher/routes.test.ts` | **修改** | 补充 `buildTeacherPreviewPath` 测试用例 |

**总计：4 个文件修改 + 6 个文件新建，无破坏性变更。**

---

## 9. 不在本次范围内

- 旧 `/teacher/projects/:id/generate` 页面的清理（保留作兼容）
- 教师端专属 `generate-outline` / `generate-chapter` API 的废弃
- Teacher Studio 的功能改动
- `generation-preview`（学生端）的任何改动
