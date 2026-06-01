# 章节独立课堂生成 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 改造课程设计工作台，让每个章节生成独立 Classroom（独立 classroomId），支持多章节并行生成，章节 Studio 独立编辑和发布，课程级发布聚合所有已发布章节。

**架构：** `CourseProject` 新增 `chapterClassrooms?: Record<string, CourseChapterClassroom>` 字段追踪每章节的独立课堂状态。新增 `/chapters/[chapterId]/generate|publish|route` API 路由（嵌套在 `projects/[projectId]/chapters/[chapterId]/`），新增 `/chapters/[chapterId]/generate|studio` UI 页面，改造设计工作台章节卡片展示生成状态。课程级发布路由改造为聚合所有已发布章节的 scenes。

**技术栈：** Next.js App Router, TypeScript strict, Tailwind CSS, Vitest, lucide-react, i18next

**规格文档：** `docs/superpowers/specs/2026-05-16-chapter-independent-classroom-design.md`

---

## 文件结构

### 新增文件

| 文件 | 职责 |
|------|------|
| `app/api/teacher/projects/[projectId]/chapters/[chapterId]/route.ts` | 章节状态查询（GET） |
| `app/api/teacher/projects/[projectId]/chapters/[chapterId]/generate/route.ts` | 章节完整生成（POST） |
| `app/api/teacher/projects/[projectId]/chapters/[chapterId]/publish/route.ts` | 章节发布（POST） |
| `app/teacher/projects/[projectId]/chapters/[chapterId]/generate/page.tsx` | 章节生成服务端页面 |
| `app/teacher/projects/[projectId]/chapters/[chapterId]/studio/page.tsx` | 章节 Studio 服务端页面 |
| `components/teacher/chapter-generate-shell.tsx` | 章节生成客户端壳 |
| `components/teacher/chapter-studio-shell.tsx` | 章节 Studio 客户端壳 |
| `components/teacher/course-publish-button.tsx` | 课程级发布按钮 |
| `components/teacher/design-workbench/chapter-classroom-status-badge.tsx` | 章节状态徽标 |
| `components/teacher/design-workbench/chapter-studio-button.tsx` | 进入章节 Studio 按钮 |
| `tests/teacher/chapter-classroom-types.test.ts` | 路由函数单元测试 |
| `tests/teacher/chapter-classroom-update.test.ts` | applyChapterClassroomUpdate 单元测试 |

### 改造文件

| 文件 | 改动 |
|------|------|
| `lib/teacher/course-types.ts` | 新增类型 + `CourseProject` 字段 |
| `lib/teacher/routes.ts` | 新增路由构建函数 |
| `lib/teacher/course-project.ts` | 新增辅助函数 `applyChapterClassroomUpdate` |
| `app/api/teacher/projects/[projectId]/publish/route.ts` | 改造为聚合章节 classrooms 发布 |
| `lib/i18n/locales/zh-CN.json` | 新增 i18n key |
| `lib/i18n/locales/en-US.json` + 其他 4 个 locale 文件 | 同步 key |
| `components/teacher/design-workbench/chapter-list-editor.tsx` | 章节卡片操作区状态改造 |
| `components/teacher/course-project-design-shell.tsx` | 路由改造 + 轮询 + 发布按钮集成 |

---

## 任务 1：数据模型 + 路由函数

**文件：**
- 修改：`lib/teacher/course-types.ts`
- 修改：`lib/teacher/routes.ts`
- 创建：`tests/teacher/chapter-classroom-types.test.ts`

- [ ] **步骤 1：编写路由函数失败测试**

```typescript
// tests/teacher/chapter-classroom-types.test.ts
import { describe, expect, test } from 'vitest';
import { buildChapterGeneratePath, buildChapterStudioPath } from '@/lib/teacher/routes';

describe('chapter classroom route builders', () => {
  test('buildChapterGeneratePath returns correct path', () => {
    expect(buildChapterGeneratePath('proj-1', 'ch-1')).toBe(
      '/teacher/projects/proj-1/chapters/ch-1/generate',
    );
  });

  test('buildChapterStudioPath returns correct path', () => {
    expect(buildChapterStudioPath('proj-1', 'ch-1')).toBe(
      '/teacher/projects/proj-1/chapters/ch-1/studio',
    );
  });

  test('buildChapterGeneratePath URL-encodes special characters', () => {
    expect(buildChapterGeneratePath('p r o j', 'c h')).toBe(
      '/teacher/projects/p%20r%20o%20j/chapters/c%20h/generate',
    );
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
cd d:/CodeSpace/VibeSpace/case003/OpenMAIC
pnpm test tests/teacher/chapter-classroom-types.test.ts 2>&1 | Select-Object -Last 10
```
预期：FAIL，`buildChapterGeneratePath is not a function`

- [ ] **步骤 3：在 `course-types.ts` 末尾（`TeacherRunStatus` 接口之后）追加新类型**

```typescript
export type CourseChapterClassroomStatus =
  | 'generating'
  | 'ready'
  | 'published'
  | 'failed';

export interface CourseChapterClassroom {
  readonly chapterId: string;
  readonly classroomId: string;
  readonly status: CourseChapterClassroomStatus;
  readonly sceneCount?: number;
  readonly failedReason?: string;
  readonly publishedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
```

在 `CourseProject` 接口的 `publishedClassroomId?: string;` 行之后追加：

```typescript
  /** Per-chapter independent classrooms. chapterId → CourseChapterClassroom */
  chapterClassrooms?: Record<string, CourseChapterClassroom>;
```

- [ ] **步骤 4：在 `routes.ts` 末尾追加两个路由构建函数**

```typescript
export function buildChapterGeneratePath(projectId: string, chapterId: string): string {
  return `/teacher/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/generate`;
}

export function buildChapterStudioPath(projectId: string, chapterId: string): string {
  return `/teacher/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/studio`;
}
```

- [ ] **步骤 5：运行测试确认通过**

```bash
pnpm test tests/teacher/chapter-classroom-types.test.ts 2>&1 | Select-Object -Last 10
```
预期：3/3 PASS

- [ ] **步骤 6：TypeScript 检查**

```bash
npx tsc --noEmit 2>&1 | Select-Object -First 20
```
预期：0 errors

- [ ] **步骤 7：Commit**

```bash
git add lib/teacher/course-types.ts lib/teacher/routes.ts tests/teacher/chapter-classroom-types.test.ts
git commit -m "feat(teacher): add CourseChapterClassroom type and chapter route builders"
```

---

## 任务 2：`applyChapterClassroomUpdate` 辅助函数

**文件：**
- 修改：`lib/teacher/course-project.ts`
- 创建：`tests/teacher/chapter-classroom-update.test.ts`

- [ ] **步骤 1：编写失败测试**

