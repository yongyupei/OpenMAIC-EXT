# 教师端生成流程改造：统一学生端管道 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将教师设计工作台"生成课程"操作改为使用学生端 SSE 大纲 + 场景生成管道，生成完毕后落地 Teacher Studio。

**架构：** 新增 `components/teacher/teacher-preview-shell.tsx`（客户端生成驱动）+ `app/teacher/projects/[projectId]/preview/page.tsx`（服务端加载项目）。扩展 `/api/generate/scene-outlines-stream` 接受 `presetChapters`。新增 `/api/teacher/projects/[projectId]/publish-classroom` 接受客户端生成的 scenes。`course-project-design-shell.tsx` 导航目标改为 preview 路径。

**技术栈：** Next.js App Router、React 19、Zustand (`useStageStore`)、`useSceneGenerator` hook、SSE ReadableStream、`persistClassroom`（server-only）

---

## 文件结构

| 文件 | 变更类型 |
|---|---|
| `lib/teacher/preview-helpers.ts` | 新建 |
| `tests/teacher/preview-helpers.test.ts` | 新建 |
| `lib/teacher/routes.ts` | 修改 |
| `tests/teacher/routes.test.ts` | 修改 |
| `app/api/generate/scene-outlines-stream/route.ts` | 修改 |
| `tests/teacher/preview-api.test.ts` | 新建 |
| `app/api/teacher/projects/[projectId]/publish-classroom/route.ts` | 新建 |
| `components/teacher/teacher-preview-shell.tsx` | 新建 |
| `app/teacher/projects/[projectId]/preview/page.tsx` | 新建 |
| `components/teacher/course-project-design-shell.tsx` | 修改 |

---

## 任务 1：preview-helpers — 纯工具函数 + 测试

**文件：**
- 创建：`lib/teacher/preview-helpers.ts`
- 创建：`tests/teacher/preview-helpers.test.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
// tests/teacher/preview-helpers.test.ts
import { describe, expect, test } from 'vitest';
import {
  buildChapterHints,
  buildRequirementsFromProject,
  buildChapterStructureText,
} from '@/lib/teacher/preview-helpers';
import type { CourseChapter } from '@/lib/teacher/course-types';
import type { CourseProject } from '@/lib/teacher/course-types';

const makeChapter = (overrides: Partial<CourseChapter> = {}): CourseChapter => ({
  id: 'ch1',
  title: 'JS 基础',
  learningObjectives: ['理解变量', '掌握数据类型'],
  sceneOutlines: [],
  status: 'draft',
  dirty: false,
  locked: false,
  order: 1,
  ...overrides,
});

describe('buildChapterHints', () => {
  test('converts chapters with empty sceneOutlines → targetSceneCount=3', () => {
    const hints = buildChapterHints([makeChapter()]);
    expect(hints).toEqual([
      {
        title: 'JS 基础',
        learningObjectives: ['理解变量', '掌握数据类型'],
        summary: undefined,
        targetSceneCount: 3,
      },
    ]);
  });

  test('uses sceneOutlines.length when present', () => {
    const chapter = makeChapter({
      sceneOutlines: [
        { id: 's1', title: 'S1', type: 'slide', order: 1 },
        { id: 's2', title: 'S2', type: 'quiz', order: 2 },
      ] as any,
    });
    const hints = buildChapterHints([chapter]);
    expect(hints[0].targetSceneCount).toBe(2);
  });

  test('includes summary when present', () => {
    const hints = buildChapterHints([makeChapter({ summary: '本章概述' })]);
    expect(hints[0].summary).toBe('本章概述');
  });
});

describe('buildRequirementsFromProject', () => {
  const base = {
    id: 'p1',
    title: '入门课',
    requirements: { requirement: '学 JS' },
    status: 'draft',
    artifacts: [],
    chapterCount: 1,
    workflowTemplateId: 'standard-course',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  } as unknown as CourseProject;

  test('uses overview when present', () => {
    const r = buildRequirementsFromProject({ ...base, overview: '课程概述' });
    expect(r.requirement).toContain('课程概述');
  });

  test('falls back to requirements.requirement when no overview', () => {
    const r = buildRequirementsFromProject(base);
    expect(r.requirement).toContain('学 JS');
  });

  test('appends targetAudience when present', () => {
    const r = buildRequirementsFromProject({ ...base, targetAudience: '初学者' });
    expect(r.requirement).toContain('初学者');
  });

  test('appends durationMinutes when present', () => {
    const r = buildRequirementsFromProject({ ...base, durationMinutes: 90 });
    expect(r.requirement).toContain('90');
  });

  test('works when only title is available', () => {
    const minimal = { ...base, requirements: undefined } as any;
    const r = buildRequirementsFromProject(minimal);
    expect(r.requirement).toContain('入门课');
  });
});

describe('buildChapterStructureText', () => {
  test('generates formatted text block for one chapter', () => {
    const text = buildChapterStructureText([
      { title: '变量', learningObjectives: ['理解变量'], targetSceneCount: 2 },
    ]);
    expect(text).toContain('变量');
    expect(text).toContain('理解变量');
    expect(text).toContain('2');
  });

  test('returns empty string for empty array', () => {
    expect(buildChapterStructureText([])).toBe('');
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

```
pnpm test tests/teacher/preview-helpers.test.ts
```

预期：FAIL，`Cannot find module '@/lib/teacher/preview-helpers'`

- [ ] **步骤 3：实现 `lib/teacher/preview-helpers.ts`**

```typescript
// lib/teacher/preview-helpers.ts
import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';
import type { UserRequirements } from '@/lib/types/generation';

