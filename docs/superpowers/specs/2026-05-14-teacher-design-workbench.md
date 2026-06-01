# Teacher Design Workbench — Spec

- **日期**：2026-05-14
- **状态**：已通过头脑风暴评审，待审稿后进入实现计划
- **范围**：合并 `/teacher/new` 与 `/teacher/projects/{id}/outline` 两个页面为统一的「设计工作台」；调整数据模型、AI 工具集、刷库节奏与「生成课件」流程
- **关联**：取代上一份草稿 `2026-05-14-teacher-course-platform-design.md` 中关于"两步式 outline + 单字段 refine"的设计

---

## 1. 背景与目标

### 1.1 当前现状

教师侧的课程设计目前分两步：

1. `/teacher/new`（`CourseProjectDesignShell`）：填 `title / requirement / chapterCount` 三个字段，AI 通过 `update_title / update_requirement / update_chapter_count` 三件套以工具调用方式辅助填写。点击提交后才创建 `CourseProject`。
2. `/teacher/projects/{id}/outline`（`CourseOutlineEditor`）：手动点击「生成大纲」→「生成章节」→「发布」→「进入工作室」。

### 1.2 问题

- 两步分裂、上下文断层：用户从填表跳到大纲页后，AI 助手没了；编辑大纲只能手工。
- AI 仅干预表单填写，不能直接干预大纲（教师诉求中的"AI 辅助优化"打了折扣）。
- 提交-跳页-生成-发布四步按钮链路繁琐，与"工作台"心智不符。

### 1.3 目标

- 把"教师设计课程"压缩成一个「设计工作台」页面：左侧课程概述 + 章节大纲，右侧 AI 助手贯穿全程。
- AI 直接动态优化课程概述与章节大纲（增删改重排）。
- 设计完成后一键「生成课件」批量出每章 Scene + 讲课笔记，自动发布并进入既有 `studio` 编辑环境。
- 复用尽可能多的现有持久化、监控、生成基础设施，避免大动数据模型。

---

## 2. 非目标 (Non-Goals)

- 不改 `studio` 现有编辑器 UI/交互
- 不改 `Scene` 渲染或持久化方式
- 不引入新的"讲课笔记"持久化结构（沿用 `Scene.actions` 的 SpeechAction）
- 不引入章节拖拽（保留 `↑/↓` 按钮）
- 不实现实时协作 / 多教师同时编辑同一草稿
- 不做并发的多章节生成（顺序生成即可，后续优化）

---

## 3. 路由变更

| 路径 | 处置 | 说明 |
|---|---|---|
| `/teacher/new` | **保留** | 入口；shell 进入 ephemeral（未落库）模式 |
| `/teacher/projects/{id}/design` | **新增** | 同一个 shell；persisted 模式 |
| `/teacher/projects/{id}/outline` | **删除** | 被 design 取代；删除页面与 `CourseOutlineEditor` 组件 |
| `/teacher/projects/{id}/studio` | **保留** | 现有页面，零改动 |
| `/api/teacher/projects/suggest` | **删除** | 早已未在 UI 调用 |

`buildTeacherOutlinePath()` 重命名为 `buildTeacherDesignPath()` 并切到 `/design`。

---

## 4. 生命周期

```
首页（互动课堂 / 设计课程）
   │ 选「设计课程」+ 输入 → 「进入课堂」
   ▼
/teacher/new   ← entry，CourseProjectDesignShell（ephemeral）
   │
   │ 自动 bootstrap：把首页输入作为 chat user message 直接发给 AI
   │ AI 调用 update_overview + 多次 add_chapter
   │
   ├── bootstrap 失败 / 用户继续聊天 → 仍 ephemeral
   │
   │ 当前 AI turn 结束后满足"overview 非空 ∧ ≥1 章节有标题"
   ▼
POST /api/teacher/projects   ← 自动落库，返回 projectId
   │
   ▼
router.replace('/teacher/projects/{id}/design')
   │
   │ 同一个 shell 进入 persisted 模式
   │ AI 工具调用 → 客户端 500ms debounce → PATCH /projects/{id}
   │ 用户手动编辑同样走 debounced PATCH
   │
   │ 用户点击「生成课件并进入课程设计」
   ▼
GenerateSlidesProgressDialog（modal，阻塞 UI）
   │
   │ 顺序遍历 chapters[i]:
   │   ├── POST /generate-outline?chapterId=X  ← 现有 endpoint 改造为单章模式
   │   └── POST /generate-chapter chapterId=X  ← 现有 endpoint，零改动
   │
   │ 任一章节失败 → modal 内联 [重试该章] [跳过] [取消]
   │
   ▼
POST /api/teacher/projects/{id}/publish  ← 现有 endpoint
   │ 创建 classroom，返回 classroomId
   │
   ▼
router.push('/teacher/projects/{id}/studio')
```