```typescript
// tests/teacher/chapter-classroom-update.test.ts
import { describe, expect, test } from 'vitest';
import { applyChapterClassroomUpdate } from '@/lib/teacher/course-project';
import type { CourseChapterClassroom, CourseProject } from '@/lib/teacher/course-types';

function makeProject(overrides: Partial<CourseProject> = {}): CourseProject {
  return {
    id: 'proj-1',
    title: 'Test Course',
    requirements: { requirement: 'Test requirement' },
    chapterCount: 2,
    workflowTemplateId: 'standard-course',
    status: 'editing',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    artifacts: [],
    ...overrides,
  };
}

const classroom: CourseChapterClassroom = {
  chapterId: 'ch-1',
  classroomId: 'proj-1-ch-ch-1',
  status: 'ready',
  sceneCount: 5,
  createdAt: '2026-05-16T00:00:00.000Z',
  updatedAt: '2026-05-16T00:00:00.000Z',
};

describe('applyChapterClassroomUpdate', () => {
  test('sets chapterClassrooms when previously absent', () => {
    const updated = applyChapterClassroomUpdate(makeProject(), classroom);
    expect(updated.chapterClassrooms?.['ch-1']).toEqual(classroom);
  });

  test('merges with existing sibling classrooms', () => {
    const sibling: CourseChapterClassroom = {
      ...classroom,
      chapterId: 'ch-2',
      classroomId: 'proj-1-ch-ch-2',
    };
    const project = makeProject({ chapterClassrooms: { 'ch-2': sibling } });
    const updated = applyChapterClassroomUpdate(project, classroom);
    expect(updated.chapterClassrooms?.['ch-1']).toEqual(classroom);
    expect(updated.chapterClassrooms?.['ch-2']).toEqual(sibling);
  });

  test('overwrites existing entry for the same chapterId', () => {
    const old: CourseChapterClassroom = { ...classroom, status: 'generating' };
    const project = makeProject({ chapterClassrooms: { 'ch-1': old } });
    const updated = applyChapterClassroomUpdate(project, classroom);
    expect(updated.chapterClassrooms?.['ch-1'].status).toBe('ready');
  });

  test('does not mutate the original project', () => {
    const project = makeProject();
    applyChapterClassroomUpdate(project, classroom);
    expect(project.chapterClassrooms).toBeUndefined();
  });

  test('transitions project status to editing when chapter becomes ready and project was outlining', () => {
    const project = makeProject({ status: 'outlining' });
    const updated = applyChapterClassroomUpdate(project, { ...classroom, status: 'ready' });
    expect(updated.status).toBe('editing');
  });

  test('does not change project status when chapter is only generating', () => {
    const project = makeProject({ status: 'outlining' });
    const updated = applyChapterClassroomUpdate(project, { ...classroom, status: 'generating' });
    expect(updated.status).toBe('outlining');
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
pnpm test tests/teacher/chapter-classroom-update.test.ts 2>&1 | Select-Object -Last 10
```
预期：FAIL，`applyChapterClassroomUpdate is not a function`

- [ ] **步骤 3：在 `lib/teacher/course-project.ts` 末尾追加函数**

先在文件顶部确认 `CourseChapterClassroom` 已从 `course-types` 导入，若无则添加：

```typescript
import type { CourseChapterClassroom, CourseProject } from '@/lib/teacher/course-types';
```

然后在文件末尾追加（在所有现有函数之后）：

```typescript
/**
 * Returns a new CourseProject with the given chapter classroom record applied.
 * Deep-merges chapterClassrooms to avoid overwriting sibling chapter entries.
 * Transitions project status to 'editing' when a chapter first becomes ready.
 */
export function applyChapterClassroomUpdate(
  project: CourseProject,
  chapterClassroom: CourseChapterClassroom,
): CourseProject {
  const now = new Date().toISOString();
  const shouldTransitionToEditing =
    chapterClassroom.status === 'ready' &&
    (project.status === 'draft' || project.status === 'outlining');
  return {
    ...project,
    status: shouldTransitionToEditing ? 'editing' : project.status,
    updatedAt: now,
    chapterClassrooms: {
      ...project.chapterClassrooms,
      [chapterClassroom.chapterId]: chapterClassroom,
    },
  };
}
```

- [ ] **步骤 4：运行测试确认通过**

```bash
pnpm test tests/teacher/chapter-classroom-update.test.ts 2>&1 | Select-Object -Last 10
```
预期：6/6 PASS

- [ ] **步骤 5：TypeScript 检查**

```bash
npx tsc --noEmit 2>&1 | Select-Object -First 20
```
预期：0 errors

- [ ] **步骤 6：Commit**

```bash
git add lib/teacher/course-project.ts tests/teacher/chapter-classroom-update.test.ts
git commit -m "feat(teacher): add applyChapterClassroomUpdate helper"
```

---

## 任务 3：章节状态查询 API（GET）+ 章节发布 API（POST）

**文件：**
- 创建：`app/api/teacher/projects/[projectId]/chapters/[chapterId]/route.ts`
- 创建：`app/api/teacher/projects/[projectId]/chapters/[chapterId]/publish/route.ts`

- [ ] **步骤 1：创建目录结构并实现 GET 路由**

```typescript
// app/api/teacher/projects/[projectId]/chapters/[chapterId]/route.ts
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import {
  isValidTeacherProjectId,
  readTeacherProject,
} from '@/lib/teacher/course-project-storage';

type ChapterRouteContext = {
  params: Promise<{ projectId: string; chapterId: string }>;
};

export async function GET(_request: Request, context: ChapterRouteContext) {
  const { projectId, chapterId } = await context.params;

  if (!isValidTeacherProjectId(projectId)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
  }

  const project = await readTeacherProject(projectId);
  if (!project) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
  }

  const chapterClassroom = project.chapterClassrooms?.[chapterId] ?? null;
  return apiSuccess({ chapterClassroom });
}
```

- [ ] **步骤 2：创建章节发布路由**

```typescript
// app/api/teacher/projects/[projectId]/chapters/[chapterId]/publish/route.ts
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { applyChapterClassroomUpdate } from '@/lib/teacher/course-project';
import {
  isValidTeacherProjectId,
  readTeacherProject,
  writeTeacherProject,
} from '@/lib/teacher/course-project-storage';

type ChapterPublishRouteContext = {
  params: Promise<{ projectId: string; chapterId: string }>;
};

export async function POST(_request: Request, context: ChapterPublishRouteContext) {
  const { projectId, chapterId } = await context.params;

  if (!isValidTeacherProjectId(projectId)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
  }

  const project = await readTeacherProject(projectId);
  if (!project) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
  }

  const chapterClassroom = project.chapterClassrooms?.[chapterId];
  if (!chapterClassroom) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Chapter classroom not found — generate first');
  }

  if (chapterClassroom.status !== 'ready' && chapterClassroom.status !== 'published') {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      400,
      `Cannot publish chapter with status: ${chapterClassroom.status}`,
    );
  }

  // Idempotent: already published
  if (chapterClassroom.status === 'published') {
    return apiSuccess({ chapterClassroom });
  }

  const now = new Date().toISOString();
  const publishedClassroom = {
    ...chapterClassroom,
    status: 'published' as const,
    publishedAt: now,
    updatedAt: now,
  };
  const updatedProject = applyChapterClassroomUpdate(project, publishedClassroom);
  await writeTeacherProject(updatedProject);

  return apiSuccess({ chapterClassroom: publishedClassroom });
}
```