export interface ChapterHint {
  title: string;
  learningObjectives: string[];
  summary?: string;
  targetSceneCount: number;
}

export function buildChapterHints(chapters: CourseChapter[]): ChapterHint[] {
  return chapters.map((ch) => ({
    title: ch.title,
    learningObjectives: ch.learningObjectives,
    summary: ch.summary,
    targetSceneCount: ch.sceneOutlines.length > 0 ? ch.sceneOutlines.length : 3,
  }));
}

export function buildRequirementsFromProject(project: CourseProject): UserRequirements {
  const base =
    project.overview ??
    (project.requirements as { requirement?: string } | undefined)?.requirement ??
    project.title;

  const lines = [
    base,
    project.targetAudience ? `目标受众：${project.targetAudience}` : null,
    project.durationMinutes ? `课程时长：${project.durationMinutes} 分钟` : null,
  ].filter((l): l is string => typeof l === 'string' && l.length > 0);

  return { requirement: lines.join('\n') };
}

export function buildChapterStructureText(hints: ChapterHint[]): string {
  if (hints.length === 0) return '';

  const chapterLines = hints
    .map((ch, i) => {
      const lines = [
        `第 ${i + 1} 章：${ch.title}`,
        `  学习目标：${ch.learningObjectives.join('；')}`,
        ch.summary ? `  章节摘要：${ch.summary}` : null,
        `  期望场景数：${ch.targetSceneCount}`,
      ].filter((l): l is string => l !== null);
      return lines.join('\n');
    })
    .join('\n\n');

  return [
    '【教师预设章节结构】（请严格按照此章节顺序生成场景大纲）',
    '',
    chapterLines,
    '',
    '请为每个章节生成对应数量的场景大纲，场景类型（slide/quiz/pbl）由你根据学习目标自主决定，内容需贴合章节主题和学习目标。',
  ].join('\n');
}
```

- [ ] **步骤 4：运行测试确认通过**

```
pnpm test tests/teacher/preview-helpers.test.ts
```

预期：所有测试 PASS

- [ ] **步骤 5：Commit**

```
git add lib/teacher/preview-helpers.ts tests/teacher/preview-helpers.test.ts
git commit -m "feat: add teacher preview-helpers (buildChapterHints, buildRequirementsFromProject, buildChapterStructureText)"
```

---

## 任务 2：routes.ts — 新增 buildTeacherPreviewPath

**文件：**
- 修改：`lib/teacher/routes.ts`
- 修改：`tests/teacher/routes.test.ts`

- [ ] **步骤 1：在 routes.test.ts 新增失败测试**

在 `tests/teacher/routes.test.ts` 中，在现有 `describe` 块内追加：

```typescript
import {
  buildTeacherDesignPath,
  buildTeacherGeneratePath,
  buildTeacherNewPath,
  buildTeacherProjectsPath,
  buildTeacherStudioPath,
  buildTeacherPreviewPath,   // 新增
} from '@/lib/teacher/routes';