---

## 5. 数据模型变更

文件：`lib/teacher/course-types.ts`

### 5.1 `CourseProject`

```ts
interface CourseProject {
  // 现有字段保留
  id: string;
  title: string;
  requirements: { requirement: string };  // 不可变 anchor：首页原始输入
  chapterCount: number;                   // 落库时同步成 chapters.length
  workflowTemplateId: 'standard-course';
  status: CourseProjectStatus;
  createdAt: string;
  updatedAt: string;
  outline?: CourseOutline;
  artifacts: LessonArtifact[];
  generatedScenes?: Scene[];
  run?: TeacherRunStatus;
  publishedClassroomId?: string;

  // 新增
  overview?: string;                      // AI 维护的精炼课程概述
}
```

### 5.2 `CourseChapter`

```ts
interface CourseChapter {
  // 现有字段保留
  id: string;
  title: string;
  learningObjectives: string[];
  sceneOutlines: SceneOutline[];          // 设计阶段为空数组
  status: CourseChapterStatus;
  dirty: boolean;
  locked: boolean;
  order: number;

  // 新增
  summary?: string;                       // 1-2 段章节梗概（AI 生成）
}
```

### 5.3 状态语义微调

- `CourseProjectStatus`：
  - `draft`：在工作台设计中（包含 ephemeral 落库后但 scenes 未生成）
  - `outlining`：「生成课件」点击后正在跑（`run.step = 'outline' | 'chapter-content'`）
  - `outline-ready`：**废弃**，迁移读取时折叠成 `draft`
  - `editing` / `published`：保持
- `CourseChapterStatus` 枚举不变；`sceneOutlines.length === 0 && status === 'draft'` 视为"未生成课件"
- `targetAudience / durationMinutes` 字段保留，本次不动（暂未在工作台暴露）

### 5.4 后向兼容（读取层迁移）

`readTeacherProject()` 内统一应用（**只读，不写库**）：

| 现存字段 | 迁移后行为 |
|---|---|
| `overview` 缺失 | 返回值的 `overview = requirements.requirement`（让旧项目第一次进入工作台时不至于看到空概述） |
| `status === 'outline-ready'` | 折叠为 `'draft'` |
| `chapter.summary` 缺失 | 视为空字符串 |
| 已存在的 `outline.chapters[*].sceneOutlines.length > 0` | 完全保留（旧项目可能已经过完整生成流程） |
| 已发布项目（`status === 'published'`） | 全部保留；本次重构不接管已发布项目的工作流 |

不做强制写迁移，避免一次性扫库。读取后立即看到的字段均符合新 shell 期待的形状。

---

## 6. API 变更

### 6.1 修改

#### `POST /api/teacher/projects`

请求体扩展：

```ts
interface CreateProjectBody {
  requirement?: string;            // 可选；缺省时用 overview 兜底（详见下方）
  title?: string;                  // 可选；缺省时用 overview 首 30 字 / "未命名课程" 兜底
  overview?: string;               // 可选
  chapters?: ChapterDraft[];       // 可选；首次落库时由 shell 提交
  targetAudience?: string;
  durationMinutes?: number;
}

interface ChapterDraft {
  // 不传 id：服务端 nanoid 分配
  title: string;
  learningObjectives: string[];
  summary?: string;
}
```

服务端校验：
- `requirement` 与 `overview` 至少有一个非空，否则 400
- `requirement` 缺省时 = `overview`（保证 anchor 字段始终有值）
- `title` 缺省时 = `overview` 首 30 字符（截到第一个换行 / 句号），再缺则用 i18n 默认值 `teacher.create.defaults.title`
- `chapterCount` 字段移除请求体；服务端落库时同步成 `chapters?.length ?? 0`
- 响应体：`{ success: true, project: CourseProject }`