- [ ] **步骤 3：TypeScript 检查**

```bash
cd d:/CodeSpace/VibeSpace/case003/OpenMAIC
npx tsc --noEmit 2>&1 | Select-Object -First 20
```
预期：0 errors

- [ ] **步骤 4：Commit**

```bash
git add "app/api/teacher/projects/[projectId]/chapters/[chapterId]/route.ts" "app/api/teacher/projects/[projectId]/chapters/[chapterId]/publish/route.ts"
git commit -m "feat(teacher-api): add chapter status GET and chapter publish POST endpoints"
```

---

## 任务 4：章节生成 API（POST）

**文件：**
- 创建：`app/api/teacher/projects/[projectId]/chapters/[chapterId]/generate/route.ts`

**背景：** 此路由整合了 `generate-outline/route.ts` 和 `generate-chapter/route.ts` 的核心逻辑，生成独立的章节 classroom。关键差异：`buildCompleteScene` 的 `stageId` 参数使用 `classroomId`（而非 `project.id`），`persistClassroom` 使用 `classroomId`，完成后更新 `project.chapterClassrooms`。

**重要：** 先读取 `lib/types/stage.ts` 了解 `Stage` 接口的必填字段，然后再实现 `buildStageForChapter`。

- [ ] **步骤 1：读取 `lib/types/stage.ts` 确认 `Stage` 接口**

```bash
cd d:/CodeSpace/VibeSpace/case003/OpenMAIC
# 读取文件找到 Stage interface
```

若 `Stage` 只需要 `{ id: string; title: string; updatedAt: number }`，则 `buildStageForChapter` 可以简单实现。若有更多必填字段，需要参考 `buildStageFromTeacherProject`（在 `lib/teacher/course-publish.ts`）来补全。

- [ ] **步骤 2：创建章节生成路由**