// 在现有 test 内追加：
expect(buildTeacherPreviewPath('course 123')).toBe(
  '/teacher/projects/course%20123/preview',
);
expect(buildTeacherPreviewPath('course 123', { chapterId: 'ch 1' })).toBe(
  '/teacher/projects/course%20123/preview?chapterId=ch%201',
);
```

- [ ] **步骤 2：运行测试确认失败**

```
pnpm test tests/teacher/routes.test.ts
```

预期：FAIL，`buildTeacherPreviewPath is not a function`

- [ ] **步骤 3：在 `lib/teacher/routes.ts` 末尾追加**

```typescript
export function buildTeacherPreviewPath(
  projectId: string,
  options?: TeacherProjectRouteOptions,
): string {
  return appendChapterIdQuery(
    `/teacher/projects/${encodeURIComponent(projectId)}/preview`,
    options,
  );
}
```

- [ ] **步骤 4：运行测试确认通过**

```
pnpm test tests/teacher/routes.test.ts
```

预期：PASS

- [ ] **步骤 5：Commit**

```
git add lib/teacher/routes.ts tests/teacher/routes.test.ts
git commit -m "feat: add buildTeacherPreviewPath route helper"
```

---

## 任务 3：scene-outlines-stream — 接受 presetChapters

**文件：**
- 修改：`app/api/generate/scene-outlines-stream/route.ts`
- 创建：`tests/teacher/preview-api.test.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
// tests/teacher/preview-api.test.ts
import { describe, expect, test, vi } from 'vitest';
import { buildChapterStructureText } from '@/lib/teacher/preview-helpers';
import type { ChapterHint } from '@/lib/teacher/preview-helpers';

// Unit-test the text builder only (route integration not mocked here)
describe('buildChapterStructureText injected to system prompt', () => {
  const hints: ChapterHint[] = [
    {
      title: '变量与数据类型',
      learningObjectives: ['理解变量'],
      targetSceneCount: 3,
    },
    {
      title: '函数与作用域',
      learningObjectives: ['掌握函数'],
      summary: '本章通过练习掌握函数',
      targetSceneCount: 4,
    },
  ];

  test('chapter structure text includes all chapter titles', () => {
    const text = buildChapterStructureText(hints);
    expect(text).toContain('变量与数据类型');
    expect(text).toContain('函数与作用域');
  });

  test('includes targetSceneCount', () => {
    const text = buildChapterStructureText(hints);
    expect(text).toContain('3');
    expect(text).toContain('4');
  });

  test('includes summary when present', () => {
    const text = buildChapterStructureText(hints);
    expect(text).toContain('本章通过练习掌握函数');
  });

  test('empty presetChapters returns empty string (no injection needed)', () => {
    expect(buildChapterStructureText([])).toBe('');
  });
});
```

- [ ] **步骤 2：运行测试确认通过（依赖任务 1 已完成）**

```
pnpm test tests/teacher/preview-api.test.ts
```

预期：PASS（工具函数已在任务 1 实现）

- [ ] **步骤 3：修改 `app/api/generate/scene-outlines-stream/route.ts`**

在 `body` 解构块（约第 148 行）中，追加 `presetChapters` 字段：

```typescript
// 修改这一行（约 148-155 行）：
const { requirements, pdfText, pdfImages, imageMapping, researchContext, agents } = body as {
  requirements: UserRequirements;
  pdfText?: string;
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
  researchContext?: string;
  agents?: AgentInfo[];
};
```

改为：

```typescript
import type { ChapterHint } from '@/lib/teacher/preview-helpers';
import { buildChapterStructureText } from '@/lib/teacher/preview-helpers';

// ...

