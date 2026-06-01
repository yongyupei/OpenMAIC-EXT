# Teacher Design Workbench 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 把 `/teacher/new` 与 `/teacher/projects/{id}/outline` 两步合并为统一的「设计工作台」（`/teacher/projects/{id}/design`），左侧课程概述 + 章节大纲，右侧 AI 助手贯穿全程；点击「生成课件并进入课程设计」一键批量生成每章 Scene + 讲课笔记，自动发布并跳转到既有 `studio`。

**架构：** ephemeral shell → 首次 AI bootstrap 成功后 POST /projects 落库 → router.replace 到 `/design` → 后续所有 AI 工具调用与人工编辑走 500ms debounced PATCH /projects/{id} → 用户点「生成课件」按钮 → 顺序为每章调用 generate-outline + generate-chapter → 全部就绪后调用 publish → router.push 到 `/studio`。

**技术栈：** Next.js App Router 15.x + React 19 + TypeScript strict + AI SDK v5 streaming + zod + nanoid + i18next + vitest + playwright。

**前置文档：** `docs/superpowers/specs/2026-05-14-teacher-design-workbench.md`

---

## 文件结构

### 新增

| 路径 | 职责 |
|---|---|
| `app/teacher/projects/[projectId]/design/page.tsx` | persisted 模式入口，server component，读项目并把初始 state 注入 shell |
| `app/api/teacher/projects/[projectId]/route.ts`（新增 PATCH 导出） | PATCH endpoint：接整体 chapters + overview + title 快照，diff 出 add/update/delete/reorder，回 `{ project, idMapping }` |
| `lib/teacher/chapter-diff.ts` | 纯函数：把 `ChapterPatch[]` 与库内 `CourseChapter[]` diff，输出 add/update/delete/reorder 操作；含 `local-`/`ai-` 前缀判定与 dirty 标记规则 |
| `lib/teacher/design-shell-reducer.ts` | 客户端 reducer：把 AI 工具调用（`update_overview` / `add_chapter` / `update_chapter` / `remove_chapter` / `reorder_chapters`）应用到 shell state；含 `ai-N` 临时 id 分配与校验 |
| `lib/teacher/teacher-refine-client.ts`（重写） | 新工具事件解析：从 `field-update` 改为五种 `tool-call` 事件 |
| `lib/teacher/teacher-projects-client.ts` | 客户端封装：`createTeacherProject()`、`patchTeacherProject()` 两个 helper |
| `lib/teacher/generation-scheduler.ts` | 「生成课件」调度器：纯函数 + 异步生成器；可被 dialog UI 直接消费 |
| `components/teacher/design-workbench/course-overview-block.tsx` | 课程概述编辑区块（textarea + 高亮徽标） |
| `components/teacher/design-workbench/chapter-card.tsx` | 单个章节卡片（折叠/展开、↑↓🗑、状态徽标） |
| `components/teacher/design-workbench/chapter-list-block.tsx` | 章节列表容器（计数 + 添加按钮 + 卡片列表） |
| `components/teacher/design-workbench/persistence-indicator.tsx` | 右上角同步状态徽标 |
| `components/teacher/design-workbench/generate-slides-button.tsx` | 主 CTA 按钮，含禁用条件提示 |
| `components/teacher/design-workbench/generate-slides-progress-dialog.tsx` | 阻塞 modal，展示批量生成进度与失败重试/跳过/取消 |
| `tests/teacher/chapter-diff.test.ts` | `lib/teacher/chapter-diff.ts` 单测 |
| `tests/teacher/design-shell-reducer.test.ts` | reducer 应用工具调用 + 校验 + ai-N 分配单测 |
| `tests/teacher/patch-api.test.ts` | PATCH endpoint 接口测试 |
| `tests/teacher/generation-scheduler.test.ts` | 调度器顺序、失败、跳过单测 |
| `tests/teacher/migrations.test.ts` | `readTeacherProject` 读时迁移单测 |

### 修改

| 路径 | 改动要点 |
|---|---|
| `lib/teacher/course-types.ts` | `CourseProject.overview?: string`；`CourseChapter.summary?: string`；`'outline-ready'` 标注为 deprecated |
| `lib/teacher/course-project-storage.ts` | `readTeacherProject` 增加只读迁移：`overview` 缺省回退、`outline-ready → draft`、`chapter.summary` 默认 `''` |
| `lib/teacher/course-project.ts` | `createCourseProject` 接收新可选参数 `overview / chapters`；`createOutlineFromSceneOutlines` 保留（生成阶段仍用） |
| `lib/teacher/routes.ts` | `buildTeacherDesignPath(projectId)` 新增；`buildTeacherOutlinePath` 标注 deprecated |
| `lib/teacher/homepage-handoff.ts` | 不变 |
| `app/api/teacher/projects/route.ts` | POST 接收 `overview?` / `chapters?`；`requirement` 改为可选并以 `overview` 兜底；不再用 `chapterCount` |
| `app/api/teacher/projects/[projectId]/route.ts` | 新增 PATCH 导出 |
| `app/api/teacher/projects/[projectId]/generate-outline/route.ts` | 接收 `chapterId`，仅为该章生成 sceneOutlines |
| `app/api/teacher/projects/refine/route.ts` | 工具集替换为 5 个新工具；formState 接收 `{ overview, chapters }`；system prompt 重写；删除旧 `field-update` 事件，改发 `tool-call` |
| `components/teacher/course-project-design-shell.tsx` | 重写：消费 design-shell-reducer + 接入 PATCH + 调度器 + 五种 fieldEvent 渲染 |
| `components/teacher/course-project-chat.tsx` | 字段事件徽标扩展为 5 种 kind |
| `app/teacher/new/page.tsx` | 不变（仍渲染 shell；shell 内部判断 ephemeral / persisted） |
| 6 个 `lib/i18n/locales/*.json` | 新增 `teacher.create.designWorkbench.*` 与 `teacher.create.chat.fieldEvent.*`；删除 `teacher.create.title.*` / `teacher.create.requirement.*` / `teacher.create.chapterCount.*` / `teacher.outline.*` |
| `e2e/tests/teacher-course-flow.spec.ts` | 改写为新工作台流程 |

### 删除

| 路径 | 原因 |
|---|---|
| `app/teacher/projects/[projectId]/outline/page.tsx` | 被 `/design` 替代 |
| `components/teacher/course-outline-editor.tsx` | 被新 design 组件群替代 |
| `components/teacher/course-project-form.tsx` | 被 OverviewBlock + ChapterListBlock 替代 |
| `app/api/teacher/projects/suggest/route.ts` | 早已未在 UI 调用 |
| `lib/teacher/teacher-suggest-client.ts` | 同上 |
| `lib/teacher/course-project-submission.ts` | shell 直接调用 client helper，不再需要 |
| `tests/teacher/course-project-submission.test.ts` | 配套删除 |
| `tests/teacher/course-outline-editor.test.ts` | 配套删除 |

---

## 阶段 0：准备工作（建分支 + 数据模型）

### 任务 0.1：在主干上拉新分支并对齐 origin/main

**文件：** 无代码变更

- [ ] **步骤 1：基于 main 拉新分支**

```bash
git checkout main
git pull --ff-only origin main
git checkout -b feat/teacher-design-workbench
```

预期：当前在 `feat/teacher-design-workbench` 分支，`git status` 干净（除已存在的 untracked 文件）。

### 任务 0.2：数据模型新增 `overview` / `summary` 字段

**文件：**
- 修改：`lib/teacher/course-types.ts`

- [ ] **步骤 1：扩展 `CourseProject` 与 `CourseChapter`**

把 `lib/teacher/course-types.ts` 改为：

```ts
import type { SceneOutline, UserRequirements } from '@/lib/types/generation';
import type { Scene } from '@/lib/types/stage';

export type CourseProjectStatus =
  | 'draft'
  | 'outlining'
  | 'outline-ready' // @deprecated 读取时折叠为 'draft'，新代码不要再写入
  | 'generating'
  | 'editing'
  | 'published';

export type CourseChapterStatus = 'draft' | 'dirty' | 'generating' | 'ready' | 'failed';

export interface CourseProject {
  id: string;
  title: string;
  requirements: UserRequirements;
  targetAudience?: string;
  durationMinutes?: number;
  chapterCount: number;
  workflowTemplateId: 'standard-course';
  status: CourseProjectStatus;
  createdAt: string;
  updatedAt: string;
  outline?: CourseOutline;
  artifacts: LessonArtifact[];
  generatedScenes?: Scene[];
  run?: TeacherRunStatus;
  publishedClassroomId?: string;
  /** AI-managed polished course overview, shown in the design workbench. */
  overview?: string;
}

export interface CourseOutline {
  projectId: string;
  languageDirective?: string;
  revision: number;
  chapters: CourseChapter[];
}

export interface CourseChapter {
  id: string;
  title: string;
  learningObjectives: string[];
  sceneOutlines: SceneOutline[];
  status: CourseChapterStatus;
  dirty: boolean;
  locked: boolean;
  order: number;
  /** 1-2 paragraph chapter synopsis (AI-generated) shown in the workbench. */
  summary?: string;
}

export interface LessonArtifact {
  chapterId: string;
  sceneId: string;
  sceneType: Scene['type'];
  sourceOutlineId: string;
  outlineRevision: number;
  locked: boolean;
  lastGeneratedAt: string;
}

export interface TeacherRunStatus {
  step: 'idle' | 'outline' | 'chapter-content' | 'chapter-actions' | 'publish';
  progress: number;
  message?: string;
  failedChapterId?: string;
}
```

- [ ] **步骤 2：typecheck 确认无 break**

```bash
npx tsc --noEmit
```

预期：exit 0。

- [ ] **步骤 3：commit**

```bash
git add lib/teacher/course-types.ts
git commit -m "feat(teacher): add overview/summary fields to course types"
```

---

## 阶段 1：后端 API

### 任务 1.1：`readTeacherProject` 读时迁移

**文件：**
- 修改：`lib/teacher/course-project-storage.ts`
- 测试：`tests/teacher/migrations.test.ts`（新增）

- [ ] **步骤 1：写失败测试**

创建 `tests/teacher/migrations.test.ts`：

```ts
import { promises as fs } from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  readTeacherProject,
  TEACHER_PROJECTS_DIR,
} from '@/lib/teacher/course-project-storage';

const TMP_PROJECT_ID = 'mig_test_project';

async function seed(payload: Record<string, unknown>) {
  await fs.mkdir(TEACHER_PROJECTS_DIR, { recursive: true });
  await fs.writeFile(
    path.join(TEACHER_PROJECTS_DIR, `${TMP_PROJECT_ID}.json`),
    JSON.stringify(payload),
    'utf-8',
  );
}

afterEach(async () => {
  await fs.rm(path.join(TEACHER_PROJECTS_DIR, `${TMP_PROJECT_ID}.json`), { force: true });
});

describe('readTeacherProject migrations', () => {
  test('overview missing falls back to requirements.requirement', async () => {
    await seed({
      id: TMP_PROJECT_ID,
      title: 'T',
      requirements: { requirement: 'Original input' },
      chapterCount: 1,
      workflowTemplateId: 'standard-course',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      artifacts: [],
    });
    const project = await readTeacherProject(TMP_PROJECT_ID);
    expect(project?.overview).toBe('Original input');
  });

  test('outline-ready status collapses to draft', async () => {
    await seed({
      id: TMP_PROJECT_ID,
      title: 'T',
      requirements: { requirement: 'r' },
      chapterCount: 1,
      workflowTemplateId: 'standard-course',
      status: 'outline-ready',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      artifacts: [],
    });
    const project = await readTeacherProject(TMP_PROJECT_ID);
    expect(project?.status).toBe('draft');
  });

  test('chapter.summary missing becomes empty string', async () => {
    await seed({
      id: TMP_PROJECT_ID,
      title: 'T',
      requirements: { requirement: 'r' },
      chapterCount: 1,
      workflowTemplateId: 'standard-course',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      artifacts: [],
      outline: {
        projectId: TMP_PROJECT_ID,
        revision: 1,
        chapters: [
          {
            id: 'c1',
            title: 'Ch 1',
            learningObjectives: [],
            sceneOutlines: [],
            status: 'draft',
            dirty: false,
            locked: false,
            order: 0,
          },
        ],
      },
    });
    const project = await readTeacherProject(TMP_PROJECT_ID);
    expect(project?.outline?.chapters[0]?.summary).toBe('');
  });
});
```

- [ ] **步骤 2：运行测试，确认失败**

```bash
pnpm test tests/teacher/migrations.test.ts --run
```

预期：3 个 test 全 fail（overview undefined / status === 'outline-ready' / summary undefined）。

- [ ] **步骤 3：实现迁移**

修改 `lib/teacher/course-project-storage.ts` 的 `readTeacherProject` 函数：

```ts
export async function readTeacherProject(projectId: string): Promise<CourseProject | null> {
  if (!isValidTeacherProjectId(projectId)) {
    throw new Error(`Invalid teacher project id: ${projectId}`);
  }
  const filePath = path.join(TEACHER_PROJECTS_DIR, `${projectId}.json`);
  try {
    const raw = JSON.parse(await fs.readFile(filePath, 'utf-8')) as CourseProject;
    return migrateForRead(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function migrateForRead(project: CourseProject): CourseProject {
  const overview =
    typeof project.overview === 'string' && project.overview.length > 0
      ? project.overview
      : project.requirements?.requirement ?? '';
  const status = project.status === 'outline-ready' ? 'draft' : project.status;
  const outline = project.outline
    ? {
        ...project.outline,
        chapters: project.outline.chapters.map((chapter) => ({
          ...chapter,
          summary: chapter.summary ?? '',
        })),
      }
    : project.outline;
  return { ...project, overview, status, outline };
}
```

- [ ] **步骤 4：测试通过**

```bash
pnpm test tests/teacher/migrations.test.ts --run
```

预期：3/3 pass。

- [ ] **步骤 5：commit**

```bash
git add lib/teacher/course-project-storage.ts tests/teacher/migrations.test.ts
git commit -m "feat(teacher): add read-time migrations for overview/summary/status"
```

### 任务 1.2：`POST /api/teacher/projects` schema 扩展

**文件：**
- 修改：`app/api/teacher/projects/route.ts`
- 修改：`lib/teacher/course-project.ts`
- 测试：扩展 `tests/teacher/project-api.test.ts`

- [ ] **步骤 1：扩展 `createCourseProject` 接收 overview + chapters**

修改 `lib/teacher/course-project.ts`：

```ts
import { nanoid } from 'nanoid';
import type { SceneOutline, UserRequirements } from '@/lib/types/generation';
import type { Scene } from '@/lib/types/stage';
import type {
  CourseChapter,
  CourseOutline,
  CourseProject,
} from '@/lib/teacher/course-types';

export interface CreateCourseProjectInput {
  id: string;
  title?: string;
  requirement?: string;
  overview?: string;
  chapters?: Array<{
    title: string;
    learningObjectives: string[];
    summary?: string;
  }>;
  targetAudience?: string;
  durationMinutes?: number;
  now: string;
}

const DEFAULT_TITLE = 'Untitled course';

export function createCourseProject(input: CreateCourseProjectInput): CourseProject {
  const overview = input.overview?.trim() ?? '';
  const requirement = input.requirement?.trim() || overview;
  if (!requirement) {
    throw new Error('requirement or overview must be provided');
  }
  const requirements: UserRequirements = { requirement };
  const title = (input.title?.trim() || deriveTitleFromOverview(overview) || DEFAULT_TITLE).slice(
    0,
    120,
  );
  const chapters: CourseChapter[] = (input.chapters ?? []).map((chapter, index) => ({
    id: nanoid(),
    title: chapter.title.trim().slice(0, 200),
    learningObjectives: chapter.learningObjectives.map((line) => line.trim()).filter(Boolean),
    summary: chapter.summary?.trim() ?? '',
    sceneOutlines: [],
    status: 'draft',
    dirty: false,
    locked: false,
    order: index,
  }));
  const outline: CourseOutline | undefined =
    chapters.length > 0
      ? { projectId: input.id, revision: 1, chapters }
      : undefined;
  return {
    id: input.id,
    title,
    requirements,
    overview,
    targetAudience: input.targetAudience,
    durationMinutes: input.durationMinutes,
    chapterCount: chapters.length,
    workflowTemplateId: 'standard-course',
    status: 'draft',
    createdAt: input.now,
    updatedAt: input.now,
    outline,
    artifacts: [],
  };
}

function deriveTitleFromOverview(overview: string): string {
  if (!overview) return '';
  const firstLine = overview.split(/[\n。.！!？?]/)[0]?.trim() ?? '';
  return firstLine.slice(0, 30);
}

// Existing helpers (createOutlineFromSceneOutlines, markChapterDirty, listRegeneratableOutlines,
// applyGeneratedChapterScenes) keep their current implementation — only createCourseProject changes.
```

> 注意：保留现有的 `createOutlineFromSceneOutlines` / `markChapterDirty` / `listRegeneratableOutlines` / `applyGeneratedChapterScenes` 函数实现不动；只重写 `createCourseProject` 与新增 `deriveTitleFromOverview`。

- [ ] **步骤 2：写失败测试（POST schema 扩展）**

往 `tests/teacher/project-api.test.ts` 末尾追加：