```typescript
// app/api/teacher/projects/[projectId]/chapters/[chapterId]/generate/route.ts
import { type NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import {
  buildCompleteScene,
  generateSceneActions,
  generateSceneContent,
  type SceneGenerationContext,
} from '@/lib/generation/generation-pipeline';
import {
  applyOutlineFallbacks,
  generateSceneOutlinesFromRequirements,
} from '@/lib/generation/outline-generator';
import { buildLanguageText } from '@/lib/generation/prompt-formatters';
import { uniquifyMediaElementIds } from '@/lib/generation/scene-builder';
import { getDefaultAgents } from '@/lib/orchestration/registry/store';
import { createLogger } from '@/lib/logger';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import {
  buildRequestOrigin,
  persistClassroom,
} from '@/lib/server/classroom-storage';
import {
  generateMediaForClassroom,
  replaceMediaPlaceholders,
} from '@/lib/server/classroom-media-generation';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { applyChapterClassroomUpdate } from '@/lib/teacher/course-project';
import {
  isValidTeacherProjectId,
  readTeacherProject,
  writeTeacherProject,
} from '@/lib/teacher/course-project-storage';
import type {
  CourseChapter,
  CourseChapterClassroom,
  CourseProject,
} from '@/lib/teacher/course-types';
import type { Action } from '@/lib/types/action';
import type { Scene, Stage } from '@/lib/types/stage';

type ChapterGenerateRouteContext = {
  params: Promise<{ projectId: string; chapterId: string }>;
};

const log = createLogger('Teacher Chapter Classroom Generate API');

export const maxDuration = 300;

function buildChapterClassroomId(projectId: string, chapterId: string): string {
  return `${projectId}-ch-${chapterId}`;
}

/**
 * Builds a minimal Stage for a chapter classroom.
 * If TypeScript reports missing required fields, read lib/types/stage.ts
 * and add the additional fields that match buildStageFromTeacherProject in course-publish.ts.
 */
function buildStageForChapter(classroomId: string, chapter: CourseChapter): Stage {
  return {
    id: classroomId,
    title: chapter.title,
    updatedAt: Date.now(),
  } as Stage; // cast to satisfy additional optional/required fields
}

function collectSpeechTexts(actions: Action[]): string[] {
  return actions
    .filter((action) => action.type === 'speech')
    .map((action) => action.text)
    .filter((text) => text.length > 0);
}

function buildTeacherContextForChapter(
  project: CourseProject,
  chapter: CourseChapter,
): string {
  const lines: string[] = [
    `This is one chapter of a teacher-authored course titled "${project.title}".`,
    `Course overview: ${project.overview ?? project.requirements.requirement}`,
    `Chapter title: ${chapter.title}`,
  ];
  if (chapter.summary) lines.push(`Chapter summary: ${chapter.summary}`);
  if (chapter.learningObjectives.length > 0) {
    lines.push('Chapter learning objectives:');
    for (const obj of chapter.learningObjectives) lines.push(`- ${obj}`);
  }
  lines.push('Generate scene outlines for THIS chapter only.');
  return lines.join('\n');
}

export async function POST(request: NextRequest, context: ChapterGenerateRouteContext) {
  const { projectId, chapterId } = await context.params;

  if (!isValidTeacherProjectId(projectId)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
  }

  const project = await readTeacherProject(projectId);
  if (!project) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
  }

  const chapter = project.outline?.chapters.find((c) => c.id === chapterId);
  if (!chapter) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Chapter not found in project outline');
  }

  if (chapter.locked) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Locked chapters cannot be generated');
  }

  const classroomId = buildChapterClassroomId(projectId, chapterId);
  const now = new Date().toISOString();

  // Immediately mark as generating so design workbench polling can detect it
  const generatingClassroom: CourseChapterClassroom = {
    chapterId,
    classroomId,
    status: 'generating',
    createdAt: now,
    updatedAt: now,
  };
  try {
    await writeTeacherProject(applyChapterClassroomUpdate(project, generatingClassroom));
  } catch (err) {
    log.warn('Failed to write generating status, continuing:', err);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const {
      model: languageModel,
      modelInfo,
      thinkingConfig,
    } = await resolveModelFromRequest(request, body);

    const aiCall = async (systemPrompt: string, userPrompt: string): Promise<string> => {
      const result = await callLLM(
        {
          model: languageModel,
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: modelInfo?.outputWindow,
        },
        'teacher-chapter-classroom',
        undefined,
        thinkingConfig,
      );
      return result.text;
    };

    // Step 1: Generate outline if chapter has no sceneOutlines
    let workingChapter = chapter;
    if (!workingChapter.sceneOutlines || workingChapter.sceneOutlines.length === 0) {
      const teacherContext = buildTeacherContextForChapter(project, workingChapter);
      const baseRequirements = {
        ...project.requirements,
        requirement: project.overview?.trim() || project.requirements.requirement,
      };
      const outlineResult = await generateSceneOutlinesFromRequirements(
        baseRequirements,
        undefined,
        undefined,
        aiCall,
        undefined,
        { teacherContext },
      );
      if (!outlineResult.success || !outlineResult.data) {
        throw new Error('Failed to generate chapter outline');
      }
      const sceneOutlines = outlineResult.data.outlines.map((o, i) => ({ ...o, order: i }));
      workingChapter = { ...workingChapter, sceneOutlines };

      // Write outline back to project
      const freshProject = await readTeacherProject(projectId);
      if (freshProject?.outline) {
        await writeTeacherProject({
          ...freshProject,
          outline: {
            ...freshProject.outline,
            languageDirective:
              outlineResult.data.languageDirective ?? freshProject.outline.languageDirective,
            chapters: freshProject.outline.chapters.map((c) =>
              c.id === chapterId ? workingChapter : c,
            ),
          },
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // Step 2: Generate scenes (using classroomId as stageId)
    const agents = getDefaultAgents();
    const languageDirective = buildLanguageText(project.outline?.languageDirective);
    const chapterOutlines = uniquifyMediaElementIds(workingChapter.sceneOutlines);
    const allTitles = chapterOutlines.map((o) => o.title);
    const totalPages = chapterOutlines.length;
    const scenes: Scene[] = [];
    let previousSpeeches: string[] = [];

    for (const [index, outline] of chapterOutlines.entries()) {
      const safeOutline = applyOutlineFallbacks(outline, true);
      const content = await generateSceneContent(safeOutline, aiCall, {
        agents,
        languageDirective,
        thinkingConfig,
        ...(safeOutline.type === 'pbl' ? { languageModel } : {}),
      });
      if (!content) throw new Error(`Failed to generate content for scene: ${outline.id}`);

      const ctx: SceneGenerationContext = {
        pageIndex: index + 1,
        totalPages,
        allTitles,
        previousSpeeches,
      };
      const actions = await generateSceneActions(safeOutline, content, aiCall, {
        ctx,
        agents,
        languageDirective,
      });
      previousSpeeches = collectSpeechTexts(actions);

      // Use classroomId (not project.id) as stageId so scenes belong to this chapter classroom
      const scene = buildCompleteScene(safeOutline, content, actions, classroomId);
      if (!scene) throw new Error(`Failed to build scene: ${outline.id}`);
      scenes.push(scene);
    }

    // Step 3: Media replacement
    try {
      const baseUrl = buildRequestOrigin(request);
      const mediaMap = await generateMediaForClassroom(chapterOutlines, classroomId, baseUrl);
      if (Object.keys(mediaMap).length > 0) replaceMediaPlaceholders(scenes, mediaMap);
    } catch (mediaErr) {
      log.warn('Chapter classroom media generation failed, continuing:', mediaErr);
    }

    // Step 4: Persist chapter classroom
    const stage = buildStageForChapter(classroomId, workingChapter);
    const baseUrl = buildRequestOrigin(request);
    await persistClassroom({ id: classroomId, stage, scenes }, baseUrl);

    // Step 5: Update project with ready status
    const latestProject = await readTeacherProject(projectId);
    if (!latestProject) throw new Error('Project disappeared during generation');

    const readyClassroom: CourseChapterClassroom = {
      chapterId,
      classroomId,
      status: 'ready',
      sceneCount: scenes.length,
      createdAt: now,
      updatedAt: new Date().toISOString(),
    };
    await writeTeacherProject(applyChapterClassroomUpdate(latestProject, readyClassroom));

    return apiSuccess({ classroomId, sceneCount: scenes.length });
  } catch (error) {
    log.error('Chapter classroom generation failed:', error);
    try {
      const failedProject = await readTeacherProject(projectId);
      if (failedProject) {
        const failedClassroom: CourseChapterClassroom = {
          chapterId,
          classroomId,
          status: 'failed',
          failedReason: error instanceof Error ? error.message : 'Unknown error',
          createdAt: now,
          updatedAt: new Date().toISOString(),
        };
        await writeTeacherProject(applyChapterClassroomUpdate(failedProject, failedClassroom));
      }
    } catch (writeErr) {
      log.error('Failed to write failure status:', writeErr);
    }
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to generate chapter classroom',
    );
  }
}
```

- [ ] **步骤 3：TypeScript 检查，修复 Stage 类型问题**

```bash
npx tsc --noEmit 2>&1 | Select-Object -First 30
```

若报 Stage 缺少字段，读取 `lib/types/stage.ts` 中的 `Stage` 接口，参考 `lib/teacher/course-publish.ts` 中的 `buildStageFromTeacherProject` 补全 `buildStageForChapter` 的返回值。

- [ ] **步骤 4：Commit**

```bash
git add "app/api/teacher/projects/[projectId]/chapters/[chapterId]/generate/route.ts"
git commit -m "feat(teacher-api): add chapter independent classroom generate endpoint"
```

---

## 任务 5：改造课程级发布 API

**文件：**
- 修改：`app/api/teacher/projects/[projectId]/publish/route.ts`

**背景：** 现有路由调用 `getPublishableScenes(project)` 获取 scenes 并发布。改造后优先从 `chapterClassrooms` 中 `status === 'published'` 的章节读取 scenes（使用 `readClassroom`），若无则退回现有逻辑（向后兼容）。

- [ ] **步骤 1：在 import 区域添加 `readClassroom` 和 `Scene`**

找到文件顶部 import，将：
```typescript
import { buildRequestOrigin, persistClassroom } from '@/lib/server/classroom-storage';
```
改为：
```typescript
import { buildRequestOrigin, persistClassroom, readClassroom } from '@/lib/server/classroom-storage';
```

若 `Scene` 类型未导入，追加：
```typescript
import type { Scene } from '@/lib/types/stage';
```

- [ ] **步骤 2：替换 `getPublishableScenes` 逻辑**

找到 `const scenes = getPublishableScenes(project);` 这行，用以下代码替换：

