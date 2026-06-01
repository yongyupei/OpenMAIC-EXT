# 教师课程设计平台实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在保留现有学生生成课堂流程的前提下，新增教师身份入口和渐进式课程制作 MVP：创建课程项目、生成/编辑大纲、按章节生成内容、进入教师 Studio 编辑、发布为现有课堂。

**架构：** 新增教师项目壳层和章节级模型，生成内核继续复用现有 `SceneOutline -> Scene` 两阶段 pipeline。教师项目最终发布为现有 `Stage / Scene`，从而复用课堂播放、课件编辑和导出能力。监控和 AI 辅助先作为项目内面板/接口，不引入完整多用户工作流平台。

**技术栈：** Next.js App Router、React、TypeScript、Zod、Vitest、现有 `lib/generation`、`lib/server/classroom-storage`、`components/course-editor`、i18n locale JSON。

---

## 文件结构

新增文件：

- `lib/teacher/course-types.ts`：教师项目、大纲、章节、产物、运行状态类型。
- `lib/teacher/course-project.ts`：纯函数，负责创建项目、章节 dirty/locked 规则、outline 与 scene 映射。
- `lib/teacher/course-project-storage.ts`：服务端 JSON 存储，复用 `writeJsonFileAtomic`。
- `lib/teacher/course-publish.ts`：将教师项目和 scenes 组装成现有 `Stage / Scene` payload。
- `lib/teacher/routes.ts`：教师端路由 builder。
- `app/api/teacher/projects/route.ts`：创建项目和列出项目。
- `app/api/teacher/projects/[projectId]/route.ts`：读取/更新项目。
- `app/api/teacher/projects/[projectId]/outline/route.ts`：保存教师编辑后的大纲。
- `app/api/teacher/projects/[projectId]/generate-chapter/route.ts`：按章节生成 scenes。
- `app/api/teacher/projects/[projectId]/publish/route.ts`：发布为 classroom。
- `app/api/teacher/assist/route.ts`：教师 AI 辅助窄接口。
- `app/teacher/new/page.tsx`：教师创建页。
- `app/teacher/projects/[projectId]/outline/page.tsx`：教师大纲页。
- `app/teacher/projects/[projectId]/studio/page.tsx`：教师 Studio 页。
- `components/teacher/identity-choice.tsx`：首页身份选择组件。
- `components/teacher/course-project-form.tsx`：教师创建表单。
- `components/teacher/course-outline-editor.tsx`：章节级大纲编辑器。
- `components/teacher/course-studio-shell.tsx`：教师 Studio 外壳。
- `components/teacher/teacher-assist-panel.tsx`：AI 辅助面板。
- `components/teacher/teacher-run-status-panel.tsx`：轻量监控面板。
- `tests/teacher/course-project.test.ts`
- `tests/teacher/course-project-storage.test.ts`
- `tests/teacher/course-publish.test.ts`
- `tests/teacher/routes.test.ts`

修改文件：

- `app/page.tsx`：增加身份选择入口，学生路径保留现有行为，教师路径跳转 `/teacher/new`。
- `lib/i18n/locales/*.json`：新增 `teacher.*` 文案。
- `components/course-editor/course-editor-shell.tsx`：如需复用为教师 Studio，抽出可选右侧面板/toolbar 扩展点；若现有布局不适配，则保持不改并由 `CourseStudioShell` 组合 `CanvasArea`。
- `tests/course-editor/routes.test.ts`：可保留不动；新增教师 routes 测试。
- `e2e/tests/generation-flow.spec.ts` 或新增 `e2e/tests/teacher-course-flow.spec.ts`：覆盖教师 MVP happy path。

## 任务 1：教师项目类型与路由工具

**文件：**
- 创建：`lib/teacher/course-types.ts`
- 创建：`lib/teacher/routes.ts`
- 测试：`tests/teacher/routes.test.ts`

- [ ] **步骤 1：编写失败的 routes 测试**