```ts
test('creates project with overview + chapters (no requirement)', async () => {
  const req = new Request('http://localhost/api/teacher/projects', {
    method: 'POST',
    body: JSON.stringify({
      overview: '一门面向高一学生的有机化学入门课，强调实验直觉。',
      chapters: [
        { title: '原子键合', learningObjectives: ['理解共价键', '区分极性与非极性'], summary: '从电子云开始建立直觉。' },
        { title: '官能团速览', learningObjectives: ['识别 6 种常见官能团'], summary: '配对实验现象。' },
      ],
    }),
  });
  const response = await POST(req as never);
  const json = await response.json();
  expect(response.status).toBe(201);
  expect(json.success).toBe(true);
  expect(json.project.overview).toContain('有机化学');
  expect(json.project.outline?.chapters).toHaveLength(2);
  expect(json.project.outline?.chapters[0].title).toBe('原子键合');
  expect(json.project.requirements.requirement).toContain('有机化学');
});

test('rejects POST with neither requirement nor overview', async () => {
  const req = new Request('http://localhost/api/teacher/projects', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const response = await POST(req as never);
  expect(response.status).toBe(400);
});
```

> 注意：旧用例 `creates a teacher project from course requirements` 仍要通过 —— `requirement` 字段在 POST 请求里仍然支持。

- [ ] **步骤 3：运行测试确认失败**

```bash
pnpm test tests/teacher/project-api.test.ts --run
```

预期：新增 2 个 test fail，老 test 仍 pass。

- [ ] **步骤 4：实现 POST schema 扩展**

把 `app/api/teacher/projects/route.ts` 的 POST handler + 校验函数替换为：

```ts
import { type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { createCourseProject } from '@/lib/teacher/course-project';
import { listTeacherProjects, writeTeacherProject } from '@/lib/teacher/course-project-storage';

interface CreateProjectBody {
  title?: string;
  requirement?: string;
  overview?: string;
  chapters?: Array<{
    title: string;
    learningObjectives: string[];
    summary?: string;
  }>;
  targetAudience?: string;
  durationMinutes?: number;
}

export async function GET() {
  // unchanged
  try {
    const projects = await listTeacherProjects();
    return apiSuccess({ projects });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to list teacher projects',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      400,
      'Request body must be valid JSON',
      error instanceof Error ? error.message : String(error),
    );
  }

  if (!isCreateProjectBodyShape(body)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project fields');
  }

  const requirement = body.requirement?.trim();
  const overview = body.overview?.trim();
  if (!requirement && !overview) {
    return apiError(
      API_ERROR_CODES.MISSING_REQUIRED_FIELD,
      400,
      'Either requirement or overview must be provided',
    );
  }

  try {
    const now = new Date().toISOString();
    const project = createCourseProject({
      id: nanoid(),
      title: body.title,
      requirement,
      overview,
      chapters: body.chapters,
      targetAudience: body.targetAudience,
      durationMinutes: body.durationMinutes,
      now,
    });
    await writeTeacherProject(project);
    return apiSuccess({ project }, 201);
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to create teacher project',
      error instanceof Error ? error.message : String(error),
    );
  }
}

function isCreateProjectBodyShape(body: unknown): body is CreateProjectBody {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
  const candidate = body as Record<string, unknown>;
  if (candidate.title !== undefined && typeof candidate.title !== 'string') return false;
  if (candidate.requirement !== undefined && typeof candidate.requirement !== 'string') return false;
  if (candidate.overview !== undefined && typeof candidate.overview !== 'string') return false;
  if (candidate.chapters !== undefined) {
    if (!Array.isArray(candidate.chapters)) return false;
    for (const chapter of candidate.chapters) {
      if (
        typeof chapter !== 'object' ||
        chapter === null ||
        typeof (chapter as Record<string, unknown>).title !== 'string' ||
        !Array.isArray((chapter as Record<string, unknown>).learningObjectives)
      ) {
        return false;
      }
    }
  }
  if (candidate.targetAudience !== undefined && typeof candidate.targetAudience !== 'string') return false;
  if (candidate.durationMinutes !== undefined && typeof candidate.durationMinutes !== 'number') return false;
  return true;
}
```

- [ ] **步骤 5：测试通过**

```bash
pnpm test tests/teacher/project-api.test.ts --run
```

预期：所有 test pass。

- [ ] **步骤 6：commit**

```bash
git add lib/teacher/course-project.ts app/api/teacher/projects/route.ts tests/teacher/project-api.test.ts
git commit -m "feat(teacher): POST /projects accepts overview + chapters; relax requirement"
```

### 任务 1.3：`PATCH /api/teacher/projects/{id}` 新建（含 chapter-diff 模块）

**文件：**
- 创建：`lib/teacher/chapter-diff.ts`
- 创建：`tests/teacher/chapter-diff.test.ts`
- 修改：`app/api/teacher/projects/[projectId]/route.ts`（新增 PATCH 导出）
- 创建：`tests/teacher/patch-api.test.ts`

- [ ] **步骤 1：写 chapter-diff 测试**

创建 `tests/teacher/chapter-diff.test.ts`：

```ts
import { describe, expect, test } from 'vitest';
import { applyChapterPatches, type ChapterPatch } from '@/lib/teacher/chapter-diff';
import type { CourseChapter } from '@/lib/teacher/course-types';

function chapter(overrides: Partial<CourseChapter> & Pick<CourseChapter, 'id' | 'title'>): CourseChapter {
  return {
    learningObjectives: [],
    sceneOutlines: [],
    status: 'draft',
    dirty: false,
    locked: false,
    order: 0,
    summary: '',
    ...overrides,
  };
}

describe('applyChapterPatches', () => {
  test('returns existing chapter unchanged when no patches change content', () => {
    const existing = [chapter({ id: 'a', title: 'A', order: 0 })];
    const patches: ChapterPatch[] = [{ id: 'a', title: 'A', learningObjectives: [], summary: '' }];
    const result = applyChapterPatches(existing, patches);
    expect(result.chapters).toEqual(existing);
    expect(result.idMapping).toEqual({});
    expect(result.deletedIds).toEqual([]);
  });

  test('inserts new chapter for local-/ai- prefixed id and assigns nanoid', () => {
    const existing: CourseChapter[] = [];
    const patches: ChapterPatch[] = [
      { id: 'local-temp-1', title: 'New', learningObjectives: ['L1'], summary: 'S' },
    ];
    const result = applyChapterPatches(existing, patches);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].id).not.toBe('local-temp-1');
    expect(result.chapters[0].id.length).toBeGreaterThanOrEqual(8);
    expect(result.idMapping['local-temp-1']).toBe(result.chapters[0].id);
  });

  test('marks ready chapter as dirty when title changes', () => {
    const existing = [
      chapter({ id: 'a', title: 'Old', status: 'ready', order: 0 }),
    ];
    const patches: ChapterPatch[] = [{ id: 'a', title: 'New', learningObjectives: [], summary: '' }];
    const result = applyChapterPatches(existing, patches);
    expect(result.chapters[0].status).toBe('dirty');
    expect(result.chapters[0].dirty).toBe(true);
  });

  test('does NOT dirty when chapter is draft (no scenes yet)', () => {
    const existing = [chapter({ id: 'a', title: 'Old', status: 'draft', order: 0 })];
    const patches: ChapterPatch[] = [{ id: 'a', title: 'New', learningObjectives: [], summary: '' }];
    const result = applyChapterPatches(existing, patches);
    expect(result.chapters[0].status).toBe('draft');
    expect(result.chapters[0].dirty).toBe(false);
  });

  test('deletes chapter missing from snapshot and reports id', () => {
    const existing = [
      chapter({ id: 'a', title: 'A', order: 0 }),
      chapter({ id: 'b', title: 'B', order: 1 }),
    ];
    const patches: ChapterPatch[] = [{ id: 'a', title: 'A', learningObjectives: [], summary: '' }];
    const result = applyChapterPatches(existing, patches);
    expect(result.chapters.map((c) => c.id)).toEqual(['a']);
    expect(result.deletedIds).toEqual(['b']);
  });

  test('preserves order from snapshot (reorder semantics)', () => {
    const existing = [
      chapter({ id: 'a', title: 'A', order: 0 }),
      chapter({ id: 'b', title: 'B', order: 1 }),
    ];
    const patches: ChapterPatch[] = [
      { id: 'b', title: 'B', learningObjectives: [], summary: '' },
      { id: 'a', title: 'A', learningObjectives: [], summary: '' },
    ];
    const result = applyChapterPatches(existing, patches);
    expect(result.chapters.map((c) => c.id)).toEqual(['b', 'a']);
    expect(result.chapters.map((c) => c.order)).toEqual([0, 1]);
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
pnpm test tests/teacher/chapter-diff.test.ts --run
```

预期：fail（模块不存在）。

- [ ] **步骤 3：实现 chapter-diff**

创建 `lib/teacher/chapter-diff.ts`：

```ts
import { nanoid } from 'nanoid';
import type { CourseChapter } from '@/lib/teacher/course-types';

export interface ChapterPatch {
  id: string;
  title: string;
  learningObjectives: string[];
  summary?: string;
}

export interface ApplyChapterPatchesResult {
  chapters: CourseChapter[];
  idMapping: Record<string, string>;
  deletedIds: string[];
}

const TEMP_ID_PREFIXES = ['local-', 'ai-'] as const;

function isTempId(id: string): boolean {
  return TEMP_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

function shouldDirty(existing: CourseChapter, patch: ChapterPatch): boolean {
  if (existing.status !== 'ready') return false;
  if (existing.title !== patch.title) return true;
  const objectivesChanged =
    existing.learningObjectives.length !== patch.learningObjectives.length ||
    existing.learningObjectives.some((line, idx) => line !== patch.learningObjectives[idx]);
  if (objectivesChanged) return true;
  if ((existing.summary ?? '') !== (patch.summary ?? '')) return true;
  return false;
}

export function applyChapterPatches(
  existing: CourseChapter[],
  patches: ChapterPatch[],
): ApplyChapterPatchesResult {
  const existingById = new Map(existing.map((chapter) => [chapter.id, chapter]));
  const seenIds = new Set<string>();
  const idMapping: Record<string, string> = {};

  const chapters: CourseChapter[] = patches.map((patch, index) => {
    if (isTempId(patch.id)) {
      const realId = nanoid();
      idMapping[patch.id] = realId;
      return {
        id: realId,
        title: patch.title,
        learningObjectives: patch.learningObjectives,
        summary: patch.summary ?? '',
        sceneOutlines: [],
        status: 'draft',
        dirty: false,
        locked: false,
        order: index,
      };
    }

    seenIds.add(patch.id);
    const previous = existingById.get(patch.id);
    if (!previous) {
      // Unknown non-temp id → treat as add as well, preserving the given id is unsafe, allocate fresh
      const realId = nanoid();
      idMapping[patch.id] = realId;
      return {
        id: realId,
        title: patch.title,
        learningObjectives: patch.learningObjectives,
        summary: patch.summary ?? '',
        sceneOutlines: [],
        status: 'draft',
        dirty: false,
        locked: false,
        order: index,
      };
    }

    const dirty = shouldDirty(previous, patch);
    return {
      ...previous,
      title: patch.title,
      learningObjectives: patch.learningObjectives,
      summary: patch.summary ?? '',
      order: index,
      status: dirty ? 'dirty' : previous.status,
      dirty: dirty ? true : previous.dirty,
    };
  });

  const deletedIds: string[] = existing
    .filter((chapter) => !seenIds.has(chapter.id))
    .map((chapter) => chapter.id);

  return { chapters, idMapping, deletedIds };
}
```

- [ ] **步骤 4：测试通过**

```bash
pnpm test tests/teacher/chapter-diff.test.ts --run
```

预期：6/6 pass。

- [ ] **步骤 5：写 PATCH endpoint 失败测试**

创建 `tests/teacher/patch-api.test.ts`：

```ts
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PATCH } from '@/app/api/teacher/projects/[projectId]/route';
import {
  readTeacherProject,
  writeTeacherProject,
} from '@/lib/teacher/course-project-storage';
import type { CourseProject } from '@/lib/teacher/course-types';

vi.mock('@/lib/teacher/course-project-storage', () => ({
  isValidTeacherProjectId: vi.fn(() => true),
  readTeacherProject: vi.fn(),
  writeTeacherProject: vi.fn(async (project: CourseProject) => project),
}));

const baseProject: CourseProject = {
  id: 'p1',
  title: 'Old title',
  requirements: { requirement: 'r' },
  overview: 'old overview',
  chapterCount: 2,
  workflowTemplateId: 'standard-course',
  status: 'draft',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  artifacts: [],
  outline: {
    projectId: 'p1',
    revision: 1,
    chapters: [
      {
        id: 'ch-a',
        title: 'A',
        learningObjectives: ['oa1'],
        sceneOutlines: [],
        status: 'draft',
        dirty: false,
        locked: false,
        order: 0,
        summary: '',
      },
      {
        id: 'ch-b',
        title: 'B',
        learningObjectives: ['ob1'],
        sceneOutlines: [],
        status: 'ready',
        dirty: false,
        locked: false,
        order: 1,
        summary: 'b-sum',
      },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readTeacherProject).mockResolvedValue(structuredClone(baseProject));
});

describe('PATCH /api/teacher/projects/{id}', () => {
  test('updates overview only', async () => {
    const req = new Request('http://localhost/x', {
      method: 'PATCH',
      body: JSON.stringify({ overview: 'new overview' }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ projectId: 'p1' }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.project.overview).toBe('new overview');
    expect(json.idMapping).toBeUndefined();
  });

  test('inserts ai- prefixed chapter and returns idMapping', async () => {
    const req = new Request('http://localhost/x', {
      method: 'PATCH',
      body: JSON.stringify({
        chapters: [
          { id: 'ch-a', title: 'A', learningObjectives: ['oa1'], summary: '' },
          { id: 'ch-b', title: 'B', learningObjectives: ['ob1'], summary: 'b-sum' },
          { id: 'ai-1', title: 'C', learningObjectives: [], summary: '' },
        ],
      }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ projectId: 'p1' }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.project.outline.chapters).toHaveLength(3);
    expect(json.idMapping['ai-1']).toBeDefined();
    expect(json.project.outline.chapters[2].id).toBe(json.idMapping['ai-1']);
  });

  test('deletes chapter and clears its artifacts/scenes', async () => {
    vi.mocked(readTeacherProject).mockResolvedValue({
      ...structuredClone(baseProject),
      artifacts: [
        {
          chapterId: 'ch-b',
          sceneId: 'sc-1',
          sceneType: 'slide',
          sourceOutlineId: 'so-1',
          outlineRevision: 1,
          locked: false,
          lastGeneratedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      generatedScenes: [{ id: 'sc-1', type: 'slide' } as never],
    });
    const req = new Request('http://localhost/x', {
      method: 'PATCH',
      body: JSON.stringify({
        chapters: [{ id: 'ch-a', title: 'A', learningObjectives: ['oa1'], summary: '' }],
      }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ projectId: 'p1' }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.project.outline.chapters).toHaveLength(1);
    expect(json.project.artifacts).toHaveLength(0);
    expect(json.project.generatedScenes ?? []).toHaveLength(0);
  });

  test('marks ready chapter dirty when title changes', async () => {
    const req = new Request('http://localhost/x', {
      method: 'PATCH',
      body: JSON.stringify({
        chapters: [
          { id: 'ch-a', title: 'A', learningObjectives: ['oa1'], summary: '' },
          { id: 'ch-b', title: 'B renamed', learningObjectives: ['ob1'], summary: 'b-sum' },
        ],
      }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ projectId: 'p1' }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    const chB = json.project.outline.chapters.find((c: { id: string }) => c.id === 'ch-b');
    expect(chB.status).toBe('dirty');
    expect(chB.dirty).toBe(true);
  });

  test('rejects invalid body', async () => {
    const req = new Request('http://localhost/x', {
      method: 'PATCH',
      body: JSON.stringify({ chapters: 'not-an-array' }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ projectId: 'p1' }) });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **步骤 6：运行测试确认失败**

```bash
pnpm test tests/teacher/patch-api.test.ts --run
```

预期：fail（PATCH 未导出）。

- [ ] **步骤 7：实现 PATCH endpoint**

往 `app/api/teacher/projects/[projectId]/route.ts` 末尾追加：

```ts
import { applyChapterPatches, type ChapterPatch } from '@/lib/teacher/chapter-diff';

interface PatchProjectBody {
  title?: string;
  overview?: string;
  chapters?: ChapterPatch[];
}

function parsePatchBody(body: unknown): PatchProjectBody | null {
  if (!isRecord(body)) return null;
  const out: PatchProjectBody = {};
  if ('title' in body) {
    if (typeof body.title !== 'string') return null;
    out.title = body.title;
  }
  if ('overview' in body) {
    if (typeof body.overview !== 'string') return null;
    out.overview = body.overview;
  }
  if ('chapters' in body) {
    if (!Array.isArray(body.chapters)) return null;
    const parsed: ChapterPatch[] = [];
    for (const entry of body.chapters) {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        typeof (entry as Record<string, unknown>).id !== 'string' ||
        typeof (entry as Record<string, unknown>).title !== 'string' ||
        !Array.isArray((entry as Record<string, unknown>).learningObjectives)
      ) {
        return null;
      }
      const e = entry as Record<string, unknown>;
      parsed.push({
        id: e.id as string,
        title: e.title as string,
        learningObjectives: (e.learningObjectives as unknown[]).filter(
          (line): line is string => typeof line === 'string',
        ),
        summary: typeof e.summary === 'string' ? (e.summary as string) : undefined,
      });
    }
    out.chapters = parsed;
  }
  return out;
}

