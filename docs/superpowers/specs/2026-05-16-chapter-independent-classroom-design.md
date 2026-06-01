# 章节独立课堂生成架构设计

**日期：** 2026-05-16  
**状态：** 待实现  
**相关计划：** `docs/superpowers/plans/2026-05-16-chapter-independent-classroom.md`（待创建）

---

## 背景与目标

### 当前问题

课程设计工作台中，每个章节的「生成课件」按钮当前逻辑：

1. `goToChapterGeneration(chapterId)` → `router.push(/teacher/projects/[projectId]/generate?chapterId=xxx)`
2. `/generate` 页面的 `runGenerationScheduler` 顺序完成 outline → scenes → publish
3. 所有章节共享一个 `publishedClassroomId`，章节场景通过 `artifact.chapterId` 关联

**问题：**
- 多章节生成串行，无法并行
- 每个章节没有独立的 Classroom/Stage，课件无法章节级独立编辑和发布
- 生成完成后跳转到统一 Studio，无章节粒度视图

### 设计目标

- 每个章节拥有独立的 Classroom（独立 `classroomId`）
- 多章节支持并行生成（各自独立跳转生成页，服务端并发处理）
- 章节生成完成后进入章节 Studio 独立编辑
- 章节 Studio 支持「发布章节」操作
- 课程级「发布课程」聚合所有已发布章节，写入 `publishedClassroomId`
- 设计工作台实时展示每个章节的生成/发布状态

---

## 整体工作流

```
首页选择课程制作
  → 会话输入课程概览 → 进入设计工作台（/design）
  → 设计工作台：AI 辅助完成课程大纲 + 每章节概览设计
  → 章节卡片点击「生成课件」→ 跳转 /chapters/[chapterId]/generate
  → 章节生成页：outline → scenes → 写入独立 classroom
  → 生成完成 → 自动跳转 /chapters/[chapterId]/studio
  → 章节 Studio：编辑课件，点击「发布章节」
  → 返回设计工作台，查看所有章节状态
  → 所有章节发布完成 → 点击「发布课程」→ 课程级聚合发布
  → /studio（课程级 Studio，学生学习入口）
```

---

## 一、数据模型

### 1.1 新增类型

**文件：** `lib/teacher/course-types.ts`

```typescript
export type CourseChapterClassroomStatus =
  | 'generating'   // 生成中（API 调用进行中）
  | 'ready'        // 已生成，可进入 Studio 编辑
  | 'published'    // 已在章节 Studio 确认发布
  | 'failed';      // 生成失败

export interface CourseChapterClassroom {
  readonly chapterId: string;
  readonly classroomId: string;          // 独立的 Stage/Classroom ID
  readonly status: CourseChapterClassroomStatus;
  readonly sceneCount?: number;          // 生成的场景数量
  readonly failedReason?: string;        // 失败原因（status === 'failed' 时）
  readonly publishedAt?: string;         // ISO 时间戳（status === 'published' 时）
  readonly createdAt: string;
  readonly updatedAt: string;
}
```

### 1.2 CourseProject 新增字段

```typescript
// CourseProject 接口新增（可选，向后兼容）
chapterClassrooms?: Record<string, CourseChapterClassroom>; // chapterId → classroom
```

### 1.3 ClassroomId 命名规则

```
classroomId = `${projectId}-ch-${chapterId}`
```

- 确保幂等性：重新生成同一章节时覆盖写入，不产生悬空记录
- 格式固定，便于调试和追踪

### 1.4 现有字段保持不变

- `CourseProject.publishedClassroomId`：保留，课程级聚合发布时写入
- `CourseProject.artifacts`（`LessonArtifact[]`）：保留，章节级生成时仍写入 artifacts 以支持章节导航
- `CourseProjectStatus`（`draft → outlining → editing → published`）：不变
- 章节粒度状态由 `CourseChapterClassroom.status` 独立追踪

---

## 二、API 路由

### 2.1 新增章节级路由

路由根路径：`app/api/teacher/projects/[projectId]/chapters/[chapterId]/`

#### `generate/route.ts` — 触发章节完整生成