```ts
import { describe, expect, test } from 'vitest';
import {
  buildTeacherNewPath,
  buildTeacherOutlinePath,
  buildTeacherStudioPath,
} from '@/lib/teacher/routes';

describe('teacher routes', () => {
  test('builds teacher project paths and encodes ids', () => {
    expect(buildTeacherNewPath()).toBe('/teacher/new');
    expect(buildTeacherOutlinePath('course 123')).toBe('/teacher/projects/course%20123/outline');
    expect(buildTeacherStudioPath('course 123')).toBe('/teacher/projects/course%20123/studio');
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`pnpm test tests/teacher/routes.test.ts`

预期：FAIL，报错找不到 `@/lib/teacher/routes`。

- [ ] **步骤 3：添加教师类型**

```ts
import type { Scene } from '@/lib/types/stage';
import type { SceneOutline, UserRequirements } from '@/lib/types/generation';

export type CourseProjectStatus = 'draft' | 'outlining' | 'outline-ready' | 'generating' | 'editing' | 'published';
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
  run?: TeacherRunStatus;
  publishedClassroomId?: string;
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

- [ ] **步骤 4：添加 route builders**

```ts
export function buildTeacherNewPath(): string {
  return '/teacher/new';
}

export function buildTeacherOutlinePath(projectId: string): string {
  return `/teacher/projects/${encodeURIComponent(projectId)}/outline`;
}

export function buildTeacherStudioPath(projectId: string): string {
  return `/teacher/projects/${encodeURIComponent(projectId)}/studio`;
}
```

- [ ] **步骤 5：运行测试确认通过**

运行：`pnpm test tests/teacher/routes.test.ts`

预期：PASS。

- [ ] **步骤 6：Commit**

```bash
git add lib/teacher/course-types.ts lib/teacher/routes.ts tests/teacher/routes.test.ts
git commit -m "feat: add teacher course project types"
```

## 任务 2：教师项目纯函数

**文件：**
- 创建：`lib/teacher/course-project.ts`
- 测试：`tests/teacher/course-project.test.ts`

- [ ] **步骤 1：编写失败测试**

```ts
import { describe, expect, test } from 'vitest';
import type { SceneOutline } from '@/lib/types/generation';
import {
  createCourseProject,
  createOutlineFromSceneOutlines,
  markChapterDirty,
  listRegeneratableOutlines,
} from '@/lib/teacher/course-project';

const outlines: SceneOutline[] = [
  { id: 's1', type: 'slide', title: 'Intro', description: 'Intro page', keyPoints: ['A'], order: 0 },
  {
    id: 'q1',
    type: 'quiz',
    title: 'Check',
    description: 'Check understanding',
    keyPoints: ['A'],
    order: 1,
    quizConfig: { questionCount: 2, difficulty: 'easy', questionTypes: ['single'] },
  },
];

describe('teacher course project helpers', () => {
  test('creates a draft project with standard workflow', () => {
    const project = createCourseProject({
      id: 'teacher_1',
      title: 'Physics',
      requirement: 'Teach force',
      chapterCount: 1,
      now: '2026-05-14T00:00:00.000Z',
    });

    expect(project).toMatchObject({
      id: 'teacher_1',
      title: 'Physics',
      status: 'draft',
      workflowTemplateId: 'standard-course',
      chapterCount: 1,
    });
  });

  test('groups scene outlines into editable chapters', () => {
    const outline = createOutlineFromSceneOutlines({
      projectId: 'teacher_1',
      sceneOutlines: outlines,
      chapterCount: 1,
      revision: 1,
    });

    expect(outline.chapters).toHaveLength(1);
    expect(outline.chapters[0]!.sceneOutlines.map((scene) => scene.id)).toEqual(['s1', 'q1']);
  });

  test('dirty chapters regenerate only unlocked outlines', () => {
    const outline = createOutlineFromSceneOutlines({
      projectId: 'teacher_1',
      sceneOutlines: outlines,
      chapterCount: 1,
      revision: 1,
    });
    const dirty = markChapterDirty(outline, outline.chapters[0]!.id);
    expect(listRegeneratableOutlines(dirty).map((scene) => scene.id)).toEqual(['s1', 'q1']);
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`pnpm test tests/teacher/course-project.test.ts`

预期：FAIL，报错找不到 `@/lib/teacher/course-project`。

- [ ] **步骤 3：实现纯函数**

```ts
import { nanoid } from 'nanoid';
import type { SceneOutline, UserRequirements } from '@/lib/types/generation';
import type { CourseOutline, CourseProject } from '@/lib/teacher/course-types';