#### `POST /api/teacher/projects/refine` (SSE)

- **保持无状态**：refine 不读不写库；仅根据请求体的 `formState`（含 overview + chapters 当前快照）跑 AI、流式返回 tool call 事件
- 请求体扩展：
  ```ts
  {
    formState: {
      overview: string;
      chapters: Array<{ id: string; title: string; learningObjectives: string[]; summary?: string }>;
    };
    messages: ChatTranscript[];          // 现有
    baseRequirement: string;             // 现有
  }
  ```
- 工具集替换（详见 §7）
- SSE 事件类型不新增；现有 `text-delta` / `reasoning-delta` / `tool-call` / `done` / `error` 已经够用
- 落库由客户端在 AI turn 完成后驱动（§8）

#### `POST /api/teacher/projects/{id}/generate-outline`

- 请求体新增必选 `chapterId: string`
- 行为改为"为单一章节生成 sceneOutlines"：以 `project.overview + chapter.summary + chapter.learningObjectives + chapter.title` 作为 prompt 输入，调用 `generateSceneOutlinesFromRequirements`，结果写入 `chapter.sceneOutlines`
- 旧的"全本一次性生成"语义彻底废弃；调用方仅剩"生成课件"流程

### 6.2 新增

#### `PATCH /api/teacher/projects/{id}`

```ts
interface PatchProjectBody {
  title?: string;
  overview?: string;
  chapters?: ChapterPatch[];   // 若提供则代表「下一刻 chapters 应是这个数组」（整体替换）
}

interface ChapterPatch {
  id: string;                  // 已有章节 → 服务端 nanoid；新增章节 → "local-xxx" 或 "ai-xxx" 前缀
  title: string;
  learningObjectives: string[];
  summary?: string;
  // status / sceneOutlines / dirty / locked 不可由此 endpoint 改
}
```

服务端语义（**整体替换 + diff**）：
- `chapters` 视为目标快照，与库内现状 diff：
  - 库内有但快照里没有的 id → **删除**（同时清理对应 `LessonArtifact` / `generatedScenes`）
  - 快照有 id 且 `id.startsWith('local-')` 或 `id.startsWith('ai-')` → **新增**：分配真实 `nanoid()`，响应体里返回 `idMapping: { 'local-xxx': 'realId', 'ai-xxx': 'realId' }` 让客户端把临时 id 替换掉
  - 双方都有的 id → **更新**字段；若该章节 `status === 'ready'` 且 title/objectives/summary 发生变化，把 `chapter.dirty = true, status = 'dirty'`（提示用户后续可重新生成课件）
- 顺序：以 `chapters` 数组顺序为准（即同时承载 reorder 语义）
- 此 endpoint 不写 `sceneOutlines / scenes`，不动 `LessonArtifact` 内容（仅在删除章节时清理对应 artifact）
- 响应体：
  ```ts
  { success: true, project: CourseProject, idMapping?: Record<string, string> }
  ```

#### 客户端持久化策略（`CourseProjectDesignShell` 内部）

- ephemeral：每次 AI turn 完成后检查"落库条件"；满足则发起 `POST /projects` → 拿到 `projectId` → `router.replace('/teacher/projects/{id}/design')`
- persisted：AI turn 结束 / 用户手编 / 章节增删改重排 → 500ms debounce → `PATCH /projects/{id}`
- UI 显示同步状态：`saving | saved | draft | error`

### 6.3 删除

- `app/api/teacher/projects/suggest/route.ts`（早已未用）
- `lib/teacher/teacher-suggest-client.ts`
- `lib/teacher/course-project-submission.ts`（不再有"提交"按钮）

---

## 7. AI 工具集与 Prompt

### 7.1 工具签名

```ts
update_overview({
  overview: string                // 整段替换课程概述
});

add_chapter({
  // 不含 id 字段：客户端在应用 tool call 时分配 "ai-N" 临时 id
  afterChapterId?: string;        // 缺省追加到末尾
  title: string;
  learningObjectives: string[];
  summary: string;
});

update_chapter({
  chapterId: string;
  patch: {
    title?: string;
    learningObjectives?: string[];
    summary?: string;
  }
});

remove_chapter({
  chapterId: string;
});

reorder_chapters({
  order: string[];                // 必须是当前所有 chapterId 的全排列
});
```