```
POST /api/teacher/projects/[projectId]/chapters/[chapterId]/generate
```

**请求体：**
```typescript
{
  // 无需额外参数，服务端从 project 读取章节信息
}
```

**核心逻辑（SSE 流式进度）：**
1. **立即写入 `generating` 状态**：`patchProject(projectId, { chapterClassrooms: { ...existing, [chapterId]: { status: 'generating', classroomId, createdAt, updatedAt } } })`，让设计工作台轮询能立即感知
2. 从 `CourseProject.outline` 读取该章节的 `sceneOutlines`；若无则先生成 outline（复用 `generate-outline` 路由的核心逻辑函数）
3. 逐场景调用 `generateSceneContent` → `generateSceneActions` → `buildCompleteScene`（复用 `generate-chapter` 路由的核心逻辑函数）
4. 创建独立 Classroom：`classroomId = ${projectId}-ch-${chapterId}`
5. 调用 `persistClassroom(classroomId, stage, scenes)`（现有 storage 函数）
6. `patchProject(projectId, { chapterClassrooms: { ...existing, [chapterId]: { classroomId, status: 'ready', sceneCount, updatedAt } }, artifacts: [...mergedArtifacts] })`
7. 每步 SSE 推送进度（step、progress、message）

**响应：** SSE 流，最终事件包含 `{ status: 'ready', classroomId }`

**错误处理：** 失败时写入 `{ status: 'failed', failedReason }` 到 `chapterClassrooms[chapterId]`

#### `publish/route.ts` — 发布章节

```
POST /api/teacher/projects/[projectId]/chapters/[chapterId]/publish
```

**逻辑：**
- 校验 `chapterClassrooms[chapterId]?.status === 'ready'`
- 将状态更新为 `published`，写入 `publishedAt`
- `patchProject` 写回

#### `route.ts` — 查询章节状态

```
GET /api/teacher/projects/[projectId]/chapters/[chapterId]
```

**响应：** 返回 `CourseChapterClassroom` 对象（供设计工作台轮询）

### 2.2 改造现有路由

#### `publish/route.ts` — 课程级聚合发布（改造）

原逻辑：从 `project.artifacts` 读取 ready 场景发布  
**新逻辑：**
1. 遍历 `project.chapterClassrooms`，收集所有 `status === 'published'` 的章节 classroomId
2. 调用 `getClassroom(classroomId)` 读取每个章节 classroom 的 scenes（现有 storage 函数，与 Studio 加载 classroom 时同路径）
3. 按章节在 `project.outline.chapters` 中的顺序合并 scenes
4. 调用 `persistClassroom(publishedClassroomId, mergedStage, mergedScenes)`
5. 写入 `project.publishedClassroomId`，更新 `project.status = 'published'`

**校验：** 若无任何章节已 published，返回 400

#### `generate-outline/route.ts`、`generate-chapter/route.ts` — 保留不变

这两个路由被新的 `chapters/[chapterId]/generate` 内部调用，本身保持现有接口。

---

## 三、页面路由结构

### 3.1 新增页面

```
app/teacher/projects/[projectId]/
└── chapters/
    └── [chapterId]/
        ├── generate/
        │   └── page.tsx    ← 章节生成页（服务端组件，挂载 ChapterGenerateShell）
        └── studio/
            └── page.tsx    ← 章节 Studio（服务端组件，挂载 ChapterStudioShell）
```

**章节生成页 `chapters/[chapterId]/generate/page.tsx`：**
- 服务端：读 `CourseProject`，若 `chapterClassrooms[chapterId]?.status === 'ready' | 'published'`，redirect 到章节 Studio
- 客户端壳：`ChapterGenerateShell`，调用 `POST chapters/[chapterId]/generate`，SSE 接收进度，完成后 `router.push` 到章节 Studio

**章节 Studio `chapters/[chapterId]/studio/page.tsx`：**
- 服务端：读 `CourseProject`，从 `chapterClassrooms[chapterId]` 取 `classroomId`；若不存在则 redirect 到章节生成页
- 客户端壳：`ChapterStudioShell`，传入章节 `classroomId`

### 3.2 路由跳转规则