export async function PATCH(request: NextRequest, context: ProjectRouteContext) {
  try {
    const projectId = await getProjectId(context);
    if (!isValidTeacherProjectId(projectId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
    }

    const project = await readTeacherProject(projectId);
    if (!project) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON');
    }
    const parsed = parsePatchBody(body);
    if (!parsed) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid PATCH body');
    }

    const updated: CourseProject = { ...project, updatedAt: new Date().toISOString() };
    if (parsed.title !== undefined) updated.title = parsed.title.slice(0, 200);
    if (parsed.overview !== undefined) updated.overview = parsed.overview;

    let idMapping: Record<string, string> | undefined;
    if (parsed.chapters !== undefined) {
      const existingChapters = updated.outline?.chapters ?? [];
      const result = applyChapterPatches(existingChapters, parsed.chapters);
      idMapping = Object.keys(result.idMapping).length > 0 ? result.idMapping : undefined;

      updated.outline = {
        projectId: updated.id,
        languageDirective: updated.outline?.languageDirective,
        revision: updated.outline?.revision ?? 1,
        chapters: result.chapters,
      };
      updated.chapterCount = result.chapters.length;

      if (result.deletedIds.length > 0) {
        const deletedSet = new Set(result.deletedIds);
        updated.artifacts = updated.artifacts.filter(
          (artifact) => !deletedSet.has(artifact.chapterId),
        );
        if (updated.generatedScenes) {
          const survivingSceneIds = new Set(
            updated.artifacts.map((artifact) => artifact.sceneId),
          );
          updated.generatedScenes = updated.generatedScenes.filter((scene) =>
            survivingSceneIds.has(scene.id),
          );
        }
      }
    }

    await writeTeacherProject(updated);
    return apiSuccess(idMapping ? { project: updated, idMapping } : { project: updated });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to patch teacher project',
      error instanceof Error ? error.message : String(error),
    );
  }
}
```

> 实现注意：`PATCH` 函数复用文件顶部已存在的 `getProjectId / isRecord` 等 helper；`structuredClone` 在测试 mock 里用于隔离。

- [ ] **步骤 8：测试通过**

```bash
pnpm test tests/teacher/patch-api.test.ts tests/teacher/chapter-diff.test.ts --run
```

预期：所有 test pass。

- [ ] **步骤 9：commit**

```bash
git add lib/teacher/chapter-diff.ts tests/teacher/chapter-diff.test.ts \
        app/api/teacher/projects/[projectId]/route.ts tests/teacher/patch-api.test.ts
git commit -m "feat(teacher): add PATCH /projects/{id} with chapter diff"
```

### 任务 1.4：`generate-outline` 改造为单章模式

**文件：**
- 修改：`app/api/teacher/projects/[projectId]/generate-outline/route.ts`
- 修改：`tests/teacher/outline-api.test.ts`

- [ ] **步骤 1：扩展失败测试**

把 `tests/teacher/outline-api.test.ts` 中的现有用例修改为传入 `chapterId`，并新增「缺 chapterId → 400」用例：

```ts
test('returns 400 when chapterId is missing', async () => {
  const req = new Request('http://localhost/api/teacher/projects/p1/generate-outline', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const res = await POST(req as never, { params: Promise.resolve({ projectId: 'p1' }) });
  expect(res.status).toBe(400);
});

test('returns 400 when chapterId does not exist on project', async () => {
  const req = new Request('http://localhost/api/teacher/projects/p1/generate-outline', {
    method: 'POST',
    body: JSON.stringify({ chapterId: 'unknown-id' }),
  });
  const res = await POST(req as never, { params: Promise.resolve({ projectId: 'p1' }) });
  expect(res.status).toBe(400);
});
```

> 注意：保留并修订原有「成功」用例 —— 在 mock 的 `readTeacherProject` 返回里包含 `outline.chapters` 含一个 id 为 `'ch-target'` 的章节，并把请求体改成 `{ chapterId: 'ch-target' }`。

- [ ] **步骤 2：运行测试确认失败**

```bash
pnpm test tests/teacher/outline-api.test.ts --run
```

预期：新 test fail，旧成功 test 也 fail（因为现在还没接受 chapterId）。

- [ ] **步骤 3：实现单章模式**

把 `app/api/teacher/projects/[projectId]/generate-outline/route.ts` 整个 POST handler 替换为：

```ts
import { type NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { generateSceneOutlinesFromRequirements } from '@/lib/generation/outline-generator';
import { createLogger } from '@/lib/logger';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';
import {
  isValidTeacherProjectId,
  readTeacherProject,
  writeTeacherProject,
} from '@/lib/teacher/course-project-storage';

type GenerateOutlineRouteContext = {
  params: Promise<{ projectId: string }>;
};

const log = createLogger('Teacher Outline API');

export const maxDuration = 300;

export async function POST(request: NextRequest, context: GenerateOutlineRouteContext) {
  try {
    const { projectId } = await context.params;
    if (!isValidTeacherProjectId(projectId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
    }

    const project = await readTeacherProject(projectId);
    if (!project) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
    }

    let body: { chapterId?: unknown };
    try {
      body = (await request.json()) as { chapterId?: unknown };
    } catch {
      body = {};
    }

    if (typeof body.chapterId !== 'string' || body.chapterId.length === 0) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'chapterId is required');
    }
    const chapterId = body.chapterId;

    const chapter = project.outline?.chapters.find((c) => c.id === chapterId);
    if (!chapter) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'chapter not found on project');
    }

    const { model: languageModel, modelInfo, thinkingConfig } = await resolveModelFromRequest(
      request,
      body,
    );
    const aiCall = async (systemPrompt: string, userPrompt: string): Promise<string> => {
      const result = await callLLM(
        {
          model: languageModel,
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: modelInfo?.outputWindow,
        },
        'teacher-outline-chapter',
        undefined,
        thinkingConfig,
      );
      return result.text;
    };

    const teacherContext = buildTeacherContext(project, chapter);
    const baseRequirements = {
      ...project.requirements,
      requirement: project.overview?.trim() || project.requirements.requirement,
    };

    const result = await generateSceneOutlinesFromRequirements(
      baseRequirements,
      undefined,
      undefined,
      aiCall,
      undefined,
      { teacherContext },
    );
    if (!result.success || !result.data) {
      log.error('Failed to generate teacher chapter outline:', result.error);
      return apiError(
        API_ERROR_CODES.GENERATION_FAILED,
        500,
        'Failed to generate chapter outline',
      );
    }

    const sceneOutlines = result.data.outlines.map((outline, index) => ({
      ...outline,
      order: index,
    }));

    const updatedChapter: CourseChapter = {
      ...chapter,
      sceneOutlines,
      status: 'draft',
      dirty: false,
    };

    const updatedProject: CourseProject = {
      ...project,
      outline: project.outline
        ? {
            ...project.outline,
            languageDirective: result.data.languageDirective ?? project.outline.languageDirective,
            chapters: project.outline.chapters.map((c) =>
              c.id === chapterId ? updatedChapter : c,
            ),
          }
        : undefined,
      status: 'outlining',
      updatedAt: new Date().toISOString(),
    };
    await writeTeacherProject(updatedProject);

    return apiSuccess({ project: updatedProject, chapter: updatedChapter });
  } catch (error) {
    log.error('Teacher chapter outline generation route failed:', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to generate teacher chapter outline',
    );
  }
}

function buildTeacherContext(project: CourseProject, chapter: CourseChapter): string {
  const lines: string[] = [];
  lines.push(`This is one chapter of a teacher-authored course titled "${project.title}".`);
  lines.push(`Course overview: ${project.overview ?? project.requirements.requirement}`);
  lines.push(`Chapter title: ${chapter.title}`);
  if (chapter.summary) lines.push(`Chapter summary: ${chapter.summary}`);
  if (chapter.learningObjectives.length > 0) {
    lines.push('Chapter learning objectives:');
    for (const objective of chapter.learningObjectives) {
      lines.push(`- ${objective}`);
    }
  }
  lines.push('Generate scene outlines for THIS chapter only.');
  return lines.join('\n');
}
```

- [ ] **步骤 4：测试通过**

```bash
pnpm test tests/teacher/outline-api.test.ts --run
```

预期：所有 test pass（如果旧测试 mock 没含 outline.chapters，需要在 mock 里补上）。

- [ ] **步骤 5：commit**

```bash
git add app/api/teacher/projects/[projectId]/generate-outline/route.ts tests/teacher/outline-api.test.ts
git commit -m "feat(teacher): generate-outline now per-chapter (chapterId required)"
```

### 任务 1.5：删除 suggest endpoint 与 submission helper

**文件：**
- 删除：`app/api/teacher/projects/suggest/route.ts`
- 删除：`lib/teacher/teacher-suggest-client.ts`
- 删除：`lib/teacher/course-project-submission.ts`
- 删除：`tests/teacher/course-project-submission.test.ts`

- [ ] **步骤 1：删除文件**

```bash
git rm app/api/teacher/projects/suggest/route.ts \
       lib/teacher/teacher-suggest-client.ts \
       lib/teacher/course-project-submission.ts \
       tests/teacher/course-project-submission.test.ts
```

> 注意：因为这些文件都是当前未提交的 untracked 文件，`git rm` 会失败；改用普通的 `rm` 或 PowerShell 的 `Remove-Item`。

替代命令（PowerShell）：

```powershell
Remove-Item app/api/teacher/projects/suggest/route.ts
Remove-Item lib/teacher/teacher-suggest-client.ts
Remove-Item lib/teacher/course-project-submission.ts
Remove-Item tests/teacher/course-project-submission.test.ts
# 同时删除可能空掉的 suggest 目录
Remove-Item app/api/teacher/projects/suggest -Recurse -Force -ErrorAction SilentlyContinue
```

- [ ] **步骤 2：grep 确认没有引用残留**

```bash
rg "teacher-suggest-client|course-project-submission|teacher/projects/suggest" --hidden -g '!*.lock' -g '!data/**'
```

预期：无匹配（如有，删除引用）。

- [ ] **步骤 3：typecheck + test**

```bash
npx tsc --noEmit
pnpm test tests/teacher --run
```

预期：通过。

- [ ] **步骤 4：commit**

```bash
git add -A
git commit -m "chore(teacher): remove unused suggest endpoint and submission helper"
```

---

## 阶段 2：AI 工具集替换

### 任务 2.1：客户端 design-shell-reducer（应用 AI 工具调用）

**文件：**
- 创建：`lib/teacher/design-shell-reducer.ts`
- 创建：`tests/teacher/design-shell-reducer.test.ts`

- [ ] **步骤 1：写失败测试**

创建 `tests/teacher/design-shell-reducer.test.ts`：

```ts
import { describe, expect, test } from 'vitest';
import {
  applyToolCall,
  createDesignShellState,
  type DesignShellState,
} from '@/lib/teacher/design-shell-reducer';

function fresh(): DesignShellState {
  return createDesignShellState();
}