### 7.2 ID 策略

三类 id 共存于客户端 chapters[*].id 字段：

| 来源 | 前缀 | 谁分配 | 何时换成真实 nanoid |
|---|---|---|---|
| 服务端持久化的章节 | 无前缀（22 位 nanoid） | 服务端 | — |
| AI `add_chapter` | `ai-${seq}` | **客户端在收到该 tool call 时自增分配** | 紧接着的 PATCH 由服务端在响应 `idMapping` 里换成真实 nanoid |
| UI 「+ 添加章节」 | `local-${nanoid}` | 客户端 | 同上 |

实现要点：
- AI `add_chapter` 工具签名**不含 id 字段**，由客户端 reducer 在应用 tool call 时自增分配 `ai-1` / `ai-2` / ...（每个新 chat session 重新计数即可，反正 PATCH 后就消失）
- 用户 prompt 中渲染 chapters 时附带 id 标注：`第 N 章 [id=xxxxx] 《title》`，AI 用此 id 调 `update_chapter` / `remove_chapter` / `reorder_chapters`
- **限制**：AI 在同一 turn 内 `add_chapter` 后立即 `update_chapter` 引用刚加的章节是不支持的（AI 不知道客户端会分配什么 `ai-N`）；由 system prompt 明确禁止"先 add_chapter 再在同一回合内 update_chapter 那条"
- PATCH 响应回来后，客户端用 `idMapping` 把所有 `ai-*` / `local-*` 替换为真实 nanoid；后续 chat 与 PATCH 都使用真实 id

### 7.3 客户端校验（refine API 无状态，校验在 reducer 里做）

| 场景 | 处理 |
|---|---|
| `update_chapter` / `remove_chapter` 引用不存在的 chapterId | 跳过该 tool call；UI 在对应 assistant 气泡里渲染 "⚠ 跳过：未知章节 id" 灰色徽标；console.warn 记录 |
| `reorder_chapters` order 长度 ≠ chapters.length 或缺/多 id | 同上："⚠ 跳过：order 与现有章节不匹配" |
| `add_chapter` 缺必填字段 | 同上："⚠ 跳过：add_chapter 缺字段 X" |
| 同一 turn 中 `add_chapter` 与后续 `reorder_chapters` 冲突（new chapter 的 ai-id 不在 order 里） | 按调用顺序执行；reorder 校验失败 → 跳过 |

PATCH endpoint 服务端另有自己的校验（详见 §6.2 表格），与上述 client 侧校验互为安全网。

### 7.4 System Prompt 关键指令

- "Chapters 是有序数组，每个 chapter 是一个独立可寻址实体；用 chapterId 引用既有章节"
- bootstrap 模式（`overview` 为空）：必须调用 `update_overview` 一次 + 至少 3 次 `add_chapter`
- follow-up 模式：仅修改老师明确提及的部分，禁止改动未提及章节的 id 或顺序
- **同一回合内不要 add_chapter 之后立即 update/remove 那条新章节**——客户端会替你分配 id，你拿不到；如果需要进一步调整，让老师在下一回合提
- 回复正文 1-2 句，描述设计思路；不在文本中复述字段值

---

## 8. 工作台 UI

### 8.1 组件树

```
CourseProjectDesignShell
├── CourseDesignTopBar
│   ├── PersistenceIndicator         // saving / saved / draft / error
│   └── GenerateSlidesButton         // 主 CTA
├── CourseProjectStreamingBanner     // 现有；AI 编辑中提示
├── grid lg:cols-[1fr_420px]
│   ├── DesignWorkbenchPanel (left)
│   │   ├── CourseOverviewBlock
│   │   │   └── markdown textarea + "AI 刚刚更新" 徽标 + 高亮渐变
│   │   └── ChapterListBlock
│   │       ├── header: 「章节大纲（N）」  [+ 添加章节]
│   │       └── ChapterCard[]
│   │           ├── 折叠态 header: ▼  第 N 章《title》  [状态徽标]  [↑][↓][🗑]
│   │           └── 展开态 body: title input / objectives textarea / summary textarea
│   └── CourseProjectChat (right)    // 现有；扩展 fieldEvent kind
└── GenerateSlidesProgressDialog     // modal；点 CTA 后展示
```