const {
  requirements,
  pdfText,
  pdfImages,
  imageMapping,
  researchContext,
  agents,
  presetChapters,
} = body as {
  requirements: UserRequirements;
  pdfText?: string;
  pdfImages?: PdfImage[];
  imageMapping?: ImageMapping;
  researchContext?: string;
  agents?: AgentInfo[];
  presetChapters?: ChapterHint[];
};
```

然后在 `buildPrompt` 调用之后（约第 212-223 行，`const prompts = buildPrompt(...)` 之后）注入章节结构：

```typescript
  if (!prompts) {
    return apiError('INTERNAL_ERROR', 500, 'Prompt template not found');
  }

  // 新增：将教师章节结构注入 system prompt（不修改模板，安全追加）
  const chapterStructureText = buildChapterStructureText(presetChapters ?? []);
  const systemPrompt = chapterStructureText
    ? `${prompts.system}\n\n${chapterStructureText}`
    : prompts.system;
```

然后将 SSE stream 中 `streamParams` 里所有 `prompts.system` 替换为 `systemPrompt`（约第 262-279 行）：

```typescript
  const streamParams = visionImages?.length
    ? {
        model: languageModel,
        system: systemPrompt,          // ← 原为 prompts.system
        messages: [
          {
            role: 'user' as const,
            content: buildVisionUserContent(prompts.user, visionImages),
          },
        ],
        maxOutputTokens: modelInfo?.outputWindow,
      }
    : {
        model: languageModel,
        system: systemPrompt,          // ← 原为 prompts.system
        prompt: prompts.user,
        maxOutputTokens: modelInfo?.outputWindow,
      };
```

- [ ] **步骤 4：类型检查**

```
npx tsc --noEmit
```

预期：无错误

- [ ] **步骤 5：Commit**

```
git add app/api/generate/scene-outlines-stream/route.ts tests/teacher/preview-api.test.ts
git commit -m "feat: extend scene-outlines-stream to accept presetChapters for teacher chapter hints"
```

---

## 任务 4：publish-classroom API — 接受客户端生成的 scenes

**文件：**
- 创建：`app/api/teacher/projects/[projectId]/publish-classroom/route.ts`

- [ ] **步骤 1：创建路由文件**

```typescript
// app/api/teacher/projects/[projectId]/publish-classroom/route.ts
import { type NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { buildRequestOrigin, persistClassroom } from '@/lib/server/classroom-storage';
import {
  isValidTeacherProjectId,
  readTeacherProject,
  writeTeacherProject,
} from '@/lib/teacher/course-project-storage';
import type { Scene, Stage } from '@/lib/types/stage';

type RouteContext = { params: Promise<{ projectId: string }> };

const log = createLogger('Teacher PublishClassroom API');

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { projectId } = await context.params;

    if (!isValidTeacherProjectId(projectId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
    }

    const project = await readTeacherProject(projectId);
    if (!project) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
    }

    const body = await request.json() as { stage: Stage; scenes: Scene[] };
    const { stage, scenes } = body;

    if (!stage || !Array.isArray(scenes)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'stage and scenes are required');
    }

    const baseUrl = buildRequestOrigin(request);
    const classroom = await persistClassroom(
      {
        id: projectId,
        stage,
        scenes,
        sourceWorkflowId: project.workflowTemplateId,
      },
      baseUrl,
    );

    const updatedProject = {
      ...project,
      status: 'published' as const,
      publishedClassroomId: classroom.id,
    };
    await writeTeacherProject(updatedProject);

    log.info(`Published classroom ${classroom.id} for project ${projectId}`);

    return apiSuccess({ classroomId: classroom.id });
  } catch (error) {
    log.error('Teacher publish-classroom route failed:', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to publish classroom');
  }
}
```

- [ ] **步骤 2：类型检查**

```
npx tsc --noEmit
```

预期：无错误

- [ ] **步骤 3：Commit**

```
git add app/api/teacher/projects/[projectId]/publish-classroom/route.ts
git commit -m "feat: add publish-classroom API endpoint for teacher preview generation flow"
```

---

## 任务 5：TeacherPreviewShell — 客户端生成驱动组件

**文件：**
- 创建：`components/teacher/teacher-preview-shell.tsx`

- [ ] **步骤 1：创建组件文件**

```typescript
// components/teacher/teacher-preview-shell.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStageStore } from '@/lib/store/stage';
import { useSceneGenerator } from '@/lib/hooks/use-scene-generator';
import { buildTeacherStudioPath } from '@/lib/teacher/routes';
import {
  buildChapterHints,
  buildRequirementsFromProject,
} from '@/lib/teacher/preview-helpers';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { useSettingsStore } from '@/lib/store/settings';
import { nanoid } from 'nanoid';
import type { CourseProject } from '@/lib/teacher/course-types';
import type { SceneOutline } from '@/lib/types/generation';
import { createLogger } from '@/lib/logger';