describe('design-shell-reducer', () => {
  test('update_overview replaces overview', () => {
    const state = fresh();
    const next = applyToolCall(state, {
      toolName: 'update_overview',
      input: { overview: 'New course overview' },
    });
    expect(next.state.overview).toBe('New course overview');
    expect(next.event?.kind).toBe('overviewUpdated');
  });

  test('add_chapter assigns ai-N id and appends', () => {
    const state = fresh();
    const next = applyToolCall(state, {
      toolName: 'add_chapter',
      input: { title: 'Ch1', learningObjectives: ['L1'], summary: 'S1' },
    });
    expect(next.state.chapters).toHaveLength(1);
    expect(next.state.chapters[0].id).toBe('ai-1');
    expect(next.state.chapters[0].title).toBe('Ch1');
    expect(next.event?.kind).toBe('chapterAdded');
  });

  test('add_chapter with afterChapterId inserts after that chapter', () => {
    let s = fresh();
    s = applyToolCall(s, { toolName: 'add_chapter', input: { title: 'A', learningObjectives: [], summary: '' } }).state;
    s = applyToolCall(s, { toolName: 'add_chapter', input: { title: 'B', learningObjectives: [], summary: '' } }).state;
    const next = applyToolCall(s, {
      toolName: 'add_chapter',
      input: { afterChapterId: 'ai-1', title: 'X', learningObjectives: [], summary: '' },
    });
    expect(next.state.chapters.map((c) => c.title)).toEqual(['A', 'X', 'B']);
  });

  test('update_chapter patches existing chapter', () => {
    let s = fresh();
    s = applyToolCall(s, {
      toolName: 'add_chapter',
      input: { title: 'Old', learningObjectives: [], summary: '' },
    }).state;
    const next = applyToolCall(s, {
      toolName: 'update_chapter',
      input: { chapterId: 'ai-1', patch: { title: 'New', summary: 'S' } },
    });
    expect(next.state.chapters[0].title).toBe('New');
    expect(next.state.chapters[0].summary).toBe('S');
    expect(next.event?.kind).toBe('chapterUpdated');
  });

  test('update_chapter on unknown id is a no-op with skip event', () => {
    const state = fresh();
    const next = applyToolCall(state, {
      toolName: 'update_chapter',
      input: { chapterId: 'nope', patch: { title: 'X' } },
    });
    expect(next.state).toBe(state);
    expect(next.event?.kind).toBe('skipped');
    expect(next.event?.reason).toContain('unknown chapter');
  });

  test('remove_chapter drops the chapter', () => {
    let s = fresh();
    s = applyToolCall(s, { toolName: 'add_chapter', input: { title: 'A', learningObjectives: [], summary: '' } }).state;
    s = applyToolCall(s, { toolName: 'add_chapter', input: { title: 'B', learningObjectives: [], summary: '' } }).state;
    const next = applyToolCall(s, { toolName: 'remove_chapter', input: { chapterId: 'ai-1' } });
    expect(next.state.chapters.map((c) => c.title)).toEqual(['B']);
    expect(next.event?.kind).toBe('chapterRemoved');
  });

  test('reorder_chapters with full permutation succeeds', () => {
    let s = fresh();
    s = applyToolCall(s, { toolName: 'add_chapter', input: { title: 'A', learningObjectives: [], summary: '' } }).state;
    s = applyToolCall(s, { toolName: 'add_chapter', input: { title: 'B', learningObjectives: [], summary: '' } }).state;
    const next = applyToolCall(s, {
      toolName: 'reorder_chapters',
      input: { order: ['ai-2', 'ai-1'] },
    });
    expect(next.state.chapters.map((c) => c.title)).toEqual(['B', 'A']);
    expect(next.event?.kind).toBe('chaptersReordered');
  });

  test('reorder_chapters with mismatched order is skipped', () => {
    let s = fresh();
    s = applyToolCall(s, { toolName: 'add_chapter', input: { title: 'A', learningObjectives: [], summary: '' } }).state;
    s = applyToolCall(s, { toolName: 'add_chapter', input: { title: 'B', learningObjectives: [], summary: '' } }).state;
    const next = applyToolCall(s, {
      toolName: 'reorder_chapters',
      input: { order: ['ai-1'] },
    });
    expect(next.state).toBe(s);
    expect(next.event?.kind).toBe('skipped');
  });

  test('unknown tool name is skipped', () => {
    const state = fresh();
    const next = applyToolCall(state, { toolName: 'nuke_everything', input: {} });
    expect(next.state).toBe(state);
    expect(next.event?.kind).toBe('skipped');
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
pnpm test tests/teacher/design-shell-reducer.test.ts --run
```

预期：fail。

- [ ] **步骤 3：实现 reducer**

创建 `lib/teacher/design-shell-reducer.ts`：

```ts
export interface ChapterDraft {
  id: string;
  title: string;
  learningObjectives: string[];
  summary: string;
}

export interface DesignShellState {
  overview: string;
  chapters: ChapterDraft[];
  aiCounter: number;
}

export type ToolEventKind =
  | 'overviewUpdated'
  | 'chapterAdded'
  | 'chapterUpdated'
  | 'chapterRemoved'
  | 'chaptersReordered'
  | 'skipped';

export interface ToolEvent {
  id: string;
  kind: ToolEventKind;
  /** Display label hint (e.g., chapter title) */
  label?: string;
  reason?: string;
  affectedChapterId?: string;
}

export interface ApplyToolCallResult {
  state: DesignShellState;
  event?: ToolEvent;
}

export interface ToolCallPayload {
  toolName: string;
  input: unknown;
}

export function createDesignShellState(): DesignShellState {
  return { overview: '', chapters: [], aiCounter: 0 };
}

function makeEventId(): string {
  return `evt_${Math.random().toString(36).slice(2, 10)}`;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((entry) => typeof entry === 'string')) return null;
  return value as string[];
}

export function applyToolCall(
  state: DesignShellState,
  call: ToolCallPayload,
): ApplyToolCallResult {
  if (typeof call.input !== 'object' || call.input === null) {
    return { state, event: { id: makeEventId(), kind: 'skipped', reason: 'invalid input' } };
  }
  const input = call.input as Record<string, unknown>;

  switch (call.toolName) {
    case 'update_overview': {
      const overview = readString(input.overview);
      if (overview === null) {
        return { state, event: { id: makeEventId(), kind: 'skipped', reason: 'overview must be string' } };
      }
      return {
        state: { ...state, overview },
        event: { id: makeEventId(), kind: 'overviewUpdated' },
      };
    }
    case 'add_chapter': {
      const title = readString(input.title);
      const objectives = readStringArray(input.learningObjectives);
      const summary = readString(input.summary);
      if (!title || !objectives || summary === null) {
        return { state, event: { id: makeEventId(), kind: 'skipped', reason: 'add_chapter missing fields' } };
      }
      const afterId = readString(input.afterChapterId);
      const nextCounter = state.aiCounter + 1;
      const newChapter: ChapterDraft = {
        id: `ai-${nextCounter}`,
        title,
        learningObjectives: objectives,
        summary,
      };
      let chapters: ChapterDraft[];
      if (afterId) {
        const idx = state.chapters.findIndex((chapter) => chapter.id === afterId);
        if (idx === -1) {
          chapters = [...state.chapters, newChapter];
        } else {
          chapters = [
            ...state.chapters.slice(0, idx + 1),
            newChapter,
            ...state.chapters.slice(idx + 1),
          ];
        }
      } else {
        chapters = [...state.chapters, newChapter];
      }
      return {
        state: { ...state, chapters, aiCounter: nextCounter },
        event: {
          id: makeEventId(),
          kind: 'chapterAdded',
          label: title,
          affectedChapterId: newChapter.id,
        },
      };
    }
    case 'update_chapter': {
      const chapterId = readString(input.chapterId);
      const patch = input.patch as Record<string, unknown> | undefined;
      if (!chapterId || typeof patch !== 'object' || patch === null) {
        return { state, event: { id: makeEventId(), kind: 'skipped', reason: 'update_chapter missing fields' } };
      }
      const idx = state.chapters.findIndex((chapter) => chapter.id === chapterId);
      if (idx === -1) {
        return {
          state,
          event: { id: makeEventId(), kind: 'skipped', reason: `unknown chapter ${chapterId}` },
        };
      }
      const current = state.chapters[idx];
      const nextChapter: ChapterDraft = { ...current };
      if (typeof patch.title === 'string') nextChapter.title = patch.title;
      const objectives = readStringArray(patch.learningObjectives);
      if (objectives) nextChapter.learningObjectives = objectives;
      if (typeof patch.summary === 'string') nextChapter.summary = patch.summary;
      const chapters = [...state.chapters];
      chapters[idx] = nextChapter;
      return {
        state: { ...state, chapters },
        event: {
          id: makeEventId(),
          kind: 'chapterUpdated',
          label: nextChapter.title,
          affectedChapterId: chapterId,
        },
      };
    }
    case 'remove_chapter': {
      const chapterId = readString(input.chapterId);
      if (!chapterId) {
        return { state, event: { id: makeEventId(), kind: 'skipped', reason: 'remove_chapter missing id' } };
      }
      const target = state.chapters.find((chapter) => chapter.id === chapterId);
      if (!target) {
        return {
          state,
          event: { id: makeEventId(), kind: 'skipped', reason: `unknown chapter ${chapterId}` },
        };
      }
      return {
        state: {
          ...state,
          chapters: state.chapters.filter((chapter) => chapter.id !== chapterId),
        },
        event: {
          id: makeEventId(),
          kind: 'chapterRemoved',
          label: target.title,
          affectedChapterId: chapterId,
        },
      };
    }
    case 'reorder_chapters': {
      const order = readStringArray(input.order);
      if (!order || order.length !== state.chapters.length) {
        return {
          state,
          event: { id: makeEventId(), kind: 'skipped', reason: 'order mismatch' },
        };
      }
      const map = new Map(state.chapters.map((chapter) => [chapter.id, chapter]));
      const reordered: ChapterDraft[] = [];
      for (const id of order) {
        const chapter = map.get(id);
        if (!chapter) {
          return {
            state,
            event: { id: makeEventId(), kind: 'skipped', reason: `unknown id ${id} in order` },
          };
        }
        reordered.push(chapter);
      }
      return {
        state: { ...state, chapters: reordered },
        event: { id: makeEventId(), kind: 'chaptersReordered' },
      };
    }
    default:
      return {
        state,
        event: { id: makeEventId(), kind: 'skipped', reason: `unknown tool ${call.toolName}` },
      };
  }
}
```

- [ ] **步骤 4：测试通过**

```bash
pnpm test tests/teacher/design-shell-reducer.test.ts --run
```

预期：所有 test pass。

- [ ] **步骤 5：commit**

```bash
git add lib/teacher/design-shell-reducer.ts tests/teacher/design-shell-reducer.test.ts
git commit -m "feat(teacher): add design shell reducer for AI tool calls"
```

### 任务 2.2：refine API 工具集替换 + system prompt 重写

**文件：**
- 修改：`app/api/teacher/projects/refine/route.ts`
- 修改：`lib/teacher/teacher-refine-client.ts`

- [ ] **步骤 1：替换 refine route 工具集**

把 `app/api/teacher/projects/refine/route.ts` 整文件替换为：

```ts
import { type NextRequest } from 'next/server';
import { tool } from 'ai';
import { z } from 'zod';

import { streamLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { API_ERROR_CODES, apiError } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';

const log = createLogger('Teacher Project Refine API');

export const maxDuration = 120;

const MAX_MESSAGES = 24;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_REQUIREMENT_LENGTH = 8000;
const MAX_OVERVIEW_LENGTH = 4000;
const MAX_TITLE_LENGTH = 200;
const MAX_OBJECTIVE_LENGTH = 200;
const MAX_OBJECTIVES_PER_CHAPTER = 12;
const MAX_SUMMARY_LENGTH = 1500;
const MAX_CHAPTERS = 12;
const HEARTBEAT_INTERVAL_MS = 15_000;

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChapterSnapshot {
  id: string;
  title: string;
  learningObjectives: string[];
  summary: string;
}

interface FormStatePayload {
  overview: string;
  chapters: ChapterSnapshot[];
}

interface RefineRequestBody {
  formState?: unknown;
  messages?: unknown;
  baseRequirement?: unknown;
}

export async function POST(request: NextRequest) {
  let body: RefineRequestBody;
  try {
    body = (await request.json()) as RefineRequestBody;
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      400,
      'Request body must be valid JSON',
      error instanceof Error ? error.message : String(error),
    );
  }

  const formState = normalizeFormState(body.formState);
  if (!formState) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid formState payload');
  }

  const messages = normalizeMessages(body.messages);
  if (!messages || messages.length === 0) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'messages is required');
  }
  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role !== 'user') {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'last message must come from user');
  }

  const baseRequirement =
    typeof body.baseRequirement === 'string'
      ? body.baseRequirement.slice(0, MAX_REQUIREMENT_LENGTH)
      : '';

  let resolved;
  try {
    resolved = await resolveModelFromRequest(request, body);
  } catch (error) {
    log.error('Failed to resolve model for teacher refine:', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to resolve model',
      error instanceof Error ? error.message : String(error),
    );
  }

  const { model: languageModel, modelInfo, thinkingConfig } = resolved;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const startHeartbeat = () => {
        stopHeartbeat();
        heartbeatTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`:heartbeat\n\n`));
          } catch {
            stopHeartbeat();
          }
        }, HEARTBEAT_INTERVAL_MS);
      };
      const stopHeartbeat = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      };

      try {
        startHeartbeat();
        send({ type: 'start' });

        const result = streamLLM(
          {
            model: languageModel,
            system: buildSystemPrompt(),
            prompt: buildUserPrompt({ formState, baseRequirement, messages }),
            maxOutputTokens: modelInfo?.outputWindow,
            tools: buildRefineTools(),
          },
          'teacher-project-refine',
          thinkingConfig,
        );

        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            if (part.text) send({ type: 'reply-delta', delta: part.text });
          } else if (part.type === 'reasoning-delta') {
            if (part.text) send({ type: 'reasoning-delta', delta: part.text });
          } else if (part.type === 'tool-call') {
            send({
              type: 'tool-call',
              toolName: part.toolName as string,
              input: part.input,
            });
          } else if (part.type === 'error') {
            const message = part.error instanceof Error ? part.error.message : String(part.error);
            log.warn('Stream error chunk:', message);
            send({ type: 'error', error: message });
          }
        }

        send({ type: 'done' });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error('Teacher refine stream failed:', error);
        send({ type: 'error', error: message });
      } finally {
        stopHeartbeat();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

function buildRefineTools() {
  return {
    update_overview: tool({
      description:
        'Replace the entire course overview shown in the workbench. Use whenever you redraft the course summary. The overview should be a coherent paragraph (1-3 short paragraphs total).',
      inputSchema: z.object({
        overview: z.string().min(1).max(MAX_OVERVIEW_LENGTH),
      }),
    }),
    add_chapter: tool({
      description:
        'Append a new chapter (or insert after a given chapterId). Provide title, learningObjectives (1-6 short bullet strings), and summary (1-2 sentence chapter synopsis). Do NOT include an id field — the client allocates a temporary id.',
      inputSchema: z.object({
        afterChapterId: z.string().optional(),
        title: z.string().min(1).max(MAX_TITLE_LENGTH),
        learningObjectives: z
          .array(z.string().min(1).max(MAX_OBJECTIVE_LENGTH))
          .max(MAX_OBJECTIVES_PER_CHAPTER),
        summary: z.string().max(MAX_SUMMARY_LENGTH),
      }),
    }),
    update_chapter: tool({
      description:
        'Patch an existing chapter by chapterId. Only include fields you want to change in the patch object.',
      inputSchema: z.object({
        chapterId: z.string().min(1),
        patch: z
          .object({
            title: z.string().min(1).max(MAX_TITLE_LENGTH).optional(),
            learningObjectives: z
              .array(z.string().min(1).max(MAX_OBJECTIVE_LENGTH))
              .max(MAX_OBJECTIVES_PER_CHAPTER)
              .optional(),
            summary: z.string().max(MAX_SUMMARY_LENGTH).optional(),
          })
          .refine((value) => Object.keys(value).length > 0, {
            message: 'patch must have at least one field',
          }),
      }),
    }),
    remove_chapter: tool({
      description: 'Delete a chapter from the course outline by chapterId.',
      inputSchema: z.object({
        chapterId: z.string().min(1),
      }),
    }),
    reorder_chapters: tool({
      description:
        'Reorder all chapters. The order array MUST contain every existing chapterId exactly once.',
      inputSchema: z.object({
        order: z.array(z.string().min(1)).min(1).max(MAX_CHAPTERS),
      }),
    }),
  };
}

function buildSystemPrompt(): string {
  return [
    'You are an instructional design assistant working with a teacher in a real-time course design workbench.',
    'The workbench has TWO editable areas:',
    '  1. Course overview — a paragraph that frames the entire course (you manage via update_overview).',
    '  2. Chapter list — an ordered array of chapters; each chapter has { title, learningObjectives, summary }.',
    '',
    'Tools available (each call instantly applies to the workbench, no confirmation needed):',
    '  - update_overview({ overview })',
    '  - add_chapter({ afterChapterId?, title, learningObjectives, summary })  // do NOT include an id field',
    '  - update_chapter({ chapterId, patch: { title?, learningObjectives?, summary? } })',
    '  - remove_chapter({ chapterId })',
    '  - reorder_chapters({ order })',
    '',
    'Behavior:',
    '- Reply naturally in the same language the teacher uses, in 1-3 sentences explaining what you propose. Never paste field values verbatim into the reply text.',
    '- Bootstrap mode (overview is empty): you MUST call update_overview ONCE and at least 3 add_chapter calls to seed a meaningful course. The teacher\'s first message is the raw design intent.',
    '- Follow-up mode (overview already populated): only modify what the teacher explicitly asks for. Do not re-order or re-write unrelated chapters.',
    '- DO NOT add_chapter and then update_chapter / remove_chapter the same new chapter in the same turn — you cannot reference its id; let the teacher follow up if needed.',
    '- Treat chapterId values as opaque strings. They appear in the user prompt rendering as `[id=xxxxx]` next to each chapter title.',
  ].join('\n');
}

function buildUserPrompt(input: {
  formState: FormStatePayload;
  baseRequirement: string;
  messages: ChatMessage[];
}): string {
  const transcript = input.messages
    .map((message) => `${message.role === 'user' ? 'Teacher' : 'Assistant'}: ${message.content}`)
    .join('\n');

  const sections: string[] = [];
  sections.push('Current course overview:');
  sections.push(input.formState.overview ? input.formState.overview : '(empty)');
  sections.push('');
  sections.push(`Current chapters (${input.formState.chapters.length}):`);
  if (input.formState.chapters.length === 0) {
    sections.push('(none)');
  } else {
    input.formState.chapters.forEach((chapter, index) => {
      sections.push(
        `  ${index + 1}. [id=${chapter.id}] ${chapter.title}`,
      );
      if (chapter.summary) sections.push(`     summary: ${chapter.summary}`);
      if (chapter.learningObjectives.length > 0) {
        for (const objective of chapter.learningObjectives) {
          sections.push(`     - ${objective}`);
        }
      }
    });
  }

  if (input.baseRequirement) {
    sections.push('', 'Original homepage requirement (anchor):', input.baseRequirement);
  }

  sections.push('', 'Conversation so far:', transcript);

  return sections.join('\n');
}

function normalizeFormState(value: unknown): FormStatePayload | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.overview !== 'string') return null;
  if (!Array.isArray(candidate.chapters)) return null;
  const chapters: ChapterSnapshot[] = [];
  for (const entry of candidate.chapters.slice(0, MAX_CHAPTERS)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || typeof e.title !== 'string') continue;
    if (!Array.isArray(e.learningObjectives)) continue;
    chapters.push({
      id: e.id,
      title: e.title.slice(0, MAX_TITLE_LENGTH),
      learningObjectives: (e.learningObjectives as unknown[])
        .filter((line): line is string => typeof line === 'string')
        .map((line) => line.slice(0, MAX_OBJECTIVE_LENGTH))
        .slice(0, MAX_OBJECTIVES_PER_CHAPTER),
      summary: typeof e.summary === 'string' ? e.summary.slice(0, MAX_SUMMARY_LENGTH) : '',
    });
  }
  return {
    overview: candidate.overview.slice(0, MAX_OVERVIEW_LENGTH),
    chapters,
  };
}

function normalizeMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value)) return null;
  const trimmed = value.slice(-MAX_MESSAGES);
  const messages: ChatMessage[] = [];
  for (const entry of trimmed) {
    if (typeof entry !== 'object' || entry === null) continue;
    const candidate = entry as Partial<ChatMessage>;
    if (
      (candidate.role !== 'user' && candidate.role !== 'assistant') ||
      typeof candidate.content !== 'string'
    ) {
      continue;
    }
    const content = candidate.content.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!content) continue;
    messages.push({ role: candidate.role, content });
  }
  return messages;
}
```

- [ ] **步骤 2：重写 refine client（解析 tool-call 事件）**

把 `lib/teacher/teacher-refine-client.ts` 替换为：

```ts
import {
  getTeacherGenerationHeaders,
  withCurrentTeacherThinkingConfig,
} from '@/lib/teacher/client-generation-config';

export interface ChapterSnapshot {
  id: string;
  title: string;
  learningObjectives: string[];
  summary: string;
}

export interface CourseProjectFormState {
  overview: string;
  chapters: ChapterSnapshot[];
}

export type ChatRole = 'user' | 'assistant';

export interface ChatTranscriptMessage {
  role: ChatRole;
  content: string;
}

export interface ToolCallPayload {
  toolName: string;
  input: unknown;
}

export interface CourseProjectStreamCallbacks {
  onStart?: () => void;
  onReplyDelta: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onToolCall: (call: ToolCallPayload) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

interface CourseProjectStreamParams {
  formState: CourseProjectFormState;
  messages: ChatTranscriptMessage[];
  baseRequirement?: string;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  callbacks: CourseProjectStreamCallbacks;
}

export interface CourseProjectStreamResult {
  status: 'completed' | 'aborted' | 'failed';
  error?: string;
}

export async function streamCourseProjectRefine({
  formState,
  messages,
  baseRequirement,
  signal,
  fetcher = fetch,
  callbacks,
}: CourseProjectStreamParams): Promise<CourseProjectStreamResult> {
  let response: Response;
  try {
    response = await fetcher('/api/teacher/projects/refine', {
      method: 'POST',
      headers: getTeacherGenerationHeaders(),
      body: JSON.stringify(
        withCurrentTeacherThinkingConfig({
          formState,
          messages,
          baseRequirement: baseRequirement ?? '',
        }),
      ),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) return { status: 'aborted' };
    const message = error instanceof Error ? error.message : String(error);
    callbacks.onError(message);
    return { status: 'failed', error: message };
  }

  if (!response.ok || !response.body) {
    let detail = `HTTP ${response.status}`;
    try {
      const text = await response.text();
      if (text) detail = text;
    } catch {
      /* ignore */
    }
    callbacks.onError(detail);
    return { status: 'failed', error: detail };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let streamError: string | null = null;
  let didFinish = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex !== -1) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        separatorIndex = buffer.indexOf('\n\n');

        const dataLines = rawEvent
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart());
        if (dataLines.length === 0) continue;

        const payload = dataLines.join('\n');
        let event: unknown;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }

        const result = handleEvent(event, callbacks);
        if (result === 'done') didFinish = true;
        else if (typeof result === 'string') streamError = result;
      }
    }
  } catch (error) {
    if (isAbortError(error)) return { status: 'aborted' };
    const message = error instanceof Error ? error.message : String(error);
    if (!streamError) callbacks.onError(message);
    return { status: 'failed', error: streamError ?? message };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  if (streamError) return { status: 'failed', error: streamError };
  if (!didFinish) callbacks.onDone();
  return { status: 'completed' };
}

function handleEvent(
  event: unknown,
  callbacks: CourseProjectStreamCallbacks,
): 'done' | 'continue' | string {
  if (!event || typeof event !== 'object') return 'continue';
  const candidate = event as { type?: unknown };

  if (candidate.type === 'start') {
    callbacks.onStart?.();
    return 'continue';
  }
  if (candidate.type === 'reply-delta') {
    const delta = (event as { delta?: unknown }).delta;
    if (typeof delta === 'string' && delta.length > 0) callbacks.onReplyDelta(delta);
    return 'continue';
  }
  if (candidate.type === 'reasoning-delta') {
    const delta = (event as { delta?: unknown }).delta;
    if (typeof delta === 'string' && delta.length > 0 && callbacks.onReasoningDelta) {
      callbacks.onReasoningDelta(delta);
    }
    return 'continue';
  }
  if (candidate.type === 'tool-call') {
    const toolName = (event as { toolName?: unknown }).toolName;
    const input = (event as { input?: unknown }).input;
    if (typeof toolName === 'string') {
      callbacks.onToolCall({ toolName, input });
    }
    return 'continue';
  }
  if (candidate.type === 'done') {
    callbacks.onDone();
    return 'done';
  }
  if (candidate.type === 'error') {
    const errorValue = (event as { error?: unknown }).error;
    const message = typeof errorValue === 'string' ? errorValue : 'Unknown stream error';
    callbacks.onError(message);
    return message;
  }
  return 'continue';
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}
```

- [ ] **步骤 3：typecheck（旧 shell 会有大量类型错误，没关系，这是为下阶段准备）**

```bash
npx tsc --noEmit
```

预期：会出现 `course-project-design-shell.tsx` / `course-project-form.tsx` / `course-project-chat.tsx` 引用旧 `CourseProjectField / CourseProjectFieldUpdate` 等类型的错误。这是预期的，将在阶段 3-4 修复。先把当前进展 commit。

- [ ] **步骤 4：扩展 refine route 的 schema 单测（snapshot 解析）**

把 `tests/teacher/assist-api.test.ts`（既有；当前覆盖 `/projects/refine` route）打开，把里面的请求 body 改为新格式，并新增以下用例：

```ts
test('rejects formState payload missing chapters array', async () => {
  const req = new Request('http://localhost/x', {
    method: 'POST',
    body: JSON.stringify({
      formState: { overview: 'x' }, // chapters 缺失
      messages: [{ role: 'user', content: 'hi' }],
    }),
  });
  const res = await POST(req as never);
  expect(res.status).toBe(400);
});

test('accepts new formState shape with overview + chapters', async () => {
  const req = new Request('http://localhost/x', {
    method: 'POST',
    body: JSON.stringify({
      formState: { overview: 'overview body', chapters: [{ id: 'c1', title: 'Ch1', learningObjectives: [], summary: '' }] },
      messages: [{ role: 'user', content: 'expand chapter 1' }],
    }),
  });
  const res = await POST(req as never);
  // 我们 mock streamLLM 让它立刻 done；route 至少应当 200
  expect(res.status).toBe(200);
});
```

> 注意：本 test 文件依赖 `streamLLM` mock；保持现有 mock 设置不动，只调整请求体形状与断言即可。

运行：

```bash
pnpm test tests/teacher/assist-api.test.ts --run
```

预期：通过。

- [ ] **步骤 5：commit（暂时跳过 typecheck，下个任务会修）**

```bash
git add app/api/teacher/projects/refine/route.ts lib/teacher/teacher-refine-client.ts tests/teacher/assist-api.test.ts
git commit -m "feat(teacher): replace refine API tools with overview + chapter ops"
```

---

## 阶段 3：客户端持久化 helper

### 任务 3.1：`teacher-projects-client` （POST + PATCH 封装）

**文件：**
- 创建：`lib/teacher/teacher-projects-client.ts`

> 这是一个简单的 fetch 封装，没有需要测的复杂逻辑（错误路径在 e2e 里覆盖）。直接实现即可，跳过 TDD。

- [ ] **步骤 1：创建文件**

```ts
import type { CourseProject } from '@/lib/teacher/course-types';
import type { ChapterSnapshot } from '@/lib/teacher/teacher-refine-client';

export interface CreateProjectInput {
  requirement?: string;
  overview?: string;
  chapters?: Array<{
    title: string;
    learningObjectives: string[];
    summary?: string;
  }>;
  title?: string;
  targetAudience?: string;
  durationMinutes?: number;
}

export interface PatchProjectInput {
  title?: string;
  overview?: string;
  chapters?: Array<{
    id: string;
    title: string;
    learningObjectives: string[];
    summary?: string;
  }>;
}

export interface PatchProjectResult {
  project: CourseProject;
  idMapping?: Record<string, string>;
}

export async function createTeacherProject(
  input: CreateProjectInput,
  fetcher: typeof fetch = fetch,
): Promise<CourseProject> {
  const response = await fetcher('/api/teacher/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await response.json()) as { success?: boolean; project?: CourseProject };
  if (!response.ok || !json.success || !json.project) {
    throw new Error(`Failed to create teacher project: HTTP ${response.status}`);
  }
  return json.project;
}

export async function patchTeacherProject(
  projectId: string,
  input: PatchProjectInput,
  fetcher: typeof fetch = fetch,
): Promise<PatchProjectResult> {
  const response = await fetcher(`/api/teacher/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await response.json()) as {
    success?: boolean;
    project?: CourseProject;
    idMapping?: Record<string, string>;
  };
  if (!response.ok || !json.success || !json.project) {
    throw new Error(`Failed to patch teacher project: HTTP ${response.status}`);
  }
  return { project: json.project, idMapping: json.idMapping };
}

export function chaptersToPatch(
  chapters: ChapterSnapshot[],
): NonNullable<PatchProjectInput['chapters']> {
  return chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    learningObjectives: chapter.learningObjectives,
    summary: chapter.summary,
  }));
}
```

- [ ] **步骤 2：commit**

```bash
git add lib/teacher/teacher-projects-client.ts
git commit -m "feat(teacher): add client helpers for POST/PATCH /projects"
```

---

## 阶段 4：工作台 UI 组件

### 任务 4.1：`CourseOverviewBlock` 组件

**文件：**
- 创建：`components/teacher/design-workbench/course-overview-block.tsx`

> UI 组件单独跑测较重，依赖 e2e 来验证渲染。本任务只验证 typecheck + 视觉 demo。

- [ ] **步骤 1：实现组件**

```tsx
'use client';

import { Wand2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

export interface CourseOverviewBlockProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly disabled?: boolean;
  readonly highlighted?: boolean;
}

export function CourseOverviewBlock({
  value,
  onChange,
  disabled = false,
  highlighted = false,
}: CourseOverviewBlockProps) {
  const { t } = useI18n();

  return (
    <section
      className={cn(
        'rounded-2xl border border-slate-200/70 bg-white/85 p-5 shadow-sm backdrop-blur transition-all dark:border-slate-800 dark:bg-slate-900/85',
        highlighted &&
          'border-purple-300 ring-2 ring-purple-200 dark:border-purple-700 dark:ring-purple-900/50',
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {t('teacher.create.designWorkbench.overview.label')}
        </h2>
        {highlighted ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-200">
            <Wand2 className="h-3 w-3" />
            {t('teacher.create.designWorkbench.overview.aiUpdatedBadge')}
          </span>
        ) : null}
      </div>
      <Textarea
        className="min-h-40"
        value={value}
        disabled={disabled}
        placeholder={t('teacher.create.designWorkbench.overview.placeholder')}
        onChange={(event) => onChange(event.target.value)}
      />
    </section>
  );
}
```

- [ ] **步骤 2：commit**

```bash
git add components/teacher/design-workbench/course-overview-block.tsx
git commit -m "feat(teacher): add CourseOverviewBlock component"
```

### 任务 4.2：`ChapterCard` 组件（折叠 + 编辑 + 操作）

**文件：**
- 创建：`components/teacher/design-workbench/chapter-card.tsx`

- [ ] **步骤 1：实现组件**

```tsx
'use client';

import { ChevronDown, ChevronRight, Trash2, MoveUp, MoveDown, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import type { ChapterDraft } from '@/lib/teacher/design-shell-reducer';
import type { CourseChapterStatus } from '@/lib/teacher/course-types';

export interface ChapterCardProps {
  readonly index: number;
  readonly chapter: ChapterDraft;
  readonly status: CourseChapterStatus;
  readonly expanded: boolean;
  readonly highlighted: boolean;
  readonly disabled?: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly onToggleExpanded: () => void;
  readonly onChangeTitle: (next: string) => void;
  readonly onChangeObjectives: (lines: string[]) => void;
  readonly onChangeSummary: (next: string) => void;
  readonly onMoveUp: () => void;
  readonly onMoveDown: () => void;
  readonly onRemove: () => void;
}

const STATUS_BADGE_TONE: Record<CourseChapterStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  dirty: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  generating: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  ready: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
};

export function ChapterCard({
  index,
  chapter,
  status,
  expanded,
  highlighted,
  disabled = false,
  canMoveUp,
  canMoveDown,
  onToggleExpanded,
  onChangeTitle,
  onChangeObjectives,
  onChangeSummary,
  onMoveUp,
  onMoveDown,
  onRemove,
}: ChapterCardProps) {
  const { t } = useI18n();

  return (
    <article
      className={cn(
        'rounded-2xl border border-slate-200/70 bg-white/85 shadow-sm backdrop-blur transition-all dark:border-slate-800 dark:bg-slate-900/85',
        highlighted &&
          'border-purple-300 ring-2 ring-purple-200 dark:border-purple-700 dark:ring-purple-900/50',
      )}
    >
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          className="flex flex-1 items-center gap-2 text-left"
          onClick={onToggleExpanded}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-500" />
          )}
          <span className="text-xs font-medium text-purple-600 dark:text-purple-300">
            {t('teacher.create.designWorkbench.chapter.indexLabel', { index: index + 1 })}
          </span>
          <span className="font-medium">
            {chapter.title || t('teacher.create.designWorkbench.chapter.untitled')}
          </span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              STATUS_BADGE_TONE[status],
            )}
          >
            {t(`teacher.create.designWorkbench.chapter.statusBadge.${status}`)}
          </span>
          {highlighted ? <Wand2 className="h-3 w-3 text-purple-500" /> : null}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={disabled || !canMoveUp}
            aria-label={t('teacher.create.designWorkbench.chapter.moveUp')}
            onClick={onMoveUp}
          >
            <MoveUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={disabled || !canMoveDown}
            aria-label={t('teacher.create.designWorkbench.chapter.moveDown')}
            onClick={onMoveDown}
          >
            <MoveDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={disabled}
            aria-label={t('teacher.create.designWorkbench.chapter.remove')}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </header>
      {expanded ? (
        <div className="space-y-3 border-t border-slate-200 p-4 dark:border-slate-800">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {t('teacher.create.designWorkbench.chapter.titleLabel')}
            </label>
            <Input
              value={chapter.title}
              disabled={disabled}
              onChange={(event) => onChangeTitle(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {t('teacher.create.designWorkbench.chapter.objectivesLabel')}
            </label>
            <Textarea
              className="min-h-24"
              value={chapter.learningObjectives.join('\n')}
              disabled={disabled}
              placeholder={t('teacher.create.designWorkbench.chapter.objectivesPlaceholder')}
              onChange={(event) =>
                onChangeObjectives(
                  event.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              {t('teacher.create.designWorkbench.chapter.objectivesHelp')}
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {t('teacher.create.designWorkbench.chapter.summaryLabel')}
            </label>
            <Textarea
              className="min-h-20"
              value={chapter.summary}
              disabled={disabled}
              placeholder={t('teacher.create.designWorkbench.chapter.summaryPlaceholder')}
              onChange={(event) => onChangeSummary(event.target.value)}
            />
          </div>
        </div>
      ) : null}
    </article>
  );
}
```

- [ ] **步骤 2：commit**

```bash
git add components/teacher/design-workbench/chapter-card.tsx
git commit -m "feat(teacher): add ChapterCard component"
```

### 任务 4.3：`ChapterListBlock` 组件

**文件：**
- 创建：`components/teacher/design-workbench/chapter-list-block.tsx`

- [ ] **步骤 1：实现组件**

```tsx
'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { ChapterCard } from '@/components/teacher/design-workbench/chapter-card';
import type { ChapterDraft } from '@/lib/teacher/design-shell-reducer';
import type { CourseChapterStatus } from '@/lib/teacher/course-types';

export interface ChapterListBlockProps {
  readonly chapters: ChapterDraft[];
  readonly chapterStatuses: Record<string, CourseChapterStatus>;
  readonly highlightedChapterIds: ReadonlySet<string>;
  readonly expandedChapterIds: ReadonlySet<string>;
  readonly disabled?: boolean;
  readonly onToggleExpanded: (chapterId: string) => void;
  readonly onChangeChapter: (chapterId: string, patch: Partial<ChapterDraft>) => void;
  readonly onMoveChapter: (chapterId: string, direction: -1 | 1) => void;
  readonly onRemoveChapter: (chapterId: string) => void;
  readonly onAddChapter: () => void;
}

export function ChapterListBlock({
  chapters,
  chapterStatuses,
  highlightedChapterIds,
  expandedChapterIds,
  disabled = false,
  onToggleExpanded,
  onChangeChapter,
  onMoveChapter,
  onRemoveChapter,
  onAddChapter,
}: ChapterListBlockProps) {
  const { t } = useI18n();

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {t('teacher.create.designWorkbench.chapters.label', { count: chapters.length })}
        </h2>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onAddChapter}>
          <Plus className="mr-1 h-4 w-4" />
          {t('teacher.create.designWorkbench.chapters.addButton')}
        </Button>
      </header>
      {chapters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-center text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-900/60">
          {t('teacher.create.designWorkbench.chapters.empty')}
        </div>
      ) : (
        <ul className="space-y-3">
          {chapters.map((chapter, index) => (
            <li key={chapter.id}>
              <ChapterCard
                index={index}
                chapter={chapter}
                status={chapterStatuses[chapter.id] ?? 'draft'}
                expanded={expandedChapterIds.has(chapter.id)}
                highlighted={highlightedChapterIds.has(chapter.id)}
                disabled={disabled}
                canMoveUp={index > 0}
                canMoveDown={index < chapters.length - 1}
                onToggleExpanded={() => onToggleExpanded(chapter.id)}
                onChangeTitle={(next) => onChangeChapter(chapter.id, { title: next })}
                onChangeObjectives={(lines) =>
                  onChangeChapter(chapter.id, { learningObjectives: lines })
                }
                onChangeSummary={(next) => onChangeChapter(chapter.id, { summary: next })}
                onMoveUp={() => onMoveChapter(chapter.id, -1)}
                onMoveDown={() => onMoveChapter(chapter.id, 1)}
                onRemove={() => onRemoveChapter(chapter.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **步骤 2：commit**

```bash
git add components/teacher/design-workbench/chapter-list-block.tsx
git commit -m "feat(teacher): add ChapterListBlock component"
```

### 任务 4.4：`PersistenceIndicator` + `GenerateSlidesButton`

**文件：**
- 创建：`components/teacher/design-workbench/persistence-indicator.tsx`
- 创建：`components/teacher/design-workbench/generate-slides-button.tsx`

- [ ] **步骤 1：实现 PersistenceIndicator**

```tsx
'use client';

import { Check, Loader2, AlertCircle, FileEdit } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

export type PersistenceState = 'ephemeral' | 'saving' | 'saved' | 'error';

export interface PersistenceIndicatorProps {
  readonly state: PersistenceState;
  readonly lastSyncedAt?: number;
}

export function PersistenceIndicator({ state, lastSyncedAt }: PersistenceIndicatorProps) {
  const { t } = useI18n();
  const Icon = stateIcon(state);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
        state === 'saved' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200',
        state === 'saving' && 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-200',
        state === 'ephemeral' && 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        state === 'error' && 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200',
      )}
      title={
        state === 'saved' && lastSyncedAt
          ? t('teacher.create.designWorkbench.persistence.lastSyncedAgo', {
              seconds: Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000)),
            })
          : undefined
      }
    >
      <Icon className={cn('h-3 w-3', state === 'saving' && 'animate-spin')} />
      {t(`teacher.create.designWorkbench.persistence.${state}`)}
    </span>
  );
}