export function createCourseProject(input: {
  id: string;
  title: string;
  requirement: string;
  chapterCount: number;
  targetAudience?: string;
  durationMinutes?: number;
  now: string;
}): CourseProject {
  const requirements: UserRequirements = { requirement: input.requirement };
  return {
    id: input.id,
    title: input.title,
    requirements,
    targetAudience: input.targetAudience,
    durationMinutes: input.durationMinutes,
    chapterCount: input.chapterCount,
    workflowTemplateId: 'standard-course',
    status: 'draft',
    createdAt: input.now,
    updatedAt: input.now,
    artifacts: [],
  };
}

export function createOutlineFromSceneOutlines(input: {
  projectId: string;
  sceneOutlines: SceneOutline[];
  chapterCount: number;
  revision: number;
  languageDirective?: string;
}): CourseOutline {
  const chapterCount = Math.max(1, input.chapterCount);
  const chapters = Array.from({ length: chapterCount }, (_, index) => {
    const sceneOutlines = input.sceneOutlines.filter((_, sceneIndex) => sceneIndex % chapterCount === index);
    return {
      id: nanoid(),
      title: sceneOutlines[0]?.title ?? `Chapter ${index + 1}`,
      learningObjectives: sceneOutlines.flatMap((outline) =>
        outline.teachingObjective ? [outline.teachingObjective] : [],
      ),
      sceneOutlines,
      status: 'draft' as const,
      dirty: false,
      locked: false,
      order: index,
    };
  });
  return {
    projectId: input.projectId,
    languageDirective: input.languageDirective,
    revision: input.revision,
    chapters,
  };
}

export function markChapterDirty(outline: CourseOutline, chapterId: string): CourseOutline {
  return {
    ...outline,
    chapters: outline.chapters.map((chapter) =>
      chapter.id === chapterId ? { ...chapter, dirty: true, status: 'dirty' } : chapter,
    ),
  };
}

export function listRegeneratableOutlines(outline: CourseOutline): SceneOutline[] {
  return outline.chapters
    .filter((chapter) => chapter.dirty && !chapter.locked)
    .flatMap((chapter) => chapter.sceneOutlines);
}
```

- [ ] **步骤 4：运行测试确认通过**

运行：`pnpm test tests/teacher/course-project.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add lib/teacher/course-project.ts tests/teacher/course-project.test.ts
git commit -m "feat: add teacher course project helpers"
```

## 任务 3：教师项目服务端存储

**文件：**
- 创建：`lib/teacher/course-project-storage.ts`
- 测试：`tests/teacher/course-project-storage.test.ts`

- [ ] **步骤 1：编写失败测试**

```ts
import { describe, expect, test, vi } from 'vitest';
import type { CourseProject } from '@/lib/teacher/course-types';

vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    readFile: vi.fn(async () => JSON.stringify(project('teacher_1', 1))),
  },
}));

import { readTeacherProject, writeTeacherProject } from '@/lib/teacher/course-project-storage';

function project(id: string, revision: number): CourseProject {
  return {
    id,
    title: 'Physics',
    requirements: { requirement: 'Teach force' },
    chapterCount: 1,
    workflowTemplateId: 'standard-course',
    status: 'draft',
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
    artifacts: [],
    outline: { projectId: id, revision, chapters: [] },
  };
}