const log = createLogger('TeacherPreviewShell');

type PreviewStatus =
  | 'streaming-outlines'
  | 'generating-scenes'
  | 'publishing'
  | 'done'
  | 'error';

interface Props {
  project: CourseProject;
  chapterId?: string;
}

function getApiHeaders(): HeadersInit {
  const config = getCurrentModelConfig();
  const settings = useSettingsStore.getState();
  return {
    'Content-Type': 'application/json',
    'x-model': config.modelString || '',
    'x-api-key': config.apiKey || '',
    'x-base-url': config.baseUrl || '',
    'x-provider-type': config.providerType || '',
    'x-image-generation-enabled': 'false',
    'x-video-generation-enabled': 'false',
  };
}

async function streamOutlines(params: {
  project: CourseProject;
  chapterId?: string;
  stageId: string;
  signal: AbortSignal;
  onOutline: (outline: SceneOutline) => void;
}): Promise<SceneOutline[]> {
  const { project, chapterId, stageId, signal, onOutline } = params;

  const targetChapters = chapterId
    ? (project.outline?.chapters ?? []).filter((c) => c.id === chapterId)
    : (project.outline?.chapters ?? []);

  if (targetChapters.length === 0) {
    throw new Error('选择的章节不存在');
  }

  const requirements = buildRequirementsFromProject(project);
  const presetChapters = buildChapterHints(targetChapters);

  const res = await fetch('/api/generate/scene-outlines-stream', {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify({ requirements, presetChapters }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`大纲生成请求失败：${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('无法读取大纲生成流');

  const decoder = new TextDecoder();
  const collected: SceneOutline[] = [];
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6)) as {
            type: string;
            data?: SceneOutline;
            outlines?: SceneOutline[];
            error?: string;
          };

          if (evt.type === 'outline' && evt.data) {
            collected.push(evt.data);
            onOutline(evt.data);
          } else if (evt.type === 'done') {
            return evt.outlines ?? collected;
          } else if (evt.type === 'error') {
            throw new Error(evt.error ?? '大纲生成失败');
          }
        } catch (parseErr) {
          log.warn('Failed to parse SSE line:', line);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return collected;
}

export function TeacherPreviewShell({ project, chapterId }: Props) {
  const router = useRouter();
  const store = useStageStore();
  const { generateRemaining } = useSceneGenerator();

  const [status, setStatus] = useState<PreviewStatus>('streaming-outlines');
  const [streamingOutlines, setStreamingOutlines] = useState<SceneOutline[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sceneCount = useStageStore((s) => s.scenes.length);
  const outlineCount = useStageStore((s) => s.outlines.length);

  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (signal: AbortSignal) => {
      try {
        // 1. 初始化 stage store
        const stageId = project.publishedClassroomId ?? nanoid();
        useStageStore.getState().reset?.();
        store.setStage({
          id: stageId,
          name: project.title,
          description: project.overview ?? '',
          style: 'default' as const,
        });
        store.setOutlines([]);

        // 2. SSE 流式大纲
        setStatus('streaming-outlines');
        const outlines = await streamOutlines({
          project,
          chapterId,
          stageId,
          signal,
          onOutline: (outline) => {
            setStreamingOutlines((prev) => [...prev, outline]);
          },
        });

        if (signal.aborted) return;
        store.setOutlines(outlines);

        // 3. 场景内容生成
        setStatus('generating-scenes');
        await generateRemaining({
          stageInfo: {
            name: project.title,
            description: project.overview ?? '',
          },
          languageDirective: project.outline?.languageDirective ?? '',
        });

        if (signal.aborted) return;

        // 4. 服务端发布
        setStatus('publishing');
        const { stage, scenes } = useStageStore.getState();

        const publishRes = await fetch(
          `/api/teacher/projects/${encodeURIComponent(project.id)}/publish-classroom`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stage, scenes }),
            signal,
          },
        );

        if (!publishRes.ok) {
          throw new Error(`发布失败：${publishRes.status}`);
        }

        if (signal.aborted) return;

        // 5. 导航到 Studio
        setStatus('done');
        router.push(buildTeacherStudioPath(project.id));
      } catch (err) {
        if (signal.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        log.error('Preview generation failed:', err);
        setError(msg);
        setStatus('error');
      }
    },
    [project, chapterId, store, generateRemaining, router],
  );

  useEffect(() => {
    if (runningRef.current) return;
    runningRef.current = true;

    const abort = new AbortController();
    abortRef.current = abort;
    run(abort.signal);

    return () => {
      abort.abort();
    };
  }, [run]);

  const pct =
    outlineCount > 0 ? Math.round((sceneCount / outlineCount) * 100) : 0;

  const chapterTitle = chapterId
    ? project.outline?.chapters.find((c) => c.id === chapterId)?.title
    : undefined;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-8">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-white dark:bg-slate-900 shadow-lg p-8 space-y-6">
        {/* 标题 */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">正在生成</p>
          <h1 className="text-lg font-semibold">
            {chapterTitle ? `第 ${chapterTitle} 章` : project.title}
          </h1>
        </div>

        {/* 大纲流式展示 */}
        {(status === 'streaming-outlines' || status === 'generating-scenes' || status === 'publishing') && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              {status === 'streaming-outlines' ? '① 大纲生成中...' : '① 大纲已生成'}
            </p>
            <div className="rounded-lg border border-border divide-y divide-border max-h-48 overflow-y-auto">
              {streamingOutlines.map((o, i) => (
                <div key={o.id ?? i} className="px-3 py-2 text-sm flex items-center gap-2">
                  <span className="text-muted-foreground text-xs w-4">{i + 1}</span>
                  <span className="flex-1 truncate">{o.title}</span>
                  <span className="text-xs text-muted-foreground">{o.type}</span>
                </div>
              ))}
              {status === 'streaming-outlines' && (
                <div className="px-3 py-2 text-xs text-muted-foreground animate-pulse">
                  生成中...
                </div>
              )}
            </div>
          </div>
        )}

        {/* 场景生成进度 */}
        {(status === 'generating-scenes' || status === 'publishing') && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              ② 场景内容生成 {sceneCount} / {outlineCount}
            </p>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* 发布中 */}
        {status === 'publishing' && (
          <p className="text-sm text-muted-foreground animate-pulse">③ 发布中...</p>
        )}

        {/* 错误 */}
        {status === 'error' && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
            <p className="text-sm text-destructive font-medium">生成失败</p>
            <p className="text-xs text-destructive/80">{error}</p>
            <button
              onClick={() => {
                runningRef.current = false;
                setStatus('streaming-outlines');
                setStreamingOutlines([]);
                setError(null);
                const abort = new AbortController();
                abortRef.current = abort;
                run(abort.signal);
              }}
              className="text-xs underline text-destructive hover:opacity-80"
            >
              重试
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **步骤 2：类型检查**

```
npx tsc --noEmit
```

预期：无错误（若 `store.reset` 不存在则移除该行调用）

- [ ] **步骤 3：Commit**

```
git add components/teacher/teacher-preview-shell.tsx
git commit -m "feat: add TeacherPreviewShell client component for unified generation pipeline"
```

---

## 任务 6：preview 页面（服务端加载项目）

**文件：**
- 创建：`app/teacher/projects/[projectId]/preview/page.tsx`

- [ ] **步骤 1：创建页面文件**

```typescript
// app/teacher/projects/[projectId]/preview/page.tsx
import { notFound } from 'next/navigation';
import { readTeacherProject } from '@/lib/teacher/course-project-storage';
import { TeacherPreviewShell } from '@/components/teacher/teacher-preview-shell';

type PageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ chapterId?: string }>;
};

export default async function TeacherPreviewPage({ params, searchParams }: PageProps) {
  const { projectId } = await params;
  const { chapterId } = await searchParams;

  const project = await readTeacherProject(projectId);
  if (!project) notFound();

  if (!project.outline || project.outline.chapters.length === 0) {
    notFound();
  }

  return <TeacherPreviewShell project={project} chapterId={chapterId} />;
}
```

- [ ] **步骤 2：类型检查**

```
npx tsc --noEmit
```

预期：无错误

- [ ] **步骤 3：Commit**

```
git add app/teacher/projects/[projectId]/preview/page.tsx
git commit -m "feat: add teacher preview page (server component wrapper)"
```

---

## 任务 7：更新设计工作台导航

**文件：**
- 修改：`components/teacher/course-project-design-shell.tsx`

- [ ] **步骤 1：定位并修改 `goToChapterGeneration` 函数（约第 662 行）**

在文件顶部 import 区域，将 `buildTeacherGeneratePath` 的导入更改（或追加）`buildTeacherPreviewPath`：

```typescript
// 找到（约第 N 行）：
import { buildTeacherGeneratePath, buildTeacherStudioPath, ... } from '@/lib/teacher/routes';

// 改为追加（保留原 buildTeacherGeneratePath 以不破坏其他引用）：
import {
  buildTeacherGeneratePath,
  buildTeacherPreviewPath,
  buildTeacherStudioPath,
  ...
} from '@/lib/teacher/routes';
```

然后找到 `goToChapterGeneration` 函数体（约第 662-685 行）：

```typescript
// 找到这一行：
router.push(buildTeacherGeneratePath(projectId, { chapterId }));

// 改为：
router.push(buildTeacherPreviewPath(projectId, { chapterId }));
```

函数名本身可以保留 `goToChapterGeneration`（类型和 prop 接口不变，避免大面积改动），或选择性重命名为 `goToChapterPreview`——仅在文件内部使用无需更改 prop 名。

- [ ] **步骤 2：类型检查**

```
npx tsc --noEmit
```

预期：无错误

- [ ] **步骤 3：运行现有相关测试**

```
pnpm test tests/teacher/
```

预期：所有已有测试继续 PASS

- [ ] **步骤 4：Commit**

```
git add components/teacher/course-project-design-shell.tsx
git commit -m "feat: redirect chapter generation to teacher preview page (unified student pipeline)"
```

---

## 自检

### 1. 规格覆盖度

| 规格需求 | 对应任务 |
|---|---|
| 教师章节 → LLM 精化大纲（SSE） | 任务 3、5 |
| 大纲生成使用学生端 scene-outlines-stream | 任务 3、5 |
| 场景内容使用学生端 scene-content / scene-actions | 任务 5（useSceneGenerator） |
| 生成完毕后服务端 publish | 任务 4、5 |
| publishedClassroomId 写回 teacher project | 任务 4 |
| 落地 Teacher Studio | 任务 5 |
| 导航变更 goToChapterGeneration → preview 路径 | 任务 7 |
| 辅助函数可测试（提取到 lib） | 任务 1 |
| Stage 初始化策略（复用或新建） | 任务 5 |

### 2. 占位符扫描

无 "待定" / TODO / 未完成章节。

### 3. 类型一致性

- `ChapterHint`：定义在 `lib/teacher/preview-helpers.ts`，被 route（任务 3）和 shell（任务 5）共同导入
- `CourseProject`：来自 `lib/teacher/course-types`，贯穿所有任务
- `Stage` / `Scene`：来自 `lib/types/stage`，在任务 4 和任务 5 中一致使用

---

## 执行交接

**计划已完成并保存到 `docs/superpowers/plans/2026-05-15-teacher-preview-generation.md`。两种执行方式：**

**1. 子代理驱动（推荐）** — 每个任务调度一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** — 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

**选哪种方式？**