function stateIcon(state: PersistenceState) {
  switch (state) {
    case 'saved':
      return Check;
    case 'saving':
      return Loader2;
    case 'ephemeral':
      return FileEdit;
    case 'error':
      return AlertCircle;
  }
}
```

- [ ] **步骤 2：实现 GenerateSlidesButton**

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';

export interface GenerateSlidesButtonProps {
  readonly disabled: boolean;
  readonly busy: boolean;
  readonly onClick: () => void;
}

export function GenerateSlidesButton({ disabled, busy, onClick }: GenerateSlidesButtonProps) {
  const { t } = useI18n();
  return (
    <Button type="button" size="lg" disabled={disabled || busy} onClick={onClick}>
      <Sparkles className="mr-1 h-4 w-4" />
      {busy
        ? t('teacher.create.designWorkbench.generate.buttonBusy')
        : t('teacher.create.designWorkbench.generate.button')}
    </Button>
  );
}
```

- [ ] **步骤 3：commit**

```bash
git add components/teacher/design-workbench/persistence-indicator.tsx \
        components/teacher/design-workbench/generate-slides-button.tsx
git commit -m "feat(teacher): add PersistenceIndicator + GenerateSlidesButton"
```

---

## 阶段 5：生成调度器与进度 modal

### 任务 5.1：`generation-scheduler` 调度器

**文件：**
- 创建：`lib/teacher/generation-scheduler.ts`
- 创建：`tests/teacher/generation-scheduler.test.ts`

- [ ] **步骤 1：写失败测试**

```ts
import { describe, expect, test, vi } from 'vitest';
import {
  runGenerationScheduler,
  type ChapterStepStatus,
} from '@/lib/teacher/generation-scheduler';

describe('generation-scheduler', () => {
  test('runs outline + scenes for each chapter sequentially', async () => {
    const log: string[] = [];
    const result = await runGenerationScheduler({
      chapters: [{ id: 'c1', title: 'A' }, { id: 'c2', title: 'B' }],
      generateOutline: async (chapterId) => {
        log.push(`outline:${chapterId}`);
        return { ok: true };
      },
      generateScenes: async (chapterId) => {
        log.push(`scenes:${chapterId}`);
        return { ok: true };
      },
      publish: async () => {
        log.push('publish');
        return { ok: true, classroomId: 'cls-1' };
      },
      onChapterStatus: () => {},
    });
    expect(log).toEqual([
      'outline:c1',
      'scenes:c1',
      'outline:c2',
      'scenes:c2',
      'publish',
    ]);
    expect(result.outcome).toBe('completed');
    expect(result.classroomId).toBe('cls-1');
  });

  test('reports per-chapter status updates', async () => {
    const updates: Array<{ chapterId: string; status: ChapterStepStatus }> = [];
    await runGenerationScheduler({
      chapters: [{ id: 'c1', title: 'A' }],
      generateOutline: async () => ({ ok: true }),
      generateScenes: async () => ({ ok: true }),
      publish: async () => ({ ok: true, classroomId: 'cls-1' }),
      onChapterStatus: (chapterId, status) => updates.push({ chapterId, status }),
    });
    expect(updates.map((entry) => entry.status)).toEqual([
      'outlining',
      'generating',
      'ready',
    ]);
  });

  test('stops on outline failure and reports failed outcome', async () => {
    const result = await runGenerationScheduler({
      chapters: [{ id: 'c1', title: 'A' }, { id: 'c2', title: 'B' }],
      generateOutline: async (chapterId) =>
        chapterId === 'c1' ? { ok: false, error: 'boom' } : { ok: true },
      generateScenes: async () => ({ ok: true }),
      publish: async () => ({ ok: true, classroomId: 'x' }),
      onChapterStatus: () => {},
    });
    expect(result.outcome).toBe('failed');
    expect(result.failedChapterId).toBe('c1');
    expect(result.failedStep).toBe('outline');
  });

  test('honors abort signal between chapters', async () => {
    const abort = new AbortController();
    const result = await runGenerationScheduler({
      chapters: [{ id: 'c1', title: 'A' }, { id: 'c2', title: 'B' }],
      generateOutline: async (chapterId) => {
        if (chapterId === 'c1') abort.abort();
        return { ok: true };
      },
      generateScenes: async () => ({ ok: true }),
      publish: async () => ({ ok: true, classroomId: 'x' }),
      onChapterStatus: () => {},
      signal: abort.signal,
    });
    expect(result.outcome).toBe('cancelled');
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
pnpm test tests/teacher/generation-scheduler.test.ts --run
```

预期：fail。

- [ ] **步骤 3：实现调度器**

```ts
export type ChapterStepStatus = 'pending' | 'outlining' | 'generating' | 'ready' | 'failed';

export type StepResult = { ok: true } | { ok: false; error: string };
export type PublishResult = { ok: true; classroomId: string } | { ok: false; error: string };

export interface SchedulerChapterRef {
  id: string;
  title: string;
}

export interface SchedulerInput {
  chapters: SchedulerChapterRef[];
  generateOutline: (chapterId: string) => Promise<StepResult>;
  generateScenes: (chapterId: string) => Promise<StepResult>;
  publish: () => Promise<PublishResult>;
  onChapterStatus: (chapterId: string, status: ChapterStepStatus) => void;
  signal?: AbortSignal;
}

export type SchedulerOutcome = 'completed' | 'failed' | 'cancelled';

export interface SchedulerResult {
  outcome: SchedulerOutcome;
  classroomId?: string;
  failedChapterId?: string;
  failedStep?: 'outline' | 'scenes' | 'publish';
  error?: string;
}

export async function runGenerationScheduler(input: SchedulerInput): Promise<SchedulerResult> {
  for (const chapter of input.chapters) {
    if (input.signal?.aborted) return { outcome: 'cancelled' };

    input.onChapterStatus(chapter.id, 'outlining');
    const outlineResult = await input.generateOutline(chapter.id);
    if (input.signal?.aborted) return { outcome: 'cancelled' };
    if (!outlineResult.ok) {
      input.onChapterStatus(chapter.id, 'failed');
      return {
        outcome: 'failed',
        failedChapterId: chapter.id,
        failedStep: 'outline',
        error: outlineResult.error,
      };
    }

    input.onChapterStatus(chapter.id, 'generating');
    const scenesResult = await input.generateScenes(chapter.id);
    if (input.signal?.aborted) return { outcome: 'cancelled' };
    if (!scenesResult.ok) {
      input.onChapterStatus(chapter.id, 'failed');
      return {
        outcome: 'failed',
        failedChapterId: chapter.id,
        failedStep: 'scenes',
        error: scenesResult.error,
      };
    }

    input.onChapterStatus(chapter.id, 'ready');
  }

  if (input.signal?.aborted) return { outcome: 'cancelled' };
  const publishResult = await input.publish();
  if (!publishResult.ok) {
    return { outcome: 'failed', failedStep: 'publish', error: publishResult.error };
  }
  return { outcome: 'completed', classroomId: publishResult.classroomId };
}
```

- [ ] **步骤 4：测试通过**

```bash
pnpm test tests/teacher/generation-scheduler.test.ts --run
```

预期：4/4 pass。

- [ ] **步骤 5：commit**

```bash
git add lib/teacher/generation-scheduler.ts tests/teacher/generation-scheduler.test.ts
git commit -m "feat(teacher): add slide generation scheduler"
```

### 任务 5.2：`GenerateSlidesProgressDialog` 组件

**文件：**
- 创建：`components/teacher/design-workbench/generate-slides-progress-dialog.tsx`

- [ ] **步骤 1：实现 dialog**

```tsx
'use client';

import { CheckCircle2, Loader2, AlertTriangle, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import type { ChapterStepStatus } from '@/lib/teacher/generation-scheduler';

export interface GenerateSlidesProgressDialogProps {
  readonly open: boolean;
  readonly chapters: Array<{ id: string; title: string }>;
  readonly statuses: Record<string, ChapterStepStatus>;
  readonly errorChapterId?: string;
  readonly errorStep?: 'outline' | 'scenes' | 'publish';
  readonly onRetry: (chapterId: string) => void;
  readonly onSkip: (chapterId: string) => void;
  readonly onCancel: () => void;
}

const STEP_ICON: Record<ChapterStepStatus, typeof Circle> = {
  pending: Circle,
  outlining: Loader2,
  generating: Loader2,
  ready: CheckCircle2,
  failed: AlertTriangle,
};

export function GenerateSlidesProgressDialog({
  open,
  chapters,
  statuses,
  errorChapterId,
  errorStep,
  onRetry,
  onSkip,
  onCancel,
}: GenerateSlidesProgressDialogProps) {
  const { t } = useI18n();
  const completed = chapters.filter((chapter) => statuses[chapter.id] === 'ready').length;
  const total = chapters.length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('teacher.create.designWorkbench.generate.dialog.title')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('teacher.create.designWorkbench.generate.dialog.overall', {
              completed,
              total,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Progress value={percent} className="h-2" />
        <ul className="mt-4 max-h-72 overflow-y-auto space-y-2">
          {chapters.map((chapter, index) => {
            const status = statuses[chapter.id] ?? 'pending';
            const Icon = STEP_ICON[status];
            const isErrored = chapter.id === errorChapterId;
            return (
              <li
                key={chapter.id}
                className={cn(
                  'flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700',
                  isErrored && 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/20',
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    status === 'outlining' && 'animate-spin text-purple-500',
                    status === 'generating' && 'animate-spin text-purple-500',
                    status === 'ready' && 'text-emerald-500',
                    status === 'failed' && 'text-red-500',
                    status === 'pending' && 'text-slate-400',
                  )}
                />
                <span className="flex-1 truncate text-sm">
                  {t('teacher.create.designWorkbench.chapter.indexLabel', { index: index + 1 })}{' '}
                  {chapter.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t(`teacher.create.designWorkbench.generate.chapterStatus.${status}`)}
                </span>
                {isErrored ? (
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => onRetry(chapter.id)}>
                      {t('teacher.create.designWorkbench.generate.dialog.retry')}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => onSkip(chapter.id)}>
                      {t('teacher.create.designWorkbench.generate.dialog.skip')}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {errorStep === 'publish' ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-300">
            {t('teacher.create.designWorkbench.generate.dialog.publishError')}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('teacher.create.designWorkbench.generate.dialog.cancel')}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **步骤 2：commit**

```bash
git add components/teacher/design-workbench/generate-slides-progress-dialog.tsx
git commit -m "feat(teacher): add GenerateSlidesProgressDialog"
```

---

## 阶段 6：Shell 重写 + Chat 字段事件扩展

### 任务 6.1：扩展 `CourseProjectChat` 字段事件类型

**文件：**
- 修改：`components/teacher/course-project-chat.tsx`

- [ ] **步骤 1：把 `CourseProjectChatFieldEvent` 类型改为 5 种 kind**

在文件顶部把现有的 `CourseProjectChatFieldEvent` 接口替换为：

```ts
export type CourseProjectChatFieldEventKind =
  | 'overviewUpdated'
  | 'chapterAdded'
  | 'chapterUpdated'
  | 'chapterRemoved'
  | 'chaptersReordered'
  | 'skipped';

export interface CourseProjectChatFieldEvent {
  id: string;
  kind: CourseProjectChatFieldEventKind;
  /** Optional display label, e.g. chapter title */
  label?: string;
  /** Used for "skipped" events */
  reason?: string;
}
```

- [ ] **步骤 2：把渲染字段事件徽标的部分（搜索 `fieldEvents`/`FieldEventBadge`）改为按 kind 分支渲染**

替换原有的 `FieldEventBadge` 渲染为：

```tsx
function FieldEventBadge({ event }: { event: CourseProjectChatFieldEvent }) {
  const { t } = useI18n();
  switch (event.kind) {
    case 'overviewUpdated':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-900/40 dark:text-purple-200">
          {t('teacher.create.chat.fieldEvent.overviewUpdated')}
        </span>
      );
    case 'chapterAdded':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
          {t('teacher.create.chat.fieldEvent.chapterAdded', { title: event.label ?? '' })}
        </span>
      );
    case 'chapterUpdated':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-900/40 dark:text-purple-200">
          {t('teacher.create.chat.fieldEvent.chapterUpdated', { title: event.label ?? '' })}
        </span>
      );
    case 'chapterRemoved':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-200">
          {t('teacher.create.chat.fieldEvent.chapterRemoved', { title: event.label ?? '' })}
        </span>
      );
    case 'chaptersReordered':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
          {t('teacher.create.chat.fieldEvent.chaptersReordered')}
        </span>
      );
    case 'skipped':
      return (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          title={event.reason}
        >
          ⚠ {t('teacher.create.chat.fieldEvent.skipped')}
        </span>
      );
    default: {
      const _exhaustive: never = event.kind;
      return _exhaustive;
    }
  }
}
```

> 注意：保留现有的 ReasoningBlock、Stop/Retry 按钮、cancelledLabel 逻辑不动。

- [ ] **步骤 3：grep 确认旧 field 类型未被引用**

```bash
rg "CourseProjectChatFieldEvent" components/teacher
```

预期：只有 `course-project-chat.tsx` 与 `course-project-design-shell.tsx` 引用；后者将在下个任务修。

- [ ] **步骤 4：commit（typecheck 暂时还会有 shell 残留错误）**

```bash
git add components/teacher/course-project-chat.tsx
git commit -m "feat(teacher): extend chat field events to 6 kinds"
```

### 任务 6.2：重写 `CourseProjectDesignShell`

**文件：**
- 修改（重写）：`components/teacher/course-project-design-shell.tsx`
- 修改：`components/teacher/course-project-streaming-banner.tsx`（保留，仅可能调整 props）

- [ ] **步骤 1：重写 shell**

把 `components/teacher/course-project-design-shell.tsx` 整文件替换为：

```tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';

import {
  CourseProjectChat,
  type CourseProjectChatFieldEvent,
  type CourseProjectChatMessage,
} from '@/components/teacher/course-project-chat';
import { CourseProjectStreamingBanner } from '@/components/teacher/course-project-streaming-banner';
import { ChapterListBlock } from '@/components/teacher/design-workbench/chapter-list-block';
import { CourseOverviewBlock } from '@/components/teacher/design-workbench/course-overview-block';
import { GenerateSlidesButton } from '@/components/teacher/design-workbench/generate-slides-button';
import { GenerateSlidesProgressDialog } from '@/components/teacher/design-workbench/generate-slides-progress-dialog';
import {
  PersistenceIndicator,
  type PersistenceState,
} from '@/components/teacher/design-workbench/persistence-indicator';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  applyToolCall,
  createDesignShellState,
  type ChapterDraft,
  type DesignShellState,
} from '@/lib/teacher/design-shell-reducer';
import {
  getTeacherGenerationHeaders,
  withCurrentTeacherThinkingConfig,
} from '@/lib/teacher/client-generation-config';
import type {
  CourseChapter,
  CourseChapterStatus,
  CourseProject,
} from '@/lib/teacher/course-types';
import {
  runGenerationScheduler,
  type ChapterStepStatus,
} from '@/lib/teacher/generation-scheduler';
import { consumeTeacherHomepageRequirement } from '@/lib/teacher/homepage-handoff';
import {
  chaptersToPatch,
  createTeacherProject,
  patchTeacherProject,
} from '@/lib/teacher/teacher-projects-client';
import {
  streamCourseProjectRefine,
  type ChatTranscriptMessage,
  type ToolCallPayload,
} from '@/lib/teacher/teacher-refine-client';
import { buildTeacherStudioPath } from '@/lib/teacher/routes';

const HIGHLIGHT_DURATION_MS = 2400;
const PATCH_DEBOUNCE_MS = 500;

export interface CourseProjectDesignShellProps {
  readonly initialProject?: CourseProject;
}