| 来源 | 触发 | 目标 |
|------|------|------|
| 设计工作台章节卡片 | 点击「生成课件」 | `/chapters/[chapterId]/generate` |
| 设计工作台章节卡片 | 点击「进入 Studio」 | `/chapters/[chapterId]/studio` |
| 章节生成页（完成） | 自动跳转 | `/chapters/[chapterId]/studio` |
| 章节 Studio | 点击「返回设计工作台」 | `/design` |
| 设计工作台 | 点击「发布课程」 | 调用 API，成功后 `/studio` |

### 3.3 新增路由构建函数

**文件：** `lib/teacher/routes.ts`

```typescript
export function buildChapterGeneratePath(projectId: string, chapterId: string): string {
  return `/teacher/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/generate`;
}

export function buildChapterStudioPath(projectId: string, chapterId: string): string {
  return `/teacher/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/studio`;
}
```

---

## 四、组件设计

### 4.1 新增组件

| 组件 | 路径 | 职责 |
|------|------|------|
| `ChapterClassroomStatusBadge` | `components/teacher/design-workbench/chapter-classroom-status-badge.tsx` | 章节状态徽标（颜色 + 文字 + 图标） |
| `ChapterStudioButton` | `components/teacher/design-workbench/chapter-studio-button.tsx` | 「进入 Studio」按钮，disabled 当无 classroomId |
| `CoursePublishButton` | `components/teacher/course-publish-button.tsx` | 「发布课程」按钮，统计已发布章节数，确认对话框 |
| `ChapterGenerateShell` | `components/teacher/chapter-generate-shell.tsx` | 章节生成页客户端壳（新组件，调用章节 generate API、接收 SSE 进度、完成后跳转章节 Studio） |
| `ChapterStudioShell` | `components/teacher/chapter-studio-shell.tsx` | 章节 Studio 壳（复用 `CourseStudioShell`，增加发布入口） |

### 4.2 章节卡片操作区状态

```
status === undefined（未生成）：
  [✨ 生成课件]

status === 'generating'：
  [生成中... 60%]  ← 仅状态展示，无取消按钮（取消不在本次范围）

status === 'ready'：
  ✅ 已生成  [进入 Studio]  [重新生成]

status === 'published'：
  🟢 已发布  [进入 Studio]  [重新生成]

status === 'failed'：
  ❌ 生成失败  [重试]
```

### 4.3 CourseProjectDesignShell 关键改造

**文件：** `components/teacher/course-project-design-shell.tsx`

```typescript
// 新增辅助函数
const chapterClassroomOf = useCallback(
  (chapterId: string) => project.chapterClassrooms?.[chapterId],
  [project.chapterClassrooms],
);

// 章节生成跳转（改造原 goToChapterGeneration）
const goToChapterGenerate = useCallback(
  async (chapterId: string) => {
    const ok = await ensureProjectPersisted();
    if (!ok) return;
    await flushPatch();
    router.push(buildChapterGeneratePath(projectId, chapterId));
  },
  [ensureProjectPersisted, flushPatch, router, projectId],
);

// 新增：进入章节 Studio
const goToChapterStudio = useCallback(
  (chapterId: string) => {
    router.push(buildChapterStudioPath(projectId, chapterId));
  },
  [router, projectId],
);
```

**新增设计工作台顶部「发布课程」区域：**
- 展示「X / Y 章节已发布」
- 「发布课程」按钮（至少 1 章节 published 时激活）
- 发布中显示进度，成功后显示「进入课程 Studio」链接

### 4.4 ChapterStudioShell 设计

**文件：** `components/teacher/chapter-studio-shell.tsx`

- Props：`{ project: CourseProject, chapterId: string, classroomId: string }`
- 复用 `CourseStudioShell` 内部的 `CourseEditorShell`，传入章节 `classroomId`
- 顶部增加导航栏：`← 返回设计工作台 | 章节标题 | [发布章节]`
- 「发布章节」按钮：调用 `POST chapters/[chapterId]/publish`，成功后顶部状态更新
- 右侧 AI 辅助面板：复用 `TeacherAssistPanel`，`context` 传入章节信息