```typescript
const publishedChapterEntries = Object.values(project.chapterClassrooms ?? {})
  .filter((cc) => cc.status === 'published')
  .sort((a, b) => {
    const aIdx = project.outline?.chapters.findIndex((c) => c.id === a.chapterId) ?? 0;
    const bIdx = project.outline?.chapters.findIndex((c) => c.id === b.chapterId) ?? 0;
    return aIdx - bIdx;
  });

let scenes: Scene[];
if (publishedChapterEntries.length > 0) {
  const classroomScenes = await Promise.all(
    publishedChapterEntries.map(async (cc) => {
      const classroom = await readClassroom(cc.classroomId);
      return classroom?.scenes ?? [];
    }),
  );
  scenes = classroomScenes.flat();

  if (scenes.length === 0) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      400,
      'Published chapter classrooms exist but contain no scenes',
    );
  }
} else {
  // Backward compatibility: use artifact-based scenes
  scenes = getPublishableScenes(project);
}
```

- [ ] **步骤 3：TypeScript 检查**

```bash
npx tsc --noEmit 2>&1 | Select-Object -First 20
```
预期：0 errors

- [ ] **步骤 4：Commit**

```bash
git add "app/api/teacher/projects/[projectId]/publish/route.ts"
git commit -m "feat(teacher-api): aggregate published chapter classrooms in course publish"
```

---

## 任务 6：i18n key

**文件：**
- 修改：`lib/i18n/locales/zh-CN.json`
- 修改：`lib/i18n/locales/en-US.json`
- 修改：`lib/i18n/locales/ar-SA.json`、`ja-JP.json`、`ru-RU.json`、`zh-TW.json`（英文占位）

- [ ] **步骤 1：在 `zh-CN.json` 的 `teacher` 节点下添加新 key**

找到 `"teacher"` 节点（已有 `"assist"`、`"studio"` 等子节点），添加：

```json
"chapter": {
  "status": {
    "generating": "生成中",
    "ready": "已生成",
    "published": "已发布",
    "failed": "生成失败"
  },
  "goToStudio": "进入 Studio",
  "regenerate": "重新生成",
  "retry": "重试",
  "generate": "生成课件",
  "confirmRegenerate": "该章节已生成内容，重新生成将覆盖现有课件。确定继续吗？"
},
"publishCourse": {
  "button": "发布课程",
  "progress": "{{count}} / {{total}} 章节已发布",
  "confirmTitle": "发布课程",
  "confirmDescription": "将所有已发布章节合并发布为完整课程。",
  "noPublishedChapters": "没有可发布的章节，请先在章节 Studio 中发布各章节。",
  "success": "课程发布成功"
},
"chapterStudio": {
  "publishChapter": "发布章节",
  "backToDesign": "返回设计工作台",
  "chapterLabel": "第 {{order}} 章",
  "publishSuccess": "章节已发布",
  "publishing": "发布中..."
}
```

- [ ] **步骤 2：在 `en-US.json` 添加对应 key**

```json
"chapter": {
  "status": {
    "generating": "Generating",
    "ready": "Ready",
    "published": "Published",
    "failed": "Failed"
  },
  "goToStudio": "Open Studio",
  "regenerate": "Regenerate",
  "retry": "Retry",
  "generate": "Generate Courseware",
  "confirmRegenerate": "This chapter already has generated content. Regenerating will overwrite the existing courseware. Continue?"
},
"publishCourse": {
  "button": "Publish Course",
  "progress": "{{count}} / {{total}} chapters published",
  "confirmTitle": "Publish Course",
  "confirmDescription": "Merge all published chapters into a complete course.",
  "noPublishedChapters": "No chapters are published yet. Please publish chapters in the Chapter Studio first.",
  "success": "Course published successfully"
},
"chapterStudio": {
  "publishChapter": "Publish Chapter",
  "backToDesign": "Back to Design",
  "chapterLabel": "Chapter {{order}}",
  "publishSuccess": "Chapter published",
  "publishing": "Publishing..."
}
```

- [ ] **步骤 3：在 ar-SA、ja-JP、ru-RU、zh-TW 添加相同 key（英文占位）**

在这 4 个 locale 文件中复制 en-US 的同结构 JSON，插入 `teacher` 节点中相同位置。

- [ ] **步骤 4：验证 i18n key 对称**

```bash
cd d:/CodeSpace/VibeSpace/case003/OpenMAIC
pnpm check:i18n-keys 2>&1 | Select-Object -Last 10
```
预期：通过，无缺失 key 报错

- [ ] **步骤 5：Commit**

```bash
git add lib/i18n/locales/
git commit -m "feat(i18n): add chapter classroom, chapter studio, and course publish keys"
```

---

## 任务 7：UI 原子组件（状态徽标 + Studio 按钮）

**文件：**
- 创建：`components/teacher/design-workbench/chapter-classroom-status-badge.tsx`
- 创建：`components/teacher/design-workbench/chapter-studio-button.tsx`

- [ ] **步骤 1：创建 `ChapterClassroomStatusBadge`**

```typescript
// components/teacher/design-workbench/chapter-classroom-status-badge.tsx
'use client';

import { BookOpen, CheckCircle, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { CourseChapterClassroomStatus } from '@/lib/teacher/course-types';

interface ChapterClassroomStatusBadgeProps {
  readonly status: CourseChapterClassroomStatus;
  readonly className?: string;
}

const STATUS_CONFIG: Record<
  CourseChapterClassroomStatus,
  {
    Icon: React.ComponentType<{ className?: string }>;
    colorClass: string;
    labelKey: string;
  }
> = {
  generating: {
    Icon: Loader2,
    colorClass: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/40',
    labelKey: 'teacher.chapter.status.generating',
  },
  ready: {
    Icon: CheckCircle,
    colorClass: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40',
    labelKey: 'teacher.chapter.status.ready',
  },
  published: {
    Icon: BookOpen,
    colorClass: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/40',
    labelKey: 'teacher.chapter.status.published',
  },
  failed: {
    Icon: XCircle,
    colorClass: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/40',
    labelKey: 'teacher.chapter.status.failed',
  },
};

export function ChapterClassroomStatusBadge({
  status,
  className,
}: ChapterClassroomStatusBadgeProps) {
  const { t } = useI18n();
  const { Icon, colorClass, labelKey } = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        colorClass,
        className,
      )}
    >
      <Icon
        className={cn('h-3 w-3', status === 'generating' && 'animate-spin')}
        aria-hidden="true"
      />
      {t(labelKey)}
    </span>
  );
}
```

- [ ] **步骤 2：创建 `ChapterStudioButton`**

```typescript
// components/teacher/design-workbench/chapter-studio-button.tsx
'use client';

import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';

interface ChapterStudioButtonProps {
  readonly onClick: () => void;
  readonly disabled?: boolean;
}

export function ChapterStudioButton({ onClick, disabled }: ChapterStudioButtonProps) {
  const { t } = useI18n();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="gap-1.5"
      disabled={disabled}
      onClick={onClick}
    >
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      {t('teacher.chapter.goToStudio')}
    </Button>
  );
}
```

- [ ] **步骤 3：TypeScript 检查**