### 8.2 Shell state

```ts
interface DesignShellState {
  overview: string;
  chapters: ChapterDraft[];                 // { id, title, learningObjectives, summary }
  projectId: string | null;
  persistenceState: 'ephemeral' | 'saving' | 'saved' | 'error';
  chatMessages: CourseProjectChatMessage[];
  chatBusy: boolean;
  streamingId: string | null;
  highlightedFields: Set<string>;           // 'overview' | `chapter:${id}:title` | ...
  generation: GenerationState | null;
}

interface GenerationState {
  stage: 'outline' | 'scenes' | 'publish';
  currentIndex: number;
  total: number;
  perChapter: Record<string, ChapterGenStatus>;
  errors: { chapterId: string; message: string }[];
}
```

### 8.3 关键交互

- **进入页面**：`useEffect` 消费 `consumeTeacherHomepageRequirement()`；将原始文本作为第一条 user message 发给 AI（沿用上一轮重构成果）
- **AI 工具事件**：每个 tool call 都生成一个 `CourseProjectChatFieldEvent`，inline 渲染到对应的 assistant message 气泡里：
  - `update_overview` → "✏ 课程概述已更新"
  - `add_chapter` → "+ 新增第 N 章《title》"
  - `update_chapter` → "✏ 第 N 章《title》"
  - `remove_chapter` → "− 删除《title》"
  - `reorder_chapters` → "↕ 重排章节顺序"
- **章节卡片折叠**：默认折叠到只显示 header；点击展开后显示编辑表单。AI 修改的章节自动高亮 1.5 秒并自动展开
- **手动操作**：
  - 「+ 添加章节」：本地 push 一张空白卡片，前端先分配临时 id `local-${nanoid()}`；下一次 PATCH 由服务端替换为真实 nanoid（通过响应体的 `idMapping` 回写客户端）
  - 「↑/↓」：本地重排，触发 PATCH（顺序由 chapters 数组承载）
  - 「🗑」：本地删除 + `AlertDialog` 确认 + PATCH（diff 出删除）
- **「重新拟一份」按钮**（仅在 `baseRequirement` 非空，即首页带入需求时显示）：
  - 清空 `overview` 与 `chapters`
  - 把 `baseRequirement` 作为新 chat user message 重发，AI 重新走 bootstrap
  - persisted 模式下：紧接着的 PATCH 会把库内 chapters 全部清掉，等 AI 用 add_chapter 重新填
- **持久化指示器**：右上角小徽标，hover 显示"上次同步 X 秒前"
- **生成按钮禁用条件**：
  - `chatBusy === true`，或
  - `overview.trim() === ''`，或
  - `chapters.length === 0`，或
  - 任一 chapter `title.trim() === ''`，或
  - 任一 chapter `learningObjectives.length === 0`

### 8.4 旧组件处置

| 文件 | 处置 |
|---|---|
| `components/teacher/course-project-form.tsx` | **删除**（被 OverviewBlock + ChapterListBlock 取代） |
| `components/teacher/course-outline-editor.tsx` | **删除** |
| `components/teacher/course-project-design-shell.tsx` | **重构**为新 shell（保留文件名） |
| `components/teacher/course-project-chat.tsx` | **扩展**（新增 5 种 fieldEvent kind） |
| `components/teacher/course-project-streaming-banner.tsx` | **保留**，复用 |

### 8.5 新增组件文件

```
components/teacher/design-workbench/
  course-design-top-bar.tsx
  course-overview-block.tsx
  chapter-list-block.tsx
  chapter-card.tsx
  generate-slides-progress-dialog.tsx
  persistence-indicator.tsx
```

---

## 9. 「生成课件」流程详解

### 9.1 触发与校验

1. 用户点击「生成课件并进入课程设计」
2. shell 校验 §8.3 的禁用条件
3. 失败 → toast 提示 + 滚动到首个缺失字段并高亮

### 9.2 进度模态框