export function CourseProjectDesignShell({ initialProject }: CourseProjectDesignShellProps = {}) {
  const { t } = useI18n();
  const router = useRouter();

  const [shellState, setShellState] = useState<DesignShellState>(() =>
    initialProject ? hydrateFromProject(initialProject) : createDesignShellState(),
  );
  const [projectId, setProjectId] = useState<string | null>(initialProject?.id ?? null);
  const [chapterStatuses, setChapterStatuses] = useState<Record<string, CourseChapterStatus>>(() =>
    initialProject?.outline?.chapters
      ? Object.fromEntries(initialProject.outline.chapters.map((c) => [c.id, c.status]))
      : {},
  );
  const [persistenceState, setPersistenceState] = useState<PersistenceState>(
    initialProject ? 'saved' : 'ephemeral',
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<number | undefined>(
    initialProject ? Date.now() : undefined,
  );
  const [highlightedFields, setHighlightedFields] = useState<Set<string>>(new Set());
  const [expandedChapterIds, setExpandedChapterIds] = useState<Set<string>>(new Set());

  const [messages, setMessages] = useState<CourseProjectChatMessage[]>([]);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [generationOpen, setGenerationOpen] = useState(false);
  const [generationStatuses, setGenerationStatuses] = useState<Record<string, ChapterStepStatus>>({});
  const [generationError, setGenerationError] = useState<{
    chapterId?: string;
    step?: 'outline' | 'scenes' | 'publish';
  }>({});

  const baseRequirementRef = useRef<string>(initialProject?.requirements.requirement ?? '');
  const consumedRef = useRef(false);
  const chatAbortRef = useRef<AbortController | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const chatBusyRef = useRef(false);
  const messagesRef = useRef<CourseProjectChatMessage[]>([]);
  const shellStateRef = useRef<DesignShellState>(shellState);
  const projectIdRef = useRef<string | null>(projectId);
  const activeAssistantIdRef = useRef<string | null>(null);
  const patchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [hasBaseRequirement, setHasBaseRequirement] = useState(
    (initialProject?.requirements.requirement ?? '').trim().length > 0,
  );

  const setShell = useCallback((next: DesignShellState | ((prev: DesignShellState) => DesignShellState)) => {
    setShellState((prev) => {
      const value = typeof next === 'function' ? (next as (p: DesignShellState) => DesignShellState)(prev) : next;
      shellStateRef.current = value;
      return value;
    });
  }, []);

  const flagHighlight = useCallback((key: string) => {
    const existing = highlightTimers.current.get(key);
    if (existing) clearTimeout(existing);
    setHighlightedFields((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
    const timer = setTimeout(() => {
      highlightTimers.current.delete(key);
      setHighlightedFields((current) => {
        if (!current.has(key)) return current;
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }, HIGHLIGHT_DURATION_MS);
    highlightTimers.current.set(key, timer);
  }, []);

  const expandChapter = useCallback((chapterId: string) => {
    setExpandedChapterIds((current) => {
      if (current.has(chapterId)) return current;
      const next = new Set(current);
      next.add(chapterId);
      return next;
    });
  }, []);

  const recordFieldEventOnAssistant = useCallback(
    (assistantId: string, event: CourseProjectChatFieldEvent) => {
      setMessages((current) => {
        const next = current.map((message) =>
          message.id !== assistantId
            ? message
            : { ...message, fieldEvents: [...(message.fieldEvents ?? []), event] },
        );
        messagesRef.current = next;
        return next;
      });
    },
    [],
  );

  const schedulePatch = useCallback(() => {
    if (!projectIdRef.current) return;
    if (patchTimerRef.current) clearTimeout(patchTimerRef.current);
    patchTimerRef.current = setTimeout(() => {
      void persistShell();
    }, PATCH_DEBOUNCE_MS);
  }, []);

  const persistShell = useCallback(async () => {
    const id = projectIdRef.current;
    if (!id) return;
    setPersistenceState('saving');
    try {
      const { project, idMapping } = await patchTeacherProject(id, {
        overview: shellStateRef.current.overview,
        chapters: chaptersToPatch(shellStateRef.current.chapters),
      });
      if (idMapping && Object.keys(idMapping).length > 0) {
        setShell((prev) => ({
          ...prev,
          chapters: prev.chapters.map((chapter) =>
            idMapping[chapter.id] ? { ...chapter, id: idMapping[chapter.id] } : chapter,
          ),
        }));
      }
      setChapterStatuses(
        Object.fromEntries(project.outline?.chapters.map((c) => [c.id, c.status]) ?? []),
      );
      setPersistenceState('saved');
      setLastSyncedAt(Date.now());
    } catch (error) {
      setPersistenceState('error');
      console.warn('[design-shell] PATCH failed:', error);
    }
  }, [setShell]);

  const ensureProjectPersisted = useCallback(async () => {
    if (projectIdRef.current) return;
    const state = shellStateRef.current;
    if (!state.overview.trim() || state.chapters.length === 0) return;
    if (!state.chapters.some((chapter) => chapter.title.trim())) return;

    setPersistenceState('saving');
    try {
      const project = await createTeacherProject({
        overview: state.overview,
        requirement: baseRequirementRef.current || state.overview,
        chapters: state.chapters.map((chapter) => ({
          title: chapter.title,
          learningObjectives: chapter.learningObjectives,
          summary: chapter.summary,
        })),
      });
      projectIdRef.current = project.id;
      setProjectId(project.id);
      // Replace local ai-* ids with the real ids from the server response
      setShell((prev) => ({
        ...prev,
        chapters: project.outline?.chapters.map((serverCh, idx) => ({
          id: serverCh.id,
          title: serverCh.title,
          learningObjectives: serverCh.learningObjectives,
          summary: serverCh.summary ?? prev.chapters[idx]?.summary ?? '',
        })) ?? prev.chapters,
      }));
      setChapterStatuses(
        Object.fromEntries(project.outline?.chapters.map((c) => [c.id, c.status]) ?? []),
      );
      setPersistenceState('saved');
      setLastSyncedAt(Date.now());
      router.replace(`/teacher/projects/${encodeURIComponent(project.id)}/design`);
    } catch (error) {
      setPersistenceState('error');
      console.warn('[design-shell] first persist failed:', error);
    }
  }, [router, setShell]);

  const applyAndRecordToolCall = useCallback(
    (assistantId: string, call: ToolCallPayload) => {
      const result = applyToolCall(shellStateRef.current, call);
      if (result.event) {
        recordFieldEventOnAssistant(assistantId, {
          id: result.event.id,
          kind: result.event.kind,
          label: result.event.label,
          reason: result.event.reason,
        });
      }
      if (result.state !== shellStateRef.current) {
        setShell(result.state);
        if (call.toolName === 'update_overview') flagHighlight('overview');
        if (result.event?.affectedChapterId) {
          flagHighlight(`chapter:${result.event.affectedChapterId}`);
          expandChapter(result.event.affectedChapterId);
        }
      }
    },
    [expandChapter, flagHighlight, recordFieldEventOnAssistant, setShell],
  );

  const finalizeAssistantMessage = useCallback(
    (assistantId: string) => {
      setMessages((current) => {
        const next = current.map((message) => {
          if (message.id !== assistantId) return message;
          if (message.content.trim() || (message.fieldEvents && message.fieldEvents.length > 0)) {
            return message;
          }
          return {
            ...message,
            content: message.cancelled
              ? t('teacher.create.chat.cancelledFallback')
              : t('teacher.create.chat.emptyReplyFallback'),
          };
        });
        messagesRef.current = next;
        return next;
      });
      setStreamingId((current) => (current === assistantId ? null : current));
      activeAssistantIdRef.current = null;
    },
    [t],
  );

  const runStreamingTurn = useCallback(
    async (preparedMessages: CourseProjectChatMessage[]) => {
      if (chatBusyRef.current) return;
      const last = preparedMessages[preparedMessages.length - 1];
      if (!last || last.role !== 'user') return;

      const assistantMessage: CourseProjectChatMessage = {
        id: nanoid(),
        role: 'assistant',
        content: '',
        fieldEvents: [],
      };
      const transcript: ChatTranscriptMessage[] = preparedMessages.map((message) => ({
        role: message.role,
        content: message.content,
      }));
      const nextMessages = [...preparedMessages, assistantMessage];
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      setStreamingId(assistantMessage.id);
      activeAssistantIdRef.current = assistantMessage.id;
      chatBusyRef.current = true;
      setChatBusy(true);
      setChatError(null);

      chatAbortRef.current?.abort();
      const controller = new AbortController();
      chatAbortRef.current = controller;

      const result = await streamCourseProjectRefine({
        formState: {
          overview: shellStateRef.current.overview,
          chapters: shellStateRef.current.chapters,
        },
        messages: transcript,
        baseRequirement: baseRequirementRef.current,
        signal: controller.signal,
        callbacks: {
          onReplyDelta: (delta) => {
            setMessages((current) => {
              const next = current.map((message) =>
                message.id === assistantMessage.id
                  ? { ...message, content: message.content + delta }
                  : message,
              );
              messagesRef.current = next;
              return next;
            });
          },
          onReasoningDelta: (delta) => {
            setMessages((current) => {
              const next = current.map((message) =>
                message.id === assistantMessage.id
                  ? { ...message, reasoning: (message.reasoning ?? '') + delta }
                  : message,
              );
              messagesRef.current = next;
              return next;
            });
          },
          onToolCall: (call) => applyAndRecordToolCall(assistantMessage.id, call),
          onDone: () => finalizeAssistantMessage(assistantMessage.id),
          onError: (error) => {
            if (error === 'aborted') return;
            setChatError(error || t('teacher.create.chat.error'));
          },
        },
      });

      chatBusyRef.current = false;
      setChatBusy(false);
      if (result.status === 'aborted') {
        finalizeAssistantMessage(assistantMessage.id);
      } else if (result.status === 'failed') {
        finalizeAssistantMessage(assistantMessage.id);
        setChatError((current) => current || result.error || t('teacher.create.chat.error'));
      } else {
        // turn completed successfully → try to persist
        await ensureProjectPersisted();
        if (projectIdRef.current) schedulePatch();
      }
    },
    [applyAndRecordToolCall, ensureProjectPersisted, finalizeAssistantMessage, schedulePatch, t],
  );

  const sendChatMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || chatBusyRef.current) return;
      const userMessage: CourseProjectChatMessage = {
        id: nanoid(),
        role: 'user',
        content: trimmed,
      };
      await runStreamingTurn([...messagesRef.current, userMessage]);
    },
    [runStreamingTurn],
  );

  const cancelStream = useCallback(() => {
    if (!chatBusyRef.current) return;
    const activeId = activeAssistantIdRef.current;
    if (activeId) {
      setMessages((current) => {
        const next = current.map((message) =>
          message.id === activeId ? { ...message, cancelled: true } : message,
        );
        messagesRef.current = next;
        return next;
      });
    }
    chatAbortRef.current?.abort();
  }, []);

  const retryLastTurn = useCallback(async () => {
    if (chatBusyRef.current) return;
    const lastUserIdx = findLastIndex(messagesRef.current, (m) => m.role === 'user');
    if (lastUserIdx === -1) return;
    const trimmed = messagesRef.current.slice(0, lastUserIdx + 1);
    messagesRef.current = trimmed;
    setMessages(trimmed);
    setChatError(null);
    await runStreamingTurn(trimmed);
  }, [runStreamingTurn]);

  // Bootstrap from homepage handoff (only when starting from /teacher/new without initialProject)
  useEffect(() => {
    if (consumedRef.current || initialProject) return;
    consumedRef.current = true;
    const handoff = consumeTeacherHomepageRequirement();
    if (!handoff) return;
    baseRequirementRef.current = handoff.requirement;
    queueMicrotask(() => setHasBaseRequirement(handoff.requirement.trim().length > 0));
    void sendChatMessage(handoff.requirement);
  }, [initialProject, sendChatMessage]);

  // Cleanup
  useEffect(() => {
    const timersAtMount = highlightTimers.current;
    return () => {
      chatAbortRef.current?.abort();
      generationAbortRef.current?.abort();
      if (patchTimerRef.current) clearTimeout(patchTimerRef.current);
      timersAtMount.forEach((timer) => clearTimeout(timer));
      timersAtMount.clear();
    };
  }, []);

  const updateOverview = (next: string) => {
    setShell((prev) => ({ ...prev, overview: next }));
    schedulePatch();
  };

  const updateChapter = (chapterId: string, patch: Partial<ChapterDraft>) => {
    setShell((prev) => ({
      ...prev,
      chapters: prev.chapters.map((chapter) =>
        chapter.id === chapterId ? { ...chapter, ...patch } : chapter,
      ),
    }));
    schedulePatch();
  };

  const moveChapter = (chapterId: string, direction: -1 | 1) => {
    setShell((prev) => {
      const idx = prev.chapters.findIndex((chapter) => chapter.id === chapterId);
      if (idx === -1) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.chapters.length) return prev;
      const next = [...prev.chapters];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...prev, chapters: next };
    });
    schedulePatch();
  };

  const removeChapter = (chapterId: string) => {
    setShell((prev) => ({
      ...prev,
      chapters: prev.chapters.filter((chapter) => chapter.id !== chapterId),
    }));
    schedulePatch();
  };

  const addManualChapter = () => {
    const newId = `local-${nanoid(8)}`;
    setShell((prev) => ({
      ...prev,
      chapters: [...prev.chapters, { id: newId, title: '', learningObjectives: [], summary: '' }],
    }));
    expandChapter(newId);
    schedulePatch();
  };

  const toggleExpanded = (chapterId: string) => {
    setExpandedChapterIds((current) => {
      const next = new Set(current);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };

  const regenerateDraft = () => {
    if (chatBusyRef.current) return;
    const base = baseRequirementRef.current.trim();
    if (!base) return;
    setShell(createDesignShellState());
    setExpandedChapterIds(new Set());
    void sendChatMessage(base);
  };

  const generationDisabled =
    chatBusy ||
    shellState.overview.trim() === '' ||
    shellState.chapters.length === 0 ||
    shellState.chapters.some(
      (chapter) => chapter.title.trim() === '' || chapter.learningObjectives.length === 0,
    );

  const generateChapterRefs = useMemo(
    () => shellState.chapters.map((chapter) => ({ id: chapter.id, title: chapter.title })),
    [shellState.chapters],
  );

  const startGeneration = async () => {
    if (generationDisabled) return;
    if (!projectIdRef.current) {
      await ensureProjectPersisted();
      if (!projectIdRef.current) return;
    }
    const id = projectIdRef.current;
    if (!id) return;

    setGenerationOpen(true);
    setGenerationError({});
    const initial: Record<string, ChapterStepStatus> = {};
    for (const chapter of generateChapterRefs) initial[chapter.id] = 'pending';
    setGenerationStatuses(initial);

    const abort = new AbortController();
    generationAbortRef.current = abort;

    const headers = getTeacherGenerationHeaders();
    const config = withCurrentTeacherThinkingConfig({});

    const result = await runGenerationScheduler({
      chapters: generateChapterRefs,
      signal: abort.signal,
      onChapterStatus: (chapterId, status) =>
        setGenerationStatuses((current) => ({ ...current, [chapterId]: status })),
      generateOutline: async (chapterId) => {
        try {
          const res = await fetch(`/api/teacher/projects/${encodeURIComponent(id)}/generate-outline`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...config, chapterId }),
          });
          const json = await res.json();
          if (!res.ok || !json.success) return { ok: false, error: json.error ?? `HTTP ${res.status}` };
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      generateScenes: async (chapterId) => {
        try {
          const res = await fetch(`/api/teacher/projects/${encodeURIComponent(id)}/generate-chapter`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...config, chapterId }),
          });
          const json = await res.json();
          if (!res.ok || !json.success) return { ok: false, error: json.error ?? `HTTP ${res.status}` };
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      publish: async () => {
        try {
          const res = await fetch(`/api/teacher/projects/${encodeURIComponent(id)}/publish`, {
            method: 'POST',
          });
          const json = await res.json();
          if (!res.ok || !json.success) return { ok: false, error: json.error ?? `HTTP ${res.status}` };
          return { ok: true, classroomId: json.classroomId as string };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
    });

    if (result.outcome === 'completed' && result.classroomId) {
      setGenerationOpen(false);
      router.push(buildTeacherStudioPath(id));
    } else if (result.outcome === 'failed') {
      setGenerationError({ chapterId: result.failedChapterId, step: result.failedStep });
    } else if (result.outcome === 'cancelled') {
      setGenerationOpen(false);
    }
  };

  const retryChapter = async (chapterId: string) => {
    setGenerationError({});
    setGenerationStatuses((current) => ({ ...current, [chapterId]: 'pending' }));
    // Re-run from this chapter onwards
    const remaining = generateChapterRefs.slice(
      generateChapterRefs.findIndex((chapter) => chapter.id === chapterId),
    );
    const id = projectIdRef.current;
    if (!id) return;
    const headers = getTeacherGenerationHeaders();
    const config = withCurrentTeacherThinkingConfig({});
    const abort = new AbortController();
    generationAbortRef.current = abort;
    const result = await runGenerationScheduler({
      chapters: remaining,
      signal: abort.signal,
      onChapterStatus: (cid, status) =>
        setGenerationStatuses((current) => ({ ...current, [cid]: status })),
      generateOutline: async (cid) => {
        const res = await fetch(`/api/teacher/projects/${encodeURIComponent(id)}/generate-outline`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...config, chapterId: cid }),
        });
        const json = await res.json();
        return res.ok && json.success ? { ok: true } : { ok: false, error: json.error ?? `HTTP ${res.status}` };
      },
      generateScenes: async (cid) => {
        const res = await fetch(`/api/teacher/projects/${encodeURIComponent(id)}/generate-chapter`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...config, chapterId: cid }),
        });
        const json = await res.json();
        return res.ok && json.success ? { ok: true } : { ok: false, error: json.error ?? `HTTP ${res.status}` };
      },
      publish: async () => {
        const res = await fetch(`/api/teacher/projects/${encodeURIComponent(id)}/publish`, {
          method: 'POST',
        });
        const json = await res.json();
        return res.ok && json.success
          ? { ok: true, classroomId: json.classroomId as string }
          : { ok: false, error: json.error ?? `HTTP ${res.status}` };
      },
    });
    if (result.outcome === 'completed' && result.classroomId) {
      setGenerationOpen(false);
      router.push(buildTeacherStudioPath(id));
    } else if (result.outcome === 'failed') {
      setGenerationError({ chapterId: result.failedChapterId, step: result.failedStep });
    }
  };

  const skipChapter = (chapterId: string) => {
    setGenerationStatuses((current) => ({ ...current, [chapterId]: 'failed' }));
    setGenerationError({});
    // Note: scheduler 现已退出；如需续跑后续章节，用户可再点「生成课件」
  };

  const cancelGeneration = () => {
    generationAbortRef.current?.abort();
    setGenerationOpen(false);
  };

  const canRetry = !chatBusy && messages.some((message) => message.role === 'user');

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 px-4 py-10 text-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-purple-950 dark:text-slate-50">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <PersistenceIndicator state={persistenceState} lastSyncedAt={lastSyncedAt} />
          <GenerateSlidesButton
            disabled={generationDisabled}
            busy={generationOpen}
            onClick={startGeneration}
          />
        </div>
        <CourseProjectStreamingBanner visible={chatBusy} onCancel={cancelStream} />
      </div>
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <CourseOverviewBlock
            value={shellState.overview}
            onChange={updateOverview}
            disabled={chatBusy || generationOpen}
            highlighted={highlightedFields.has('overview')}
          />
          <ChapterListBlock
            chapters={shellState.chapters}
            chapterStatuses={chapterStatuses}
            highlightedChapterIds={
              new Set(
                Array.from(highlightedFields)
                  .filter((key) => key.startsWith('chapter:'))
                  .map((key) => key.slice('chapter:'.length)),
              )
            }
            expandedChapterIds={expandedChapterIds}
            disabled={chatBusy || generationOpen}
            onToggleExpanded={toggleExpanded}
            onChangeChapter={updateChapter}
            onMoveChapter={moveChapter}
            onRemoveChapter={removeChapter}
            onAddChapter={addManualChapter}
          />
        </div>
        <CourseProjectChat
          messages={messages}
          streamingId={streamingId}
          busy={chatBusy}
          disabled={false}
          errorMessage={chatError}
          onSendMessage={sendChatMessage}
          onCancel={cancelStream}
          onRetry={canRetry ? retryLastTurn : undefined}
          onRegenerate={hasBaseRequirement ? regenerateDraft : undefined}
        />
      </div>
      <GenerateSlidesProgressDialog
        open={generationOpen}
        chapters={generateChapterRefs}
        statuses={generationStatuses}
        errorChapterId={generationError.chapterId}
        errorStep={generationError.step}
        onRetry={retryChapter}
        onSkip={skipChapter}
        onCancel={cancelGeneration}
      />
    </main>
  );
}