---

## 五、并行生成与错误处理

### 5.1 并行生成机制

- 用户在设计工作台为多个章节点击「生成课件」，各自跳转到不同标签页
- 服务端每个 `POST chapters/[chapterId]/generate` 独立处理，互不阻塞
- `patchProject` 使用深度合并 `chapterClassrooms` 字段，避免并发覆盖：
  ```typescript
  // 深度合并，只更新当前章节的 classroom 记录
  const merged = {
    ...existing.chapterClassrooms,
    [chapterId]: newChapterClassroom,
  };
  await patchProject(projectId, { chapterClassrooms: merged });
  ```
- 设计工作台通过轮询 `GET chapters/[chapterId]`（3 秒间隔）刷新章节状态徽标

### 5.2 章节状态机

```
                [点击生成]
未生成 ──────────────────────→ generating
                                   │
                     [API 完成成功] │ [API 失败]
                                   ↓         ↓
                                 ready     failed
                                   │         │
                    [点击发布章节] │         │ [点击重试]
                                   ↓         └──→ generating
                                published
                                   │
                    [点击重新生成] │
                                   └──→ generating（覆盖写入）
```

### 5.3 错误处理策略

| 场景 | 处理方式 |
|------|---------|
| outline 生成失败 | `status = 'failed'`，`failedReason` 记录；卡片显示「生成失败，重试」 |
| scenes 生成部分失败 | `status = 'failed'`，记录失败 sceneId；重试时重新生成全部 scenes |
| 重新生成覆盖已有内容 | `status === 'ready' | 'published'` 时弹确认对话框，确认后覆盖 |
| 课程发布时有章节未 published | 提示未就绪章节列表，提供「仅发布已就绪章节」选项 |
| 并发写入竞态 | 服务端深度合并 `chapterClassrooms`，每次只更新当前章节记录 |

---

## 六、改造文件清单

### 新增文件（10 个）

| 文件 | 类型 |
|------|------|
| `app/api/teacher/projects/[projectId]/chapters/[chapterId]/generate/route.ts` | API 路由 |
| `app/api/teacher/projects/[projectId]/chapters/[chapterId]/publish/route.ts` | API 路由 |
| `app/api/teacher/projects/[projectId]/chapters/[chapterId]/route.ts` | API 路由 |
| `app/teacher/projects/[projectId]/chapters/[chapterId]/generate/page.tsx` | 页面 |
| `app/teacher/projects/[projectId]/chapters/[chapterId]/studio/page.tsx` | 页面 |
| `components/teacher/chapter-generate-shell.tsx` | 组件 |
| `components/teacher/chapter-studio-shell.tsx` | 组件 |
| `components/teacher/course-publish-button.tsx` | 组件 |
| `components/teacher/design-workbench/chapter-classroom-status-badge.tsx` | 组件 |
| `components/teacher/design-workbench/chapter-studio-button.tsx` | 组件 |

### 改造文件（5 个）

| 文件 | 改动内容 |
|------|---------|
| `lib/teacher/course-types.ts` | 新增 `CourseChapterClassroom`、`CourseChapterClassroomStatus`，`CourseProject` 增加 `chapterClassrooms` 字段 |
| `lib/teacher/routes.ts` | 新增 `buildChapterGeneratePath`、`buildChapterStudioPath` |
| `components/teacher/course-project-design-shell.tsx` | 改造 `goToChapterGeneration`，新增 `goToChapterStudio`，集成状态徽标和发布课程入口 |
| `components/teacher/design-workbench/chapter-list-editor.tsx` | 章节卡片操作区状态感知改造 |
| `app/api/teacher/projects/[projectId]/publish/route.ts` | 改造为聚合章节 classrooms 发布 |

---

## 七、不在本次范围内

- 学生端课堂体验改造（本次只改教师制作侧）
- 章节 classroom 的 WebSocket 实时状态推送（用轮询代替）
- 章节生成取消功能（`generating` 状态只展示，无取消按钮）
- 章节级权限控制（沿用课程级权限）
- 已有历史课程的数据迁移（`chapterClassrooms` 为可选字段，无需迁移）