```
┌────────────────────────────────────────┐
│  正在生成课件                           │
│  ────────────────────────────────────  │
│  整体进度：[███████░░░░░] 3 / 5         │
│                                         │
│  第 1 章《XXX》     ✓ 已完成            │
│  第 2 章《YYY》     ✓ 已完成            │
│  第 3 章《ZZZ》     ⟳ 正在生成大纲...   │
│  第 4 章《...》     ⏳ 等待中            │
│  第 5 章《...》     ⏳ 等待中            │
│                                         │
│  [取消]                                  │
└────────────────────────────────────────┘
```

### 9.3 调度

```
for (const chapter of chapters) {
  setStage('outline', chapter.id);
  await POST /generate-outline?chapterId=chapter.id
  setStage('scenes', chapter.id);
  await POST /generate-chapter chapterId=chapter.id
  markReady(chapter.id);
}
setStage('publish');
const { classroomId } = await POST /publish
router.push(buildTeacherStudioPath(projectId));
```

### 9.4 失败处理

- 任一 step 失败：modal 切到错误态，该章卡片显示 `[重试该章] [跳过] [取消]`
- 「重试」：从 outline step 起重跑该章
- 「跳过」：标记该章 `status = 'failed'`，继续后续章节；publish 时若有 failed 章节则 modal 提示"N 个章节生成失败，是否仍发布课程？"
- 「取消」：关闭 modal；项目状态从 `outlining` 回到 `draft`；已生成的章节保留 `status = 'ready'`

### 9.5 中途刷新页面的处理（本期不做断点续跑）

- 生成 modal 关闭后，shell 重新挂载时根据库内每章 `status` 决定显示状态：
  - 全部 `ready` 且 `status === 'published'` → 直接 `router.push(/studio)`
  - 部分 `ready` + 部分 `draft` → 工作台正常打开，每张章节卡片显示其当前状态（已就绪 / 草稿）；用户需要重新点击「生成课件」以续跑剩余未完成章节
- 不做"恢复 modal 进度"的中间态，避免引入服务端 run.step 实时写入（见 §13）

---

## 10. 国际化

### 10.1 新增 keys（6 语种）

```
teacher.create.designWorkbench.eyebrow
teacher.create.designWorkbench.subtitle

teacher.create.designWorkbench.overview.label
teacher.create.designWorkbench.overview.placeholder
teacher.create.designWorkbench.overview.aiUpdatedBadge

teacher.create.designWorkbench.chapters.label
teacher.create.designWorkbench.chapters.count
teacher.create.designWorkbench.chapters.addButton
teacher.create.designWorkbench.chapters.empty
teacher.create.designWorkbench.chapter.titleLabel
teacher.create.designWorkbench.chapter.objectivesLabel
teacher.create.designWorkbench.chapter.objectivesHelp
teacher.create.designWorkbench.chapter.summaryLabel
teacher.create.designWorkbench.chapter.removeConfirm.title
teacher.create.designWorkbench.chapter.removeConfirm.body
teacher.create.designWorkbench.chapter.statusBadge.{draft|dirty|generating|ready|failed}

teacher.create.designWorkbench.persistence.{saving|saved|draft|error}
teacher.create.designWorkbench.persistence.lastSyncedAgo

teacher.create.designWorkbench.generate.button
teacher.create.designWorkbench.generate.validationError
teacher.create.designWorkbench.generate.dialog.title
teacher.create.designWorkbench.generate.dialog.overall
teacher.create.designWorkbench.generate.dialog.cancel
teacher.create.designWorkbench.generate.dialog.retry
teacher.create.designWorkbench.generate.dialog.skip
teacher.create.designWorkbench.generate.dialog.resumePrompt
teacher.create.designWorkbench.generate.chapterStatus.{pending|outlining|generating|ready|failed}
teacher.create.designWorkbench.generate.publishStep
teacher.create.designWorkbench.generate.completeRedirect

teacher.create.chat.fieldEvent.overviewUpdated
teacher.create.chat.fieldEvent.chapterAdded
teacher.create.chat.fieldEvent.chapterUpdated
teacher.create.chat.fieldEvent.chapterRemoved
teacher.create.chat.fieldEvent.chaptersReordered
```

### 10.2 删除的 keys

```
teacher.create.title.*               // 旧 title 字段
teacher.create.requirement.*         // 旧 requirement 字段（在 UI 上）
teacher.create.chapterCount.*        // 旧 chapterCount 字段
teacher.create.fieldEditedByAi       // 用旧的高亮文案，被新的 aiUpdatedBadge 取代
teacher.outline.*                    // 整个 outline 页面文案
```