```bash
npx tsc --noEmit 2>&1 | Select-Object -First 20
```
预期：0 errors

- [ ] **步骤 4：Commit**

```bash
git add components/teacher/design-workbench/chapter-classroom-status-badge.tsx components/teacher/design-workbench/chapter-studio-button.tsx
git commit -m "feat(teacher-ui): add chapter classroom status badge and studio button"
```

---

## 任务 8：ChapterGenerateShell + 章节生成页

**文件：**
- 创建：`components/teacher/chapter-generate-shell.tsx`
- 创建：`app/teacher/projects/[projectId]/chapters/[chapterId]/generate/page.tsx`

- [ ] **步骤 1：创建 `ChapterGenerateShell`**

```typescript
// components/teacher/chapter-generate-shell.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  getTeacherGenerationHeaders,
  withCurrentTeacherThinkingConfig,
} from '@/lib/teacher/client-generation-config';
import { buildChapterStudioPath } from '@/lib/teacher/routes';

interface ChapterGenerateShellProps {
  readonly projectId: string;
  readonly chapterId: string;
  readonly chapterTitle: string;
}

type GenerateState = 'idle' | 'generating' | 'done' | 'error';

export function ChapterGenerateShell({
  projectId,
  chapterId,
  chapterTitle,
}: ChapterGenerateShellProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<GenerateState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasStarted = useRef(false);

  const studioPath = buildChapterStudioPath(projectId, chapterId);

  const generate = async () => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    setState('generating');
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/teacher/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/generate`,
        {
          method: 'POST',
          headers: getTeacherGenerationHeaders(),
          body: JSON.stringify(withCurrentTeacherThinkingConfig({})),
        },
      );

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(
          (json as { error?: string }).error ?? `HTTP ${response.status}`,
        );
      }

      setState('done');
      router.push(studioPath);
    } catch (err) {
      setState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
      hasStarted.current = false;
    }
  };

  // Auto-start on mount
  useEffect(() => {
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">{chapterTitle}</h1>

        {state === 'generating' && (
          <div className="mt-4 flex flex-col items-center gap-3">
            <Loader2
              className="h-8 w-8 animate-spin text-purple-500"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">
              {t('teacher.chapter.status.generating')}…
            </p>
          </div>
        )}

        {state === 'done' && (
          <p className="mt-4 text-sm text-emerald-600">
            {t('teacher.chapter.status.ready')}
          </p>
        )}

        {state === 'error' && (
          <div className="mt-4 flex flex-col items-center gap-3">
            <p className="text-sm text-red-600">{errorMessage}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void generate()}
            >
              {t('teacher.chapter.retry')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **步骤 2：创建章节生成服务端页面**

```typescript
// app/teacher/projects/[projectId]/chapters/[chapterId]/generate/page.tsx
import { redirect } from 'next/navigation';
import { readTeacherProject } from '@/lib/teacher/course-project-storage';
import {
  buildChapterStudioPath,
  buildTeacherDesignPath,
} from '@/lib/teacher/routes';
import { ChapterGenerateShell } from '@/components/teacher/chapter-generate-shell';

type PageProps = {
  params: Promise<{ projectId: string; chapterId: string }>;
};

export default async function ChapterGeneratePage({ params }: PageProps) {
  const { projectId, chapterId } = await params;
  const project = await readTeacherProject(projectId);

  if (!project) {
    redirect(buildTeacherDesignPath(projectId));
  }

  // If already generated, skip to studio
  const existing = project.chapterClassrooms?.[chapterId];
  if (existing?.status === 'ready' || existing?.status === 'published') {
    redirect(buildChapterStudioPath(projectId, chapterId));
  }

  const chapter = project.outline?.chapters.find((c) => c.id === chapterId);
  if (!chapter) {
    redirect(buildTeacherDesignPath(projectId));
  }

  return (
    <ChapterGenerateShell
      projectId={projectId}
      chapterId={chapterId}
      chapterTitle={chapter.title}
    />
  );
}
```

- [ ] **步骤 3：TypeScript 检查**

```bash
npx tsc --noEmit 2>&1 | Select-Object -First 20
```
预期：0 errors

- [ ] **步骤 4：Commit**

```bash
git add components/teacher/chapter-generate-shell.tsx "app/teacher/projects/[projectId]/chapters/[chapterId]/generate/page.tsx"
git commit -m "feat(teacher): add chapter generate shell and page"
```

---

## 任务 9：ChapterStudioShell + 章节 Studio 页

**文件：**
- 创建：`components/teacher/chapter-studio-shell.tsx`
- 创建：`app/teacher/projects/[projectId]/chapters/[chapterId]/studio/page.tsx`

- [ ] **步骤 1：创建 `ChapterStudioShell`**

```typescript
// components/teacher/chapter-studio-shell.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { CourseEditorShell } from '@/components/course-editor/course-editor-shell';
import { buildTeacherDesignPath } from '@/lib/teacher/routes';
import type { CourseProject } from '@/lib/teacher/course-types';

interface ChapterStudioShellProps {
  readonly project: CourseProject;
  readonly chapterId: string;
  readonly classroomId: string;
  readonly chapterTitle: string;
  readonly chapterOrder: number;
}

export function ChapterStudioShell({
  project,
  chapterId,
  classroomId,
  chapterTitle,
  chapterOrder,
}: ChapterStudioShellProps) {
  const { t } = useI18n();
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [published, setPublished] = useState(
    project.chapterClassrooms?.[chapterId]?.status === 'published',
  );

  const handlePublishChapter = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      const response = await fetch(
        `/api/teacher/projects/${encodeURIComponent(project.id)}/chapters/${encodeURIComponent(chapterId)}/publish`,
        { method: 'POST' },
      );
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(
          (json as { error?: string }).error ?? `HTTP ${response.status}`,
        );
      }
      setPublished(true);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Top navigation bar */}
      <header className="flex shrink-0 items-center justify-between border-b bg-background px-4 py-2">
        <Link
          href={buildTeacherDesignPath(project.id)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('teacher.chapterStudio.backToDesign')}
        </Link>

        <span className="text-sm font-medium">
          {t('teacher.chapterStudio.chapterLabel', { order: String(chapterOrder) })}
          {': '}
          {chapterTitle}
        </span>

        <div className="flex items-center gap-2">
          {publishError && (
            <span className="text-xs text-red-600">{publishError}</span>
          )}
          {published ? (
            <span className="text-xs font-medium text-purple-600">
              {t('teacher.chapterStudio.publishSuccess')}
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={publishing}
              onClick={() => void handlePublishChapter()}
            >
              {publishing
                ? t('teacher.chapterStudio.publishing')
                : t('teacher.chapterStudio.publishChapter')}
            </Button>
          )}
        </div>
      </header>

      {/* Chapter editor */}
      <div className="min-h-0 flex-1">
        <CourseEditorShell classroomId={classroomId} chapterNav={null} />
      </div>
    </div>
  );
}
```

- [ ] **步骤 2：创建章节 Studio 服务端页面**

```typescript
// app/teacher/projects/[projectId]/chapters/[chapterId]/studio/page.tsx
import { redirect } from 'next/navigation';
import { readTeacherProject } from '@/lib/teacher/course-project-storage';
import {
  buildChapterGeneratePath,
  buildTeacherDesignPath,
} from '@/lib/teacher/routes';
import { ChapterStudioShell } from '@/components/teacher/chapter-studio-shell';

type PageProps = {
  params: Promise<{ projectId: string; chapterId: string }>;
};

export default async function ChapterStudioPage({ params }: PageProps) {
  const { projectId, chapterId } = await params;
  const project = await readTeacherProject(projectId);

  if (!project) {
    redirect(buildTeacherDesignPath(projectId));
  }

  const chapterClassroom = project.chapterClassrooms?.[chapterId];
  if (
    !chapterClassroom ||
    chapterClassroom.status === 'generating' ||
    chapterClassroom.status === 'failed'
  ) {
    redirect(buildChapterGeneratePath(projectId, chapterId));
  }

  const chapters = project.outline?.chapters ?? [];
  const chapter = chapters.find((c) => c.id === chapterId);
  if (!chapter) {
    redirect(buildTeacherDesignPath(projectId));
  }

  const chapterOrder = chapters.findIndex((c) => c.id === chapterId) + 1;

  return (
    <ChapterStudioShell
      project={project}
      chapterId={chapterId}
      classroomId={chapterClassroom.classroomId}
      chapterTitle={chapter.title}
      chapterOrder={chapterOrder}
    />
  );
}
```

- [ ] **步骤 3：TypeScript 检查**

```bash
npx tsc --noEmit 2>&1 | Select-Object -First 20
```
预期：0 errors

- [ ] **步骤 4：Commit**

```bash
git add components/teacher/chapter-studio-shell.tsx "app/teacher/projects/[projectId]/chapters/[chapterId]/studio/page.tsx"
git commit -m "feat(teacher): add chapter studio shell and page"
```

---

## 任务 10：CoursePublishButton 组件

**文件：**
- 创建：`components/teacher/course-publish-button.tsx`

- [ ] **步骤 1：创建组件**

```typescript
// components/teacher/course-publish-button.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { CourseProject } from '@/lib/teacher/course-types';

interface CoursePublishButtonProps {
  readonly project: CourseProject;
  /** Live statuses from polling, overrides project.chapterClassrooms counts */
  readonly liveChapterStatuses?: Record<string, import('@/lib/teacher/course-types').CourseChapterClassroomStatus>;
  readonly onPublishSuccess?: (classroomId: string) => void;
}

export function CoursePublishButton({
  project,
  liveChapterStatuses,
  onPublishSuccess,
}: CoursePublishButtonProps) {
  const { t } = useI18n();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalChapters = project.outline?.chapters.length ?? 0;
  // Prefer live polling statuses over stale server-rendered project data
  const publishedCount = liveChapterStatuses
    ? Object.values(liveChapterStatuses).filter((s) => s === 'published').length
    : Object.values(project.chapterClassrooms ?? {}).filter((cc) => cc.status === 'published').length;
  const canPublish = publishedCount > 0 && !publishing;

  const handlePublish = async () => {
    if (!canPublish) return;
    setPublishing(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/teacher/projects/${encodeURIComponent(project.id)}/publish`,
        { method: 'POST' },
      );
      const json = (await response.json().catch(() => ({}))) as {
        data?: { classroomId?: string };
        error?: string;
      };
      if (!response.ok) {
        throw new Error(json.error ?? `HTTP ${response.status}`);
      }
      if (json.data?.classroomId) {
        onPublishSuccess?.(json.data.classroomId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {t('teacher.publishCourse.progress', {
            count: String(publishedCount),
            total: String(totalChapters),
          })}
        </span>
        <Button
          type="button"
          size="sm"
          disabled={!canPublish}
          onClick={() => void handlePublish()}
        >
          {publishing ? '…' : t('teacher.publishCourse.button')}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **步骤 2：TypeScript 检查**

```bash
npx tsc --noEmit 2>&1 | Select-Object -First 20
```
预期：0 errors

- [ ] **步骤 3：Commit**

```bash
git add components/teacher/course-publish-button.tsx
git commit -m "feat(teacher): add CoursePublishButton for course-level aggregate publish"
```

---

## 任务 11：ChapterListEditor 改造

**文件：**
- 修改：`components/teacher/design-workbench/chapter-list-editor.tsx`

- [ ] **步骤 1：读取文件，确认现有 Props 接口和操作区位置**

阅读 `components/teacher/design-workbench/chapter-list-editor.tsx` 中：
- 组件 Props 类型/接口名称
- `onGenerateChapter` 的类型签名
- `generatingChapterId` 状态的声明位置
- 章节卡片底部操作区 JSX（第 149-156 行附近）

- [ ] **步骤 2：在 Props 接口中添加新 props**

找到组件 props 类型（可能是 interface 或 type），添加以下两个可选字段：

```typescript
onGoToChapterStudio?: (chapterId: string) => void;
getChapterClassroomStatus?: (chapterId: string) =>
  import('@/lib/teacher/course-types').CourseChapterClassroomStatus | undefined;
```

- [ ] **步骤 3：在文件顶部 import 区域添加新组件**

```typescript
import { ChapterClassroomStatusBadge } from '@/components/teacher/design-workbench/chapter-classroom-status-badge';
import { ChapterStudioButton } from '@/components/teacher/design-workbench/chapter-studio-button';
```

同时确认 `useI18n` 已导入（用于 `t('teacher.chapter.regenerate')`）。

- [ ] **步骤 4：替换章节卡片底部操作区**

找到当前操作区（包含 `GenerateLessonsButton` 的 `div`，约第 149-156 行），替换为：

```tsx
<div className="mt-3 flex flex-wrap items-center justify-between gap-1 border-t border-slate-200/60 pt-3 dark:border-slate-800">
  {/* Status badge on the left */}
  <div className="flex items-center gap-1.5">
    {(() => {
      const status = getChapterClassroomStatus?.(chapter.id);
      return status ? <ChapterClassroomStatusBadge status={status} /> : null;
    })()}
  </div>

  {/* Action buttons on the right */}
  <div className="flex flex-wrap items-center gap-1">
    {/* Studio button (visible when ready or published) */}
    {onGoToChapterStudio &&
    (getChapterClassroomStatus?.(chapter.id) === 'ready' ||
      getChapterClassroomStatus?.(chapter.id) === 'published') ? (
      <ChapterStudioButton onClick={() => onGoToChapterStudio(chapter.id)} />
    ) : null}

    {/* Generate / Regenerate button */}
    <GenerateLessonsButton
      size="sm"
      testId={`teacher-design-generate-chapter-${chapter.id}`}
      disabled={
        disabled || (canGenerateChapter ? !canGenerateChapter(chapter) : false)
      }
      loading={generatingChapterId === chapter.id}
      onClick={() => onGenerateChapter(chapter.id)}
    />
  </div>
</div>
```

注意：`GenerateLessonsButton` 保留原样。若需要区分「生成」和「重新生成」标签，可以在按钮之前插入条件判断来传入不同的 `label` prop（若该按钮支持 `label` prop）或改用两个独立按钮。如果 `GenerateLessonsButton` 不接受自定义 label，保持现状即可——「重新生成」语义由旁边的 Studio 按钮已存在来暗示。

- [ ] **步骤 5：TypeScript 检查**

```bash
npx tsc --noEmit 2>&1 | Select-Object -First 30
```
根据报错调整类型写法。

- [ ] **步骤 6：Commit**

```bash
git add components/teacher/design-workbench/chapter-list-editor.tsx
git commit -m "feat(teacher): update chapter list editor with classroom status and studio button"
```

---

## 任务 12：DesignShell 集成（路由 + 轮询 + 发布按钮）

**文件：**
- 修改：`components/teacher/course-project-design-shell.tsx`

**注意：** 这是工作量最大的任务，操作最大的现有文件。在每步修改前都先仔细阅读周边代码，避免误删现有逻辑。

- [ ] **步骤 1：在 import 区域添加新导入**

在文件顶部已有的 import 中追加（注意不要重复已有的）：

```typescript
import { buildChapterGeneratePath, buildChapterStudioPath } from '@/lib/teacher/routes';
import { CoursePublishButton } from '@/components/teacher/course-publish-button';
import type { CourseChapterClassroomStatus } from '@/lib/teacher/course-types';
```

- [ ] **步骤 2：改造 `goToChapterGeneration`**

找到函数体内的 `router.push(buildTeacherGeneratePath(projectId, { chapterId }))` 这行，改为：

```typescript
router.push(buildChapterGeneratePath(projectId, chapterId));
```
其余逻辑（`ensureProjectPersisted`、`flushPatch`、`generateNavLockRef`）保持不变。

- [ ] **步骤 3：在 `goToChapterGeneration` 之后添加 `goToChapterStudio`**

```typescript
const goToChapterStudio = useCallback(
  (chapterId: string) => {
    const projectId = projectIdRef.current;
    if (!projectId) return;
    router.push(buildChapterStudioPath(projectId, chapterId));
  },
  [router],
);
```

- [ ] **步骤 4：添加章节状态轮询**

在组件内已有 `useState` 声明区域之后添加：

```typescript
// Chapter classroom statuses (derived from project, kept in sync via polling)
const [chapterClassroomStatuses, setChapterClassroomStatuses] = useState<
  Record<string, CourseChapterClassroomStatus>
>(() => {
  const initial: Record<string, CourseChapterClassroomStatus> = {};
  for (const [id, cc] of Object.entries(project.chapterClassrooms ?? {})) {
    initial[id] = cc.status;
  }
  return initial;
});

const chapterStatusPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

const getChapterClassroomStatus = useCallback(
  (chapterId: string): CourseChapterClassroomStatus | undefined =>
    chapterClassroomStatuses[chapterId],
  [chapterClassroomStatuses],
);

// Activate polling only when at least one chapter is generating
useEffect(() => {
  const hasGenerating = Object.values(chapterClassroomStatuses).some(
    (s) => s === 'generating',
  );

  if (!hasGenerating) {
    if (chapterStatusPollingRef.current) {
      clearInterval(chapterStatusPollingRef.current);
      chapterStatusPollingRef.current = null;
    }
    return;
  }

  if (chapterStatusPollingRef.current) return;

  chapterStatusPollingRef.current = setInterval(() => {
    const projectId = projectIdRef.current;
    if (!projectId) return;
    void fetch(`/api/teacher/projects/${encodeURIComponent(projectId)}`)
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as {
          data?: {
            project?: {
              chapterClassrooms?: Record<string, { status: CourseChapterClassroomStatus }>;
            };
          };
        };
        const classrooms = json.data?.project?.chapterClassrooms;
        if (!classrooms) return;
        const updated: Record<string, CourseChapterClassroomStatus> = {};
        for (const [id, cc] of Object.entries(classrooms)) {
          updated[id] = cc.status;
        }
        setChapterClassroomStatuses(updated);
      })
      .catch(() => undefined);
  }, 3000);

  return () => {
    if (chapterStatusPollingRef.current) {
      clearInterval(chapterStatusPollingRef.current);
      chapterStatusPollingRef.current = null;
    }
  };
}, [chapterClassroomStatuses]);
```

**注意：** `projectIdRef` 是现有的 ref，直接复用。

- [ ] **步骤 5：在 ChapterListEditor 渲染处传入新 props**

找到 `<ChapterListEditor ... onGenerateChapter=...` 渲染处，添加两个新 prop：

```tsx
<ChapterListEditor
  {/* ...现有 props 保持不变... */}
  onGoToChapterStudio={goToChapterStudio}
  getChapterClassroomStatus={getChapterClassroomStatus}
/>
```

- [ ] **步骤 6：在顶部工具栏区域集成 `CoursePublishButton`**

找到设计工作台顶部 header/toolbar JSX（通常包含课程标题或操作按钮的区域），在合适位置（右侧）添加：

```tsx
<CoursePublishButton
  project={project}
  liveChapterStatuses={chapterClassroomStatuses}
  onPublishSuccess={(classroomId) => {
    void router.push(buildTeacherStudioPath(projectIdRef.current ?? project.id));
  }}
/>
```

注意：`buildTeacherStudioPath` 已在文件中导入。`project` prop 是从父级传入的。

- [ ] **步骤 7：TypeScript + lint 全量检查**

```bash
npx tsc --noEmit 2>&1 | Select-Object -First 30
pnpm lint 2>&1 | Select-Object -Last 20
```
预期：0 type errors，无 error 级 lint 问题

- [ ] **步骤 8：全量测试**

```bash
pnpm test 2>&1 | Select-Object -Last 20
```
预期：所有既有测试通过（特别是 `tests/teacher/studio-routes.test.ts`）

- [ ] **步骤 9：i18n key 检查**

```bash
pnpm check:i18n-keys 2>&1 | Select-Object -Last 10
```
预期：通过，无缺失 key

- [ ] **步骤 10：Commit**

```bash
git add components/teacher/course-project-design-shell.tsx
git commit -m "feat(teacher): integrate chapter classroom routing, polling, and course publish in design shell"
```