function hydrateFromProject(project: CourseProject): DesignShellState {
  return {
    overview: project.overview ?? project.requirements.requirement,
    chapters: (project.outline?.chapters ?? []).map((chapter: CourseChapter) => ({
      id: chapter.id,
      title: chapter.title,
      learningObjectives: chapter.learningObjectives,
      summary: chapter.summary ?? '',
    })),
    aiCounter: 0,
  };
}

function findLastIndex<T>(array: readonly T[], predicate: (value: T, index: number) => boolean): number {
  for (let index = array.length - 1; index >= 0; index--) {
    if (predicate(array[index], index)) return index;
  }
  return -1;
}
```

- [ ] **步骤 2：删除旧的 form 组件**

```powershell
Remove-Item components/teacher/course-project-form.tsx
```

- [ ] **步骤 3：typecheck**

```bash
npx tsc --noEmit
```

预期：通过（如有 i18n key 报错，将在阶段 8 修复 —— 先把 key 当存在处理）。

- [ ] **步骤 4：commit**

```bash
git add components/teacher/course-project-design-shell.tsx
git rm components/teacher/course-project-form.tsx 2>$null  # 若已 untracked 则手动 rm 即可
git commit -m "feat(teacher): rewrite design shell to drive overview + chapters via AI tools"
```

---

## 阶段 7：路由与旧 outline 删除

### 任务 7.1：新增 `/teacher/projects/[projectId]/design` 路由

**文件：**
- 创建：`app/teacher/projects/[projectId]/design/page.tsx`

- [ ] **步骤 1：实现页面**

```tsx
import { notFound } from 'next/navigation';

import { CourseProjectDesignShell } from '@/components/teacher/course-project-design-shell';
import { readTeacherProject } from '@/lib/teacher/course-project-storage';

export default async function TeacherDesignPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await readTeacherProject(projectId);
  if (!project) notFound();

  return <CourseProjectDesignShell initialProject={project} />;
}
```

- [ ] **步骤 2：commit**

```bash
git add app/teacher/projects/[projectId]/design/page.tsx
git commit -m "feat(teacher): add /teacher/projects/{id}/design route"
```

### 任务 7.2：删除旧 `/outline` 路由 + `CourseOutlineEditor`

**文件：**
- 删除：`app/teacher/projects/[projectId]/outline/page.tsx`
- 删除：`components/teacher/course-outline-editor.tsx`
- 删除：`tests/teacher/course-outline-editor.test.ts`
- 修改：`lib/teacher/routes.ts`

- [ ] **步骤 1：删除文件**

```powershell
Remove-Item app/teacher/projects/[projectId]/outline/page.tsx
Remove-Item app/teacher/projects/[projectId]/outline -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item components/teacher/course-outline-editor.tsx
Remove-Item tests/teacher/course-outline-editor.test.ts
```

- [ ] **步骤 2：更新 routes**

修改 `lib/teacher/routes.ts`：

```ts
export function buildTeacherNewPath(): string {
  return '/teacher/new';
}

export function buildTeacherDesignPath(projectId: string): string {
  return `/teacher/projects/${encodeURIComponent(projectId)}/design`;
}

export function buildTeacherStudioPath(projectId: string): string {
  return `/teacher/projects/${encodeURIComponent(projectId)}/studio`;
}
```

- [ ] **步骤 3：grep 残留引用并修复**

```bash
rg "buildTeacherOutlinePath|/outline" components/ app/ lib/teacher/ -g '!**/data/**'
```

预期：无匹配，或匹配到 `tests/teacher/routes.test.ts`、`tests/teacher/studio-routes.test.ts`。把它们里的 `buildTeacherOutlinePath` 引用替换为 `buildTeacherDesignPath`。

- [ ] **步骤 4：typecheck + test**

```bash
npx tsc --noEmit
pnpm test tests/teacher --run
```

预期：通过。

- [ ] **步骤 5：commit**

```bash
git add lib/teacher/routes.ts tests/teacher/routes.test.ts tests/teacher/studio-routes.test.ts
git commit -m "feat(teacher): drop /outline route and CourseOutlineEditor"
```

---

## 阶段 8：i18n 全语种 keys

### 任务 8.1：新增 `teacher.create.designWorkbench.*` 与 `teacher.create.chat.fieldEvent.*`

**文件：**
- 修改：`lib/i18n/locales/{zh-CN,zh-TW,en-US,ja-JP,ru-RU,ar-SA}.json`

> 由于 6 个 locale 文件结构相同，下面只展示 zh-CN 的完整新增片段，其余 5 个 locale 同步添加对应翻译（语义保持一致）。

- [ ] **步骤 1：在 `lib/i18n/locales/zh-CN.json` 的 `teacher.create` 节点下追加**

```json
"designWorkbench": {
  "eyebrow": "设计工作台",
  "subtitle": "在这里设计课程概述与章节大纲，AI 助手会跟随你的需求实时调整。",
  "overview": {
    "label": "课程概述",
    "placeholder": "描述这门课的目标受众、核心目标与预期产出...",
    "aiUpdatedBadge": "AI 刚刚更新"
  },
  "chapters": {
    "label": "章节大纲（{{count}}）",
    "addButton": "+ 添加章节",
    "empty": "AI 尚未生成任何章节,你也可以手动添加。"
  },
  "chapter": {
    "indexLabel": "第 {{index}} 章",
    "untitled": "未命名章节",
    "titleLabel": "标题",
    "objectivesLabel": "学习目标",
    "objectivesPlaceholder": "每行一条,例如:理解共价键",
    "objectivesHelp": "1-6 条,简洁有动词。",
    "summaryLabel": "章节概要",
    "summaryPlaceholder": "1-2 段描述这一章会怎么展开...",
    "moveUp": "上移",
    "moveDown": "下移",
    "remove": "删除该章节",
    "statusBadge": {
      "draft": "草稿",
      "dirty": "需重新生成",
      "generating": "生成中",
      "ready": "已就绪",
      "failed": "失败"
    }
  },
  "persistence": {
    "ephemeral": "草稿(未保存)",
    "saving": "正在同步...",
    "saved": "已保存",
    "error": "同步失败",
    "lastSyncedAgo": "上次同步 {{seconds}} 秒前"
  },
  "generate": {
    "button": "生成课件并进入课程设计",
    "buttonBusy": "正在生成...",
    "validationError": "请补全课程概述与每章的标题/学习目标后重试。",
    "dialog": {
      "title": "正在生成课件",
      "overall": "整体进度: {{completed}} / {{total}}",
      "cancel": "取消",
      "retry": "重试该章",
      "skip": "跳过",
      "publishError": "发布失败,请稍后再试。"
    },
    "chapterStatus": {
      "pending": "等待中",
      "outlining": "正在生成大纲",
      "generating": "正在生成课件",
      "ready": "已完成",
      "failed": "失败"
    }
  }
}
```

- [ ] **步骤 2：扩展 `teacher.create.chat.fieldEvent`（新增）**

```json
"fieldEvent": {
  "overviewUpdated": "✏ 课程概述已更新",
  "chapterAdded": "+ 新增《{{title}}》",
  "chapterUpdated": "✏ 已更新《{{title}}》",
  "chapterRemoved": "− 删除《{{title}}》",
  "chaptersReordered": "↕ 重排章节顺序",
  "skipped": "跳过(查看 hover)"
}
```

> 把这两个块都添加到 `lib/i18n/locales/zh-CN.json` 中合适的层级（`teacher.create.designWorkbench` 在 `teacher.create` 同级；`teacher.create.chat.fieldEvent` 嵌在 `teacher.create.chat` 内）。

- [ ] **步骤 3：在其余 5 个 locale 文件做同样结构的添加**

为 `en-US / zh-TW / ja-JP / ru-RU / ar-SA` 翻译相同 keys；保持结构与 placeholder 变量名一致。

- [ ] **步骤 4：删除已废弃 keys**

从全部 6 个 locale 文件中删掉以下 keys 及其子树:
- `teacher.create.title.*`（旧 title 字段相关）
- `teacher.create.requirement.*`（旧 requirement 字段相关）
- `teacher.create.chapterCount.*`
- `teacher.create.fieldEditedByAi`
- `teacher.outline.*`（整段 outline 页面文案）

- [ ] **步骤 5：i18n 对齐校验**

```bash
pnpm check:i18n-keys
```

预期：6 个文件 keys 完全对齐,exit 0。

- [ ] **步骤 6：commit**

```bash
git add lib/i18n/locales/
git commit -m "feat(teacher): add designWorkbench i18n keys, drop legacy outline/title/requirement keys"
```

---

## 阶段 9：E2E 测试改写

### 任务 9.1：改写 `e2e/tests/teacher-course-flow.spec.ts`

**文件：**
- 修改：`e2e/tests/teacher-course-flow.spec.ts`

- [ ] **步骤 1：读取现有 e2e**

打开当前的 `e2e/tests/teacher-course-flow.spec.ts`,理解它现在覆盖的旧两步流程。

- [ ] **步骤 2：在新组件上加 `data-testid`，方便 e2e 命中**

在以下组件根节点（或关键控件）加 `data-testid`：

| 组件 | testid |
|---|---|
| `course-overview-block.tsx` 的 textarea | `data-testid="design-overview-textarea"` |
| `chapter-list-block.tsx` 的 ul | `data-testid="design-chapter-list"` |
| `chapter-card.tsx` 的 `<article>` 根元素 | `data-testid={\`design-chapter-card-${chapter.id}\`}` |
| `generate-slides-button.tsx` 的 `<Button>` | `data-testid="design-generate-button"` |
| `generate-slides-progress-dialog.tsx` 的 retry/skip 按钮 | `data-testid="design-generate-retry"` / `data-testid="design-generate-skip"` |
| `persistence-indicator.tsx` 的 `<span>` | `data-testid="design-persistence-state"` |

提交：

```bash
git add components/teacher/design-workbench/
git commit -m "chore(teacher): add data-testid hooks for e2e"
```

- [ ] **步骤 3：改写 e2e 用例**

把 `e2e/tests/teacher-course-flow.spec.ts` 整个 describe 块替换为：

```ts
import { expect, test } from '@playwright/test';

test.describe('teacher design workbench', () => {
  test('homepage → design workbench → studio happy path', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('homepage-role-teacher').click();
    await page
      .getByTestId('homepage-input')
      .fill('面向高一学生的有机化学入门课，重点放在实验直觉与官能团识别。');
    await page.getByTestId('homepage-enter-button').click();

    await page.waitForURL(/\/teacher\/new/);

    const overview = page.getByTestId('design-overview-textarea');
    await expect(overview).toHaveValue(/.{20,}/, { timeout: 90_000 });
    const chapterCards = page.locator('[data-testid^="design-chapter-card-"]');
    await expect(chapterCards).toHaveCount(3, { timeout: 90_000 });

    await expect(page.getByTestId('design-persistence-state')).toContainText(/已保存|Saved/, {
      timeout: 30_000,
    });

    await page.getByTestId('design-generate-button').click();
    await page.waitForURL(/\/teacher\/projects\/.*\/studio/, { timeout: 6 * 60_000 });
  });

  test('partial generation failure shows retry button', async ({ page }) => {
    let chapterCallCount = 0;
    await page.route('**/api/teacher/projects/*/generate-chapter', async (route) => {
      chapterCallCount += 1;
      if (chapterCallCount === 2) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'mock failure' }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/');
    await page.getByTestId('homepage-role-teacher').click();
    await page.getByTestId('homepage-input').fill('简短测试课程');
    await page.getByTestId('homepage-enter-button').click();
    await page.waitForURL(/\/teacher\/new/);

    await expect(page.locator('[data-testid^="design-chapter-card-"]')).toHaveCount(3, {
      timeout: 90_000,
    });
    await page.getByTestId('design-generate-button').click();
    await expect(page.getByTestId('design-generate-retry')).toBeVisible({ timeout: 6 * 60_000 });
  });
});
```

> 注意：homepage 也需要为 `选择教师/输入框/进入按钮` 加 `data-testid="homepage-role-teacher"` / `data-testid="homepage-input"` / `data-testid="homepage-enter-button"`。这些 testid 应在主页相关组件中已经存在或在此任务里同步补齐。

补齐 testid（如缺）：

```bash
rg "homepage-role-teacher|homepage-input|homepage-enter-button" components/ app/
```

如返回 0 匹配，去 `components/identity-picker` 或主页相关组件中给对应元素加 `data-testid`。提交：

```bash
git add components/identity-picker app/page.tsx
git commit -m "chore(home): add data-testid hooks for teacher e2e"
```

- [ ] **步骤 4：commit e2e 改写**

```bash
git add e2e/tests/teacher-course-flow.spec.ts
git commit -m "test(e2e): rewrite teacher course flow for design workbench"
```

---

## 阶段 10：验证与收尾

### 任务 10.1：全套门禁

**文件：** 无代码变更

- [ ] **步骤 1：format**

```bash
pnpm format
```

- [ ] **步骤 2：lint**

```bash
pnpm lint
```

预期:无新增 error（仅允许 pre-existing 的 8 个错误,与本次工作无关）。

- [ ] **步骤 3：typecheck**

```bash
npx tsc --noEmit
```

预期：exit 0。

- [ ] **步骤 4：i18n 对齐**

```bash
pnpm check:i18n-keys
```

预期：6 文件对齐,exit 0。

- [ ] **步骤 5：teacher 单元测试**

```bash
pnpm test tests/teacher --run
```

预期：全部 pass。

- [ ] **步骤 6：E2E**

```bash
pnpm test:e2e e2e/tests/teacher-course-flow.spec.ts
```

预期：通过（如本地无完整环境,允许在 CI 上运行）。

- [ ] **步骤 7：dev 手动 smoke**

```bash
pnpm dev
```

打开 http://localhost:3000，依次验证：
1. 首页选「设计课程」+ 输入课程需求 → 「进入课堂」
2. 工作台左侧空表单 → 等待 AI 生成 overview + 多个章节 → 持久化指示器变成「已保存」
3. 在右侧聊天里说"把第 2 章拆成两章" → 观察章节列表实时变化、聊天里出现对应的字段事件徽标
4. 手动点「+ 添加章节」、↑/↓、🗑 → PATCH 调用成功
5. 点「生成课件并进入课程设计」 → 进度 modal → 跳转 studio

- [ ] **步骤 8：核对 commit 历史**

```bash
git status                                    # 工作区应干净
git log --oneline | Select-Object -First 30   # 浏览本特性所有 commit
```

预期：`git status` 干净；`git log` 中能看到从 `feat(teacher): add overview/summary fields...` 到 `test(e2e): rewrite teacher course flow...` 的有序提交链。如有遗漏文件，按对应任务的 commit message 风格补一个收尾 commit。

---

## 完成标准

- 所有任务复选框打勾
- `pnpm test tests/teacher --run` 全过
- `npx tsc --noEmit` 无错误
- `pnpm check:i18n-keys` 6 语种对齐
- `pnpm lint` 无本特性引入的新错误
- E2E `teacher-course-flow.spec.ts` 通过
- 手动 smoke 全流程跑通