`pnpm check:i18n-keys` 在所有 6 语种上必须保持对齐。

---

## 11. 测试矩阵

### 11.1 单元测试

| 文件 | 内容 |
|---|---|
| `tests/teacher/course-project.test.ts` | 扩展：`overview` / `summary` 字段；新章节增/删/改/重排 helpers |
| `tests/teacher/refine-tools.test.ts` | **新增**：`update_overview / add_chapter / update_chapter / remove_chapter / reorder_chapters` 应用逻辑；非法 chapterId / order 长度不匹配 / 缺字段的处理 |
| `tests/teacher/persistence-trigger.test.ts` | **新增**：「首次落库」判定（overview + ≥1 chapter 有标题）|
| `tests/teacher/migrations.test.ts` | **新增**：`outline-ready → draft` 折叠；`overview` 缺省 fallback 到 `requirement` |

### 11.2 接口测试

| 文件 | 内容 |
|---|---|
| `tests/teacher/refine-route.test.ts` | 新工具集；formState 含 chapters 时 user prompt 正确渲染 id 标注 |
| `tests/teacher/projects-route.test.ts` | `POST` 新 schema（requirement/overview 兜底）；新 `PATCH` endpoint 的 add/update/delete/reorder diff 行为；`idMapping` 响应；`status==='ready'` 章节内容变更触发 dirty |
| `tests/teacher/generate-outline-route.test.ts` | 单章模式；缺 `chapterId` 报 400；overview 缺失时回退到 `requirements.requirement` |

### 11.3 E2E（`e2e/tests/teacher-course-flow.spec.ts`）

- **改写**现有用例为新工作台流程
- 新增场景：
  - 首页 → 工作台 → bootstrap → 编辑 → 生成课件 → 落地 studio
  - 在生成途中的章节失败，点重试后成功
  - 生成中途刷新页面 → 工作台正确显示部分 ready / 部分 draft 状态（不要求 modal 自动恢复）

### 11.4 类型与代码质量门禁

执行顺序固定为：

```
pnpm format
pnpm lint
npx tsc --noEmit
pnpm check:i18n-keys
pnpm test -- tests/teacher --run
pnpm test:e2e -- teacher-course-flow
```

---

## 12. 实现切片建议（仅作为 spec → plan 阶段的衔接提示）

按依赖顺序，建议拆成 5 个 PR-sized slice：

1. **数据模型 + 后端 API**：`CourseProject.overview` / `CourseChapter.summary`；改造 `POST /projects` schema；新增 `PATCH /projects/{id}` (含 idMapping、dirty 标记)；改造 `generate-outline` 为单章模式；删除 suggest endpoint；`readTeacherProject` 加读时迁移
2. **Refine API 工具集替换**：换 5 个新工具 + 客户端校验 reducer + system prompt 重写；refine 仍保持无状态
3. **工作台 UI（左面板）**：拆 `CourseProjectForm` 为 `CourseOverviewBlock` + `ChapterListBlock` + `ChapterCard`；状态徽标；折叠/展开；持久化指示器
4. **生成进度 modal + 主流程串联**：`GenerateSlidesProgressDialog`；shell 接入新工具事件 + debounced PATCH + 首次落库自动 router.replace；删 `course-outline-editor`、删 `/teacher/projects/{id}/outline` 路由
5. **i18n 全语种 + 测试套件**：6 语种新 keys；改写 e2e；新增单元测试

每个 slice 独立可合并，互相不阻塞实现。

---

## 13. 后续工作（Out-of-scope）

- **断点续跑**：服务端实时写入 `project.run.step / progress`，刷新后可恢复 modal 进度
- **「工作人员监控/介入」面板**：把 `TeacherRunStatusPanel` 接入 design 页面，并支持监督者向生成中的 chapter 注入修改
- **从 studio 回 workbench 编辑**：在 studio 顶部加"返回设计工作台"链接，允许已发布课程重新调整 overview / chapters；本期 PATCH 已预留 dirty 标记基础设施
- 章节并发生成
- 拖拽排序
- 多教师实时协作
- 工作台内置每页课件预览（目前只能进 studio 后看）
- 首页支持语音 / PDF 输入需求