describe('teacher project storage', () => {
  test('reads and writes teacher projects', async () => {
    await writeTeacherProject(project('teacher_1', 1));
    const stored = await readTeacherProject('teacher_1');
    expect(stored?.id).toBe('teacher_1');
    expect(stored?.outline?.revision).toBe(1);
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`pnpm test tests/teacher/course-project-storage.test.ts`

预期：FAIL，报错找不到存储模块。

- [ ] **步骤 3：实现存储模块**

```ts
import { promises as fs } from 'fs';
import path from 'path';
import type { CourseProject } from '@/lib/teacher/course-types';
import { writeJsonFileAtomic } from '@/lib/server/classroom-storage';

export const TEACHER_PROJECTS_DIR = path.join(process.cwd(), 'data', 'teacher-projects');

export function isValidTeacherProjectId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export async function writeTeacherProject(project: CourseProject): Promise<CourseProject> {
  if (!isValidTeacherProjectId(project.id)) {
    throw new Error(`Invalid teacher project id: ${project.id}`);
  }
  const filePath = path.join(TEACHER_PROJECTS_DIR, `${project.id}.json`);
  await writeJsonFileAtomic(filePath, project);
  return project;
}

export async function readTeacherProject(projectId: string): Promise<CourseProject | null> {
  if (!isValidTeacherProjectId(projectId)) {
    throw new Error(`Invalid teacher project id: ${projectId}`);
  }
  const filePath = path.join(TEACHER_PROJECTS_DIR, `${projectId}.json`);
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as CourseProject;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
```

- [ ] **步骤 4：运行测试确认通过**

运行：`pnpm test tests/teacher/course-project-storage.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add lib/teacher/course-project-storage.ts tests/teacher/course-project-storage.test.ts
git commit -m "feat: persist teacher course projects"
```

## 任务 4：教师项目 API

**文件：**
- 创建：`app/api/teacher/projects/route.ts`
- 创建：`app/api/teacher/projects/[projectId]/route.ts`
- 创建：`app/api/teacher/projects/[projectId]/outline/route.ts`
- 测试：`tests/teacher/project-api.test.ts`

- [ ] **步骤 1：编写 API 单测**

```ts
import { describe, expect, test, vi } from 'vitest';
import { POST } from '@/app/api/teacher/projects/route';

vi.mock('@/lib/teacher/course-project-storage', () => ({
  writeTeacherProject: vi.fn(async (project) => project),
}));

describe('teacher project API', () => {
  test('creates a teacher project from course requirements', async () => {
    const req = new Request('http://localhost/api/teacher/projects', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Physics',
        requirement: 'Teach force',
        chapterCount: 2,
        targetAudience: 'Grade 8',
      }),
    });
    const response = await POST(req as never);
    const json = await response.json();
    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.project.title).toBe('Physics');
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`pnpm test tests/teacher/project-api.test.ts`

预期：FAIL，API route 不存在。

- [ ] **步骤 3：实现创建/读取/更新 API**

关键实现：

```ts
import { type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createCourseProject } from '@/lib/teacher/course-project';
import { writeTeacherProject } from '@/lib/teacher/course-project-storage';

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.title || !body.requirement) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'title and requirement are required');
  }
  const now = new Date().toISOString();
  const project = createCourseProject({
    id: nanoid(),
    title: body.title,
    requirement: body.requirement,
    chapterCount: Number(body.chapterCount) || 1,
    targetAudience: body.targetAudience,
    durationMinutes: body.durationMinutes,
    now,
  });
  await writeTeacherProject(project);
  return apiSuccess({ project }, 201);
}
```

`[projectId]/route.ts` 读取项目并支持局部更新；`outline/route.ts` 保存 `CourseOutline`，同时更新项目 `status` 和 `updatedAt`。

- [ ] **步骤 4：运行测试确认通过**

运行：`pnpm test tests/teacher/project-api.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add app/api/teacher tests/teacher/project-api.test.ts
git commit -m "feat: add teacher project api"
```

## 任务 5：首页身份选择

**文件：**
- 创建：`components/teacher/identity-choice.tsx`
- 修改：`app/page.tsx`
- 修改：`lib/i18n/locales/*.json`

- [ ] **步骤 1：添加教师身份文案**

在每个 locale 文件新增同结构 key：

```json
{
  "teacher": {
    "identity": {
      "studentTitle": "Student",
      "studentDescription": "Generate and enter an interactive classroom",
      "teacherTitle": "Teacher",
      "teacherDescription": "Design a course with outline review and editable lessons"
    }
  }
}
```

- [ ] **步骤 2：创建身份选择组件**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { buildTeacherNewPath } from '@/lib/teacher/routes';

interface IdentityChoiceProps {
  readonly onStudentSelect: () => void;
}

export function IdentityChoice({ onStudentSelect }: IdentityChoiceProps) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Button type="button" variant="outline" className="h-auto justify-start p-4" onClick={onStudentSelect}>
        <span className="text-left">
          <span className="block font-medium">{t('teacher.identity.studentTitle')}</span>
          <span className="block text-xs text-muted-foreground">
            {t('teacher.identity.studentDescription')}
          </span>
        </span>
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-auto justify-start p-4"
        onClick={() => router.push(buildTeacherNewPath())}
      >
        <span className="text-left">
          <span className="block font-medium">{t('teacher.identity.teacherTitle')}</span>
          <span className="block text-xs text-muted-foreground">
            {t('teacher.identity.teacherDescription')}
          </span>
        </span>
      </Button>
    </div>
  );
}
```

- [ ] **步骤 3：集成到首页**

在 `app/page.tsx` 保持 `handleGenerate` 不变，只在主输入区附近增加：

```tsx
<IdentityChoice onStudentSelect={handleGenerate} />
```

如果现有生成按钮已经调用 `handleGenerate`，保留按钮；身份选择可以作为入口卡片展示在输入框上方或下方。不要删除 PDF、设置、历史课堂等现有功能。

- [ ] **步骤 4：运行 i18n 校验**

运行：`pnpm check:i18n-keys`

预期：exit 0。

- [ ] **步骤 5：Commit**

```bash
git add app/page.tsx components/teacher/identity-choice.tsx lib/i18n/locales
git commit -m "feat: add student and teacher entry points"
```

## 任务 6：教师创建页

**文件：**
- 创建：`components/teacher/course-project-form.tsx`
- 创建：`app/teacher/new/page.tsx`

- [ ] **步骤 1：创建表单组件**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { buildTeacherOutlinePath } from '@/lib/teacher/routes';

export function CourseProjectForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [requirement, setRequirement] = useState('');
  const [chapterCount, setChapterCount] = useState(4);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const response = await fetch('/api/teacher/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, requirement, chapterCount }),
      });
      const json = await response.json();
      if (response.ok && json.success) {
        router.push(buildTeacherOutlinePath(json.project.id));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Input value={title} onChange={(event) => setTitle(event.target.value)} />
      <Textarea value={requirement} onChange={(event) => setRequirement(event.target.value)} />
      <Input
        type="number"
        min={1}
        value={chapterCount}
        onChange={(event) => setChapterCount(Number(event.target.value))}
      />
      <Button type="button" onClick={submit} disabled={submitting || !title || !requirement}>
        {submitting ? 'Creating...' : 'Create course'}
      </Button>
    </div>
  );
}
```

将按钮和占位文案替换为 i18n key；示例代码只展示行为结构。

- [ ] **步骤 2：创建页面**

```tsx
import { CourseProjectForm } from '@/components/teacher/course-project-form';

export default function TeacherNewPage() {
  return <CourseProjectForm />;
}
```

- [ ] **步骤 3：补齐 locale key 并校验**

运行：`pnpm check:i18n-keys`

预期：exit 0。

- [ ] **步骤 4：Commit**

```bash
git add app/teacher/new/page.tsx components/teacher/course-project-form.tsx lib/i18n/locales
git commit -m "feat: add teacher course creation page"
```

## 任务 7：大纲页和章节编辑

**文件：**
- 创建：`components/teacher/course-outline-editor.tsx`
- 创建：`app/teacher/projects/[projectId]/outline/page.tsx`
- 创建或修改：`app/api/teacher/projects/[projectId]/generate-outline/route.ts`

- [ ] **步骤 1：添加大纲生成 API**

该 route 读取教师项目，调用已有 outline 生成器或转发到现有大纲生成逻辑，返回 `CourseOutline` 并保存到项目。

关键逻辑：

```ts
const result = await generateSceneOutlinesFromRequirements(
  project.requirements,
  undefined,
  undefined,
  aiCall,
  undefined,
  { teacherContext: `Create a ${project.chapterCount}-chapter teacher-authored course.` },
);
if (!result.success || !result.data) {
  return apiError('GENERATION_FAILED', 500, result.error ?? 'Failed to generate course outline');
}
const { data } = result;
const outlines = data.outlines;
const languageDirective = data.languageDirective;
const outline = createOutlineFromSceneOutlines({
  projectId: project.id,
  sceneOutlines: outlines,
  chapterCount: project.chapterCount,
  revision: (project.outline?.revision ?? 0) + 1,
  languageDirective,
});
await writeTeacherProject({ ...project, outline, status: 'outline-ready', updatedAt: new Date().toISOString() });
```

- [ ] **步骤 2：创建大纲编辑器**

编辑器 props：

```ts
interface CourseOutlineEditorProps {
  readonly projectId: string;
  readonly initialOutline: CourseOutline | null;
}
```

支持：

- 生成大纲。
- 编辑章节标题和目标。
- 调整章节顺序。
- 保存大纲。
- 继续到 Studio。

- [ ] **步骤 3：创建页面**

服务端页面读取项目：

```tsx
import { notFound } from 'next/navigation';
import { CourseOutlineEditor } from '@/components/teacher/course-outline-editor';
import { readTeacherProject } from '@/lib/teacher/course-project-storage';

export default async function TeacherOutlinePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await readTeacherProject(projectId);
  if (!project) notFound();
  return <CourseOutlineEditor projectId={project.id} initialOutline={project.outline ?? null} />;
}
```

- [ ] **步骤 4：运行 focused checks**

运行：

`pnpm test tests/teacher/course-project.test.ts tests/teacher/project-api.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add app/teacher/projects components/teacher/course-outline-editor.tsx app/api/teacher/projects lib/i18n/locales
git commit -m "feat: add editable teacher course outline"
```

## 任务 8：按章节生成 scenes

**文件：**
- 创建：`app/api/teacher/projects/[projectId]/generate-chapter/route.ts`
- 修改：`lib/teacher/course-project.ts`
- 测试：`tests/teacher/course-project.test.ts`

- [ ] **步骤 1：扩展测试覆盖 locked/dirty**

```ts
test('locked chapters are not regenerated', () => {
  const outline = createOutlineFromSceneOutlines({
    projectId: 'teacher_1',
    sceneOutlines: outlines,
    chapterCount: 1,
    revision: 1,
  });
  const locked = {
    ...outline,
    chapters: [{ ...outline.chapters[0]!, dirty: true, locked: true }],
  };
  expect(listRegeneratableOutlines(locked)).toEqual([]);
});
```

- [ ] **步骤 2：实现章节生成 API**

该 API：

1. 读取项目。
2. 找到 `chapterId`。
3. 对章节内每个 `SceneOutline` 调用 `generateSceneContent` 和 `generateSceneActions`。
4. 用 `buildCompleteScene` 得到现有 `Scene`。
5. 更新 `artifacts` 和章节状态。

代码骨架：

```ts
for (const outline of chapter.sceneOutlines) {
  const content = await generateSceneContent(outline, aiCall, {
    languageDirective: project.outline?.languageDirective,
  });
  const actions = await generateSceneActions(outline, content, aiCall, {
    languageDirective: project.outline?.languageDirective,
  });
  const scene = buildCompleteScene(outline, content, actions, project.id);
  scenes.push(scene);
}
```

保持 imports 在文件顶部，不使用 inline import。

- [ ] **步骤 3：更新项目产物**

生成后将章节标记为 `ready`、`dirty: false`，并记录每个 scene 的 `LessonArtifact`。

- [ ] **步骤 4：运行测试**

运行：`pnpm test tests/teacher/course-project.test.ts`

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add app/api/teacher/projects/[projectId]/generate-chapter/route.ts lib/teacher/course-project.ts tests/teacher/course-project.test.ts
git commit -m "feat: generate teacher chapter scenes"
```

## 任务 9：发布为现有 classroom/stage

**文件：**
- 创建：`lib/teacher/course-publish.ts`
- 创建：`app/api/teacher/projects/[projectId]/publish/route.ts`
- 测试：`tests/teacher/course-publish.test.ts`

- [ ] **步骤 1：编写发布映射测试**

```ts
import { describe, expect, test } from 'vitest';
import type { CourseProject } from '@/lib/teacher/course-types';
import type { Scene } from '@/lib/types/stage';
import { buildStageFromTeacherProject } from '@/lib/teacher/course-publish';

describe('teacher course publishing', () => {
  test('builds an existing Stage payload from a teacher project', () => {
    const project = {
      id: 'teacher_1',
      title: 'Physics',
      requirements: { requirement: 'Teach force' },
      chapterCount: 1,
      workflowTemplateId: 'standard-course',
      status: 'editing',
      createdAt: '2026-05-14T00:00:00.000Z',
      updatedAt: '2026-05-14T00:00:00.000Z',
      artifacts: [],
    } satisfies CourseProject;
    const scenes = [{ id: 's1', stageId: 'teacher_1', type: 'quiz', title: 'Quiz', order: 0, content: { type: 'quiz', questions: [] } }] satisfies Scene[];

    const stage = buildStageFromTeacherProject(project, scenes, 1);
    expect(stage).toMatchObject({ id: 'teacher_1', name: 'Physics' });
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`pnpm test tests/teacher/course-publish.test.ts`

预期：FAIL，发布模块不存在。

- [ ] **步骤 3：实现发布映射**

```ts
import type { CourseProject } from '@/lib/teacher/course-types';
import type { Scene, Stage } from '@/lib/types/stage';

export function buildStageFromTeacherProject(project: CourseProject, _scenes: Scene[], now: number): Stage {
  return {
    id: project.id,
    name: project.title,
    description: project.requirements.requirement,
    createdAt: new Date(project.createdAt).getTime(),
    updatedAt: now,
    languageDirective: project.outline?.languageDirective,
  };
}
```

- [ ] **步骤 4：实现发布 API**

发布 API 调用现有 `persistClassroom`，成功后更新 `project.publishedClassroomId` 和 `status: 'published'`。

- [ ] **步骤 5：运行测试确认通过**

运行：`pnpm test tests/teacher/course-publish.test.ts`

预期：PASS。

- [ ] **步骤 6：Commit**

```bash
git add lib/teacher/course-publish.ts app/api/teacher/projects/[projectId]/publish/route.ts tests/teacher/course-publish.test.ts
git commit -m "feat: publish teacher projects as classrooms"
```

## 任务 10：教师 Studio

**文件：**
- 创建：`components/teacher/course-studio-shell.tsx`
- 创建：`components/teacher/teacher-run-status-panel.tsx`
- 创建：`app/teacher/projects/[projectId]/studio/page.tsx`

- [ ] **步骤 1：创建状态面板**

```tsx
'use client';

import type { TeacherRunStatus } from '@/lib/teacher/course-types';

export function TeacherRunStatusPanel({ run }: { readonly run?: TeacherRunStatus }) {
  if (!run) return null;
  return (
    <aside className="w-80 border-l bg-background p-4">
      <p className="text-sm font-medium">{run.step}</p>
      <p className="text-xs text-muted-foreground">{run.message}</p>
      <div className="mt-3 h-2 rounded bg-muted">
        <div className="h-2 rounded bg-primary" style={{ width: `${run.progress}%` }} />
      </div>
    </aside>
  );
}
```

替换可见字符串为 i18n key。

- [ ] **步骤 2：创建 Studio 壳**

优先复用 `CourseEditorShell`。如果需要右侧面板，在 `CourseStudioShell` 外层布局中组合：

```tsx
import { CourseEditorShell } from '@/components/course-editor/course-editor-shell';
import { TeacherRunStatusPanel } from '@/components/teacher/teacher-run-status-panel';
import type { CourseProject } from '@/lib/teacher/course-types';

export function CourseStudioShell({ project }: { readonly project: CourseProject }) {
  return (
    <div className="flex min-h-screen">
      <div className="min-w-0 flex-1">
        <CourseEditorShell classroomId={project.id} />
      </div>
      <TeacherRunStatusPanel run={project.run} />
    </div>
  );
}
```

- [ ] **步骤 3：创建 Studio 页面**

读取项目，不存在则 `notFound()`，渲染 `CourseStudioShell`。

- [ ] **步骤 4：手动验证**

运行：`pnpm dev`

打开：`/teacher/projects/<projectId>/studio`

预期：页面能加载教师 Studio，且编辑器仍使用现有课堂编辑能力。

- [ ] **步骤 5：Commit**

```bash
git add app/teacher/projects/[projectId]/studio/page.tsx components/teacher/course-studio-shell.tsx components/teacher/teacher-run-status-panel.tsx lib/i18n/locales
git commit -m "feat: add teacher course studio"
```

## 任务 11：教师 AI 辅助

**文件：**
- 创建：`app/api/teacher/assist/route.ts`
- 创建：`components/teacher/teacher-assist-panel.tsx`
- 测试：`tests/teacher/assist-api.test.ts`

- [ ] **步骤 1：编写 API 测试**

```ts
import { describe, expect, test } from 'vitest';
import { POST } from '@/app/api/teacher/assist/route';

describe('teacher assist API', () => {
  test('rejects unknown assist scope', async () => {
    const response = await POST(
      new Request('http://localhost/api/teacher/assist', {
        method: 'POST',
        body: JSON.stringify({ scope: 'unknown', instruction: 'Improve this' }),
      }) as never,
    );
    expect(response.status).toBe(400);
  });
});
```

- [ ] **步骤 2：实现作用域校验**

```ts
const scopes = ['outline', 'chapter', 'slide', 'quiz'] as const;
type TeacherAssistScope = (typeof scopes)[number];

function isTeacherAssistScope(value: unknown): value is TeacherAssistScope {
  return typeof value === 'string' && scopes.includes(value as TeacherAssistScope);
}
```

- [ ] **步骤 3：实现 LLM 调用**

接口输入包含 `scope`、`instruction`、`context`。输出包含 `suggestion` 和可选 `patch`。MVP 只返回建议文本，由前端确认应用。

- [ ] **步骤 4：创建辅助面板**

面板根据当前 scope 调用 `/api/teacher/assist`，展示建议和“应用”按钮。应用动作先支持大纲文本和 quiz 字段，slide 画布应用可作为后续增强。

- [ ] **步骤 5：运行测试**

运行：`pnpm test tests/teacher/assist-api.test.ts`

预期：PASS。

- [ ] **步骤 6：Commit**

```bash
git add app/api/teacher/assist/route.ts components/teacher/teacher-assist-panel.tsx tests/teacher/assist-api.test.ts lib/i18n/locales
git commit -m "feat: add teacher ai assist"
```

## 任务 12：端到端验证与质量门禁

**文件：**
- 创建：`e2e/tests/teacher-course-flow.spec.ts`
- 修改：测试 mocks，按现有 e2e 模式接入。

- [ ] **步骤 1：新增 e2e happy path**

测试流程：

1. 打开首页。
2. 选择教师身份。
3. 创建课程项目。
4. 生成或加载 mocked 大纲。
5. 编辑大纲标题。
6. 进入 Studio。
7. 发布或预览课堂。

- [ ] **步骤 2：运行 focused unit tests**

运行：

`pnpm test tests/teacher/course-project.test.ts tests/teacher/course-project-storage.test.ts tests/teacher/course-publish.test.ts tests/teacher/routes.test.ts tests/teacher/project-api.test.ts tests/teacher/assist-api.test.ts`

预期：PASS。

- [ ] **步骤 3：运行 i18n 校验**

运行：`pnpm check:i18n-keys`

预期：exit 0。

- [ ] **步骤 4：运行 lint 和 typecheck**

运行：

`pnpm lint`

`npx tsc --noEmit`

预期：exit 0。

- [ ] **步骤 5：运行 e2e**

运行：`pnpm test:e2e -- e2e/tests/teacher-course-flow.spec.ts`

预期：PASS。

- [ ] **步骤 6：Commit**

```bash
git add e2e/tests/teacher-course-flow.spec.ts
git commit -m "test: cover teacher course creation flow"
```

## 最终验收清单

- [ ] 学生身份仍可使用现有首页生成课堂流程。
- [ ] 教师身份可创建课程项目。
- [ ] 教师可生成、编辑并保存章节级大纲。
- [ ] 教师可按章节生成 slide/quiz scenes。
- [ ] 修改大纲后只重新生成 dirty 且未 locked 的章节。
- [ ] 教师可进入 Studio 编辑课件。
- [ ] 教师可发布为现有 classroom/stage。
- [ ] 教师 AI 辅助只生成建议，教师确认后才应用。
- [ ] 所有新增 UI 文案通过 i18n 管理。
- [ ] Focused unit tests、i18n 校验、lint、typecheck 和教师 e2e 通过。
