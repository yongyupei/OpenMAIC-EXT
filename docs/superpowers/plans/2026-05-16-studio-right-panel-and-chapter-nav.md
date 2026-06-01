# Studio 右侧面板重构 + 章节切换修复 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 Studio 页面运行状态移入 AI 辅助列、使该列可收起（持久化）、重构 AI 辅助为聊天式 UI、修复章节切换失效问题。

**架构：** 在 `lib/store/settings.ts` 新增 `assistPanelCollapsed` 持久化字段；将章节目标场景解析逻辑提取为 `chapter-scene-order.ts` 中的纯函数便于测试；`TeacherAssistPanel` 重构为带消息历史的聊天式组件；`course-studio-shell.tsx` 合并三列布局为两列并接入收起功能。

**技术栈：** Next.js App Router、React、TypeScript strict、Zustand persist、Tailwind CSS、Vitest

---

## 文件一览

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `lib/store/settings.ts` | 新增 `assistPanelCollapsed` 字段及 setter |
| 修改 | `lib/teacher/chapter-scene-order.ts` | 新增纯函数 `resolveChapterTargetSceneId` |
| 新增 | `tests/teacher/chapter-scene-order.test.ts` | 覆盖主路径与 fallback 路径 |
| 修改 | `components/teacher/teacher-assist-panel.tsx` | 重构为聊天式 UI（保留导出名） |
| 修改 | `components/teacher/course-studio-shell.tsx` | 布局：收起、运行状态移入 |
| 修改 | `components/course-editor/course-editor-shell.tsx` | 调用新 `resolveChapterTargetSceneId` |

---

## 任务 1：`settings.ts` 新增 `assistPanelCollapsed`

**文件：**
- 修改：`lib/store/settings.ts:192-218`（Layout preferences 区块）

- [ ] **步骤 1：在 `SettingsState` 接口中添加字段和 setter 声明**

在 `// Layout preferences` 注释下方，紧跟 `chatAreaWidth: number;` 之后添加：

```typescript
  assistPanelCollapsed: boolean;
```

在 `// Layout actions` 注释下方，紧跟 `setChatAreaWidth: (width: number) => void;` 之后添加：

```typescript
  setAssistPanelCollapsed: (collapsed: boolean) => void;
```

- [ ] **步骤 2：在 store 初始状态中设置默认值**

在 `// Layout preferences` 注释下 `chatAreaWidth: 320,` 之后添加：

```typescript
        assistPanelCollapsed: false,
```

- [ ] **步骤 3：在 actions 区域注册 setter**

在 `setChatAreaWidth: (width) => set({ chatAreaWidth: width }),` 之后添加：

```typescript
        setAssistPanelCollapsed: (collapsed) => set({ assistPanelCollapsed: collapsed }),
```

- [ ] **步骤 4：验证 TypeScript 无报错**

```bash
cd d:/CodeSpace/VibeSpace/case003/OpenMAIC
npx tsc --noEmit 2>&1 | head -30
```

预期：无与 `settings.ts` 或 `assistPanelCollapsed` 相关的错误。

- [ ] **步骤 5：Commit**

```bash
git add lib/store/settings.ts
git commit -m "feat(settings): add assistPanelCollapsed layout preference"
```

---

## 任务 2：章节切换纯函数 + 测试

**文件：**
- 修改：`lib/teacher/chapter-scene-order.ts`
- 新增：`tests/teacher/chapter-scene-order.test.ts`

- [ ] **步骤 1：编写失败的测试**

新建 `tests/teacher/chapter-scene-order.test.ts`：

```typescript
import { describe, expect, test } from 'vitest';
import type { CourseEditorChapterNavModel } from '@/lib/teacher/chapter-scene-order';
import { resolveChapterTargetSceneId } from '@/lib/teacher/chapter-scene-order';

const nav: CourseEditorChapterNavModel = {
  chapters: [
    { id: 'ch1', title: 'Chapter 1' },
    { id: 'ch2', title: 'Chapter 2' },
    { id: 'ch3', title: 'Chapter 3' },
  ],
  sceneIdsByChapterId: {
    ch1: ['s1', 's2'],
    ch2: ['s3', 's4'],
    ch3: ['s5'],
  },
};

const sortedScenes = [
  { id: 's1' },
  { id: 's2' },
  { id: 's3' },
  { id: 's4' },
  { id: 's5' },
];

describe('resolveChapterTargetSceneId', () => {
  test('返回章节的第一个有效 scene ID（主路径）', () => {
    const available = new Set(['s1', 's2', 's3', 's4', 's5']);
    expect(resolveChapterTargetSceneId(nav, 'ch2', available, sortedScenes)).toBe('s3');
  });

  test('跳过不在 store 中的 artifact sceneId，返回第一个有效的', () => {
    // s3 已过期，s4 存在
    const available = new Set(['s1', 's2', 's4', 's5']);
    expect(resolveChapterTargetSceneId(nav, 'ch2', available, sortedScenes)).toBe('s4');
  });

  test('主路径全部失效时走 fallback 按索引估算', () => {
    // ch2 的 artifact IDs 全部失效
    const available = new Set(['s1', 's2', 's5']);
    const result = resolveChapterTargetSceneId(nav, 'ch2', available, sortedScenes);
    // fallback: chapterIndex=1, scenesPerChapter=ceil(5/3)=2, estimatedIdx=2 → sortedScenes[2].id='s3'
    // s3 不在 available，但 fallback 只是索引估算，不做二次过滤
    // 实际逻辑：sortedScenes[min(2,4)] = 's3'
    expect(result).toBe('s3');
  });

  test('章节 ID 不存在时返回 null', () => {
    const available = new Set(['s1']);
    expect(resolveChapterTargetSceneId(nav, 'ch999', available, sortedScenes)).toBeNull();
  });

  test('sortedScenes 为空时返回 null', () => {
    const available = new Set<string>();
    expect(resolveChapterTargetSceneId(nav, 'ch1', available, [])).toBeNull();
  });

  test('返回第一个章节（ch1）第一个有效 scene', () => {
    const available = new Set(['s1', 's2', 's3', 's4', 's5']);
    expect(resolveChapterTargetSceneId(nav, 'ch1', available, sortedScenes)).toBe('s1');
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

```bash
pnpm test tests/teacher/chapter-scene-order.test.ts 2>&1 | tail -20
```

预期：FAIL，报错 `resolveChapterTargetSceneId is not a function`（函数尚未实现）。

- [ ] **步骤 3：在 `chapter-scene-order.ts` 中实现纯函数**

在文件末尾追加（在最后一个 export 函数之后）：

```typescript
/**
 * Resolves the best scene ID to navigate to when the user clicks a chapter tab.
 *
 * Primary: finds the first artifact-mapped sceneId that actually exists in the
 * current store (guards against re-generation ID drift).
 * Fallback: estimates position by chapter index if no artifact IDs match.
 *
 * Returns null when no valid scene can be determined.
 */
export function resolveChapterTargetSceneId(
  chapterNav: CourseEditorChapterNavModel,
  chapterId: string,
  availableSceneIds: ReadonlySet<string>,
  sortedScenes: ReadonlyArray<{ readonly id: string }>,
): string | null {
  if (sortedScenes.length === 0 || chapterNav.chapters.length === 0) return null;

  // Primary path: first artifact sceneId that exists in the store
  const mappedIds = chapterNav.sceneIdsByChapterId[chapterId] ?? [];
  const validId = mappedIds.find((id) => availableSceneIds.has(id));
  if (validId !== undefined) return validId;

  // Fallback: estimate scene position by chapter order
  const chapterIndex = chapterNav.chapters.findIndex((c) => c.id === chapterId);
  if (chapterIndex < 0) return null;

  const scenesPerChapter = Math.ceil(sortedScenes.length / chapterNav.chapters.length);
  const estimatedIdx = Math.min(chapterIndex * scenesPerChapter, sortedScenes.length - 1);
  return sortedScenes[estimatedIdx]?.id ?? null;
}
```

- [ ] **步骤 4：运行测试确认通过**

```bash
pnpm test tests/teacher/chapter-scene-order.test.ts 2>&1 | tail -20
```

预期：所有 6 个测试 PASS。

- [ ] **步骤 5：Commit**

```bash
git add lib/teacher/chapter-scene-order.ts tests/teacher/chapter-scene-order.test.ts
git commit -m "feat(teacher): extract resolveChapterTargetSceneId with fallback logic"
```

---

## 任务 3：修复 `course-editor-shell.tsx` 章节切换

**文件：**
- 修改：`components/course-editor/course-editor-shell.tsx:27,96-104`

- [ ] **步骤 1：添加 import**

在文件顶部已有的 import 中，修改 `chapter-scene-order` 的导入：

```typescript
// 原
import type { CourseEditorChapterNavModel } from '@/lib/teacher/chapter-scene-order';
// 改为
import type { CourseEditorChapterNavModel } from '@/lib/teacher/chapter-scene-order';
import { resolveChapterTargetSceneId } from '@/lib/teacher/chapter-scene-order';
```

- [ ] **步骤 2：修改 `handleSelectChapterFromNav` 使用新函数**

将原来的（`course-editor-shell.tsx:96-104`）：

```typescript
  const handleSelectChapterFromNav = useCallback(
    (chapterId: string) => {
      if (!chapterNav) return;
      const ids = chapterNav.sceneIdsByChapterId[chapterId];
      const first = ids?.[0];
      if (first) setCurrentSceneId(first);
    },
    [chapterNav, setCurrentSceneId],
  );
```

替换为：

```typescript
  const handleSelectChapterFromNav = useCallback(
    (chapterId: string) => {
      if (!chapterNav) return;
      const availableIds = new Set(scenes.map((s) => s.id));
      const targetId = resolveChapterTargetSceneId(chapterNav, chapterId, availableIds, sortedScenes);
      if (targetId) setCurrentSceneId(targetId);
    },
    [chapterNav, scenes, sortedScenes, setCurrentSceneId],
  );
```

- [ ] **步骤 3：验证 TypeScript 无报错**

```bash
npx tsc --noEmit 2>&1 | grep "course-editor-shell"
```

预期：无输出（无错误）。

- [ ] **步骤 4：Commit**

```bash
git add components/course-editor/course-editor-shell.tsx
git commit -m "fix(course-editor): use resolveChapterTargetSceneId for robust chapter switching"
```

---

## 任务 4：重构 `TeacherAssistPanel` 为聊天式 UI

**文件：**
- 修改：`components/teacher/teacher-assist-panel.tsx`（整体重写，保留导出名 `TeacherAssistPanel` 和 props 接口）

- [ ] **步骤 1：重写组件文件**

完整替换 `components/teacher/teacher-assist-panel.tsx` 内容为：

```typescript
'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  getTeacherGenerationHeaders,
  withCurrentTeacherThinkingConfig,
} from '@/lib/teacher/client-generation-config';
import { generateId } from '@/lib/api/stage-api-defaults';
import { cn } from '@/lib/utils';

const teacherAssistScopes = ['outline', 'chapter', 'slide', 'quiz'] as const;
export type TeacherAssistScope = (typeof teacherAssistScopes)[number];

type TeacherAssistResponse =
  | { success: true; suggestion: string }
  | { success?: false };

interface AssistMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly scope: TeacherAssistScope;
  readonly status?: 'loading' | 'error';
}

interface TeacherAssistPanelProps {
  readonly defaultScope?: TeacherAssistScope;
  readonly context?: unknown;
  readonly onApplySuggestion?: (suggestion: string, scope: TeacherAssistScope) => void;
}

export function TeacherAssistPanel({
  defaultScope = 'outline',
  context,
  onApplySuggestion,
}: TeacherAssistPanelProps) {
  const { t } = useI18n();
  const [scope, setScope] = useState<TeacherAssistScope>(defaultScope);
  const [instruction, setInstruction] = useState('');
  const [messages, setMessages] = useState<AssistMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const requestVersion = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const trimmedInstruction = instruction.trim();
  const canSubmit = trimmedInstruction !== '' && !isLoading;

  // Reset messages when context changes (e.g., scene switched)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      requestVersion.current += 1;
      setMessages([]);
      setIsLoading(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [context]);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    const currentVersion = requestVersion.current + 1;
    requestVersion.current = currentVersion;

    const userMessage: AssistMessage = {
      id: generateId(),
      role: 'user',
      content: trimmedInstruction,
      scope,
    };
    const loadingMessage: AssistMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      scope,
      status: 'loading',
    };

    setMessages((prev) => [...prev, userMessage, loadingMessage]);
    setInstruction('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/teacher/assist', {
        method: 'POST',
        headers: getTeacherGenerationHeaders(),
        body: JSON.stringify(
          withCurrentTeacherThinkingConfig({
            scope,
            instruction: trimmedInstruction,
            context,
          }),
        ),
      });
      if (requestVersion.current !== currentVersion) return;

      const json = (await response.json()) as TeacherAssistResponse;
      if (requestVersion.current !== currentVersion) return;

      if (response.ok && json.success) {
        setMessages((prev) =>
          prev.map((m) =>
            m === loadingMessage
              ? { ...loadingMessage, content: json.suggestion, status: undefined }
              : m,
          ),
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m === loadingMessage ? { ...loadingMessage, status: 'error' } : m,
          ),
        );
      }
    } catch {
      if (requestVersion.current !== currentVersion) return;
      setMessages((prev) =>
        prev.map((m) =>
          m === loadingMessage ? { ...loadingMessage, status: 'error' } : m,
        ),
      );
    } finally {
      if (requestVersion.current === currentVersion) setIsLoading(false);
    }
  };

  const retryMessage = useCallback(
    async (msg: AssistMessage) => {
      if (isLoading) return;
      const currentVersion = requestVersion.current + 1;
      requestVersion.current = currentVersion;

      const loadingMsg: AssistMessage = { ...msg, status: 'loading', content: '' };
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? loadingMsg : m)));
      setIsLoading(true);

      try {
        const response = await fetch('/api/teacher/assist', {
          method: 'POST',
          headers: getTeacherGenerationHeaders(),
          body: JSON.stringify(
            withCurrentTeacherThinkingConfig({
              scope: msg.scope,
              instruction: messages[messages.findIndex((m) => m.id === msg.id) - 1]?.content ?? '',
              context,
            }),
          ),
        });
        if (requestVersion.current !== currentVersion) return;
        const json = (await response.json()) as TeacherAssistResponse;
        if (requestVersion.current !== currentVersion) return;

        if (response.ok && json.success) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msg.id ? { ...loadingMsg, content: json.suggestion, status: undefined } : m,
            ),
          );
        } else {
          setMessages((prev) =>
            prev.map((m) => (m.id === msg.id ? { ...loadingMsg, status: 'error' } : m)),
          );
        }
      } catch {
        if (requestVersion.current !== currentVersion) return;
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...loadingMsg, status: 'error' } : m)),
        );
      } finally {
        if (requestVersion.current === currentVersion) setIsLoading(false);
      }
    },
    [context, isLoading, messages],
  );

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-200/70 bg-white/85 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/85">
      {/* Header */}
      <div className="shrink-0 space-y-1 border-b border-slate-100 px-4 pt-4 pb-3 dark:border-slate-800">
        <p className="text-xs font-medium text-purple-600 dark:text-purple-300">
          {t('teacher.assist.eyebrow')}
        </p>
        <h2 className="text-base font-semibold tracking-tight">{t('teacher.assist.title')}</h2>
        <div className="pt-1">
          <Select value={scope} onValueChange={(v) => setScope(v as TeacherAssistScope)}>
            <SelectTrigger className="h-7 w-full text-xs sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {teacherAssistScopes.map((item) => (
                <SelectItem key={item} value={item} className="text-xs">
                  {t(`teacher.assist.scopes.${item}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Message history */}
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 ? (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {t('teacher.assist.description')}
          </p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex',
                msg.role === 'user' ? 'justify-end' : 'justify-start',
              )}
            >
              {msg.role === 'user' ? (
                <div className="max-w-[85%] rounded-xl rounded-br-sm bg-purple-50 px-3 py-2 text-xs text-slate-800 dark:bg-purple-950/50 dark:text-slate-100">
                  <p className="whitespace-pre-wrap leading-5">{msg.content}</p>
                </div>
              ) : (
                <div className="max-w-[90%] space-y-2 rounded-xl rounded-bl-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/60">
                  {msg.status === 'loading' ? (
                    <div className="flex gap-1 py-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                    </div>
                  ) : msg.status === 'error' ? (
                    <div className="space-y-1">
                      <p className="text-red-600 dark:text-red-400">{t('teacher.assist.error')}</p>
                      <button
                        type="button"
                        className="text-xs text-purple-600 underline dark:text-purple-400"
                        onClick={() => void retryMessage(msg)}
                      >
                        {t('teacher.assist.generateButton')}
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap leading-5 text-slate-700 dark:text-slate-200">
                        {msg.content}
                      </p>
                      {onApplySuggestion && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          onClick={() => onApplySuggestion(msg.content, msg.scope)}
                        >
                          {t('teacher.assist.applyButton')}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Input area */}
      <form
        className="shrink-0 border-t border-slate-100 px-4 py-3 dark:border-slate-800"
        onSubmit={(e) => void sendMessage(e)}
      >
        <Textarea
          className="min-h-16 resize-none text-xs"
          value={instruction}
          placeholder={t('teacher.assist.instructionPlaceholder')}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="mt-2 flex justify-end">
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {isLoading
              ? t('teacher.assist.generatingButton')
              : t('teacher.assist.generateButton')}
          </Button>
        </div>
      </form>
    </section>
  );
}
```

- [ ] **步骤 2：验证 TypeScript 无报错**

```bash
npx tsc --noEmit 2>&1 | grep "teacher-assist-panel"
```

预期：无输出（无错误）。

- [ ] **步骤 3：确认 `course-studio-shell.tsx` 中的用法不受影响**

`TeacherAssistPanel` 导出名和 props 接口（`defaultScope`、`context`、`onApplySuggestion`）均未改变，无需修改调用方。

- [ ] **步骤 4：Commit**

```bash
git add components/teacher/teacher-assist-panel.tsx
git commit -m "feat(teacher): rewrite TeacherAssistPanel as chat-style UI with message history"
```

---

## 任务 5：重构 `course-studio-shell.tsx` 布局

**文件：**
- 修改：`components/teacher/course-studio-shell.tsx:3-12,367-401`

- [ ] **步骤 1：更新 imports**

在文件顶部的 import 区域，添加以下 import（放在已有 import 之后）：

```typescript
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSettingsStore } from '@/lib/store/settings';
import { cn } from '@/lib/utils';
```

> 注意：`useStageStore` 已在文件中导入，`useSettingsStore` 是新增的。确认 `@/lib/utils` 中有 `cn`（它在整个 codebase 中普遍使用，已存在）。

- [ ] **步骤 2：在 `CourseStudioShell` 组件中读取收起状态**

在 `CourseStudioShell` 函数体内（`const { t } = useI18n();` 这行之后），添加：

```typescript
  const assistPanelCollapsed = useSettingsStore((s) => s.assistPanelCollapsed);
  const setAssistPanelCollapsed = useSettingsStore((s) => s.setAssistPanelCollapsed);
```

- [ ] **步骤 3：替换三列布局为两列布局**

将原来的 `return` 中已加载状态下的布局块（`course-studio-shell.tsx:367-396`）：

```tsx
          <div className="flex h-screen min-h-0 overflow-hidden">
            <div className="min-w-0 flex-1">
              <CourseEditorShell classroomId={classroomId} chapterNav={chapterNav} />
            </div>
            <aside
              className="w-96 shrink-0 overflow-y-auto border-l bg-background p-4"
              aria-label={t('teacher.assist.title')}
            >
              <TeacherAssistPanel {...assistPanelProps} />
              {appliedTeacherSuggestion ? (
                <p
                  role="status"
                  className={
                    appliedTeacherSuggestion.status === 'applied'
                      ? 'mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200'
                      : 'mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200'
                  }
                >
                  {appliedTeacherSuggestion.status === 'applied'
                    ? t('teacher.assist.appliedMessage', {
                        scope: t(`teacher.assist.scopes.${appliedTeacherSuggestion.scope}`),
                      })
                    : t('teacher.assist.unsupportedMessage', {
                        scope: t(`teacher.assist.scopes.${appliedTeacherSuggestion.scope}`),
                      })}
                </p>
              ) : null}
            </aside>
            <TeacherRunStatusPanel run={project.run} />
          </div>
```

替换为：

```tsx
          <div className="flex h-screen min-h-0 overflow-hidden">
            <div className="min-w-0 flex-1">
              <CourseEditorShell classroomId={classroomId} chapterNav={chapterNav} />
            </div>

            {/* Right panel: collapsible AI assist + run status */}
            <aside
              aria-label={t('teacher.assist.title')}
              className={cn(
                'relative flex shrink-0 flex-col border-l bg-background transition-[width] duration-200 ease-in-out',
                assistPanelCollapsed ? 'w-10 overflow-hidden' : 'w-96 overflow-hidden',
              )}
            >
              {/* Collapse toggle button */}
              <button
                type="button"
                onClick={() => setAssistPanelCollapsed(!assistPanelCollapsed)}
                className="absolute top-3 -left-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background shadow-sm transition-colors hover:bg-muted"
                aria-label={assistPanelCollapsed ? t('teacher.assist.expand') : t('teacher.assist.collapse')}
              >
                {assistPanelCollapsed ? (
                  <ChevronLeft className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>

              {assistPanelCollapsed ? (
                /* Collapsed state: vertical label */
                <div className="flex h-full flex-col items-center justify-center gap-2 py-4">
                  <span
                    className="text-xs font-medium text-muted-foreground"
                    style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                  >
                    {t('teacher.assist.title')}
                  </span>
                </div>
              ) : (
                /* Expanded state: run status + chat panel */
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                  {/* Run status (only when run exists) */}
                  {project.run ? (
                    <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t('teacher.studio.runStatusTitle')}
                      </p>
                      <p className="mt-1.5 text-sm font-medium">
                        {t(getTeacherRunStepTranslationKey(project.run.step))}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {project.run.message || t('teacher.studio.runStatusNoMessage')}
                      </p>
                      <div
                        className="mt-2 h-1.5 rounded bg-muted"
                        role="progressbar"
                        aria-label={t('teacher.studio.progressLabel')}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={clampRunProgress(project.run.progress)}
                      >
                        <div
                          className="h-1.5 rounded bg-primary transition-[width] duration-300"
                          style={{ width: `${clampRunProgress(project.run.progress)}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  {/* AI Assist chat panel */}
                  <div className="flex min-h-0 flex-1 flex-col">
                    <TeacherAssistPanel {...assistPanelProps} />
                  </div>

                  {/* Applied suggestion status */}
                  {appliedTeacherSuggestion ? (
                    <p
                      role="status"
                      className={
                        appliedTeacherSuggestion.status === 'applied'
                          ? 'shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200'
                          : 'shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200'
                      }
                    >
                      {appliedTeacherSuggestion.status === 'applied'
                        ? t('teacher.assist.appliedMessage', {
                            scope: t(`teacher.assist.scopes.${appliedTeacherSuggestion.scope}`),
                          })
                        : t('teacher.assist.unsupportedMessage', {
                            scope: t(`teacher.assist.scopes.${appliedTeacherSuggestion.scope}`),
                          })}
                    </p>
                  ) : null}
                </div>
              )}
            </aside>
          </div>
```

- [ ] **步骤 4：更新 imports——引入需要的函数**

在 `course-studio-shell.tsx` 中已有 `TeacherRunStatusPanel` 的 import，需要额外引入两个函数：

```typescript
// 已有（保留）：
import { TeacherRunStatusPanel } from '@/components/teacher/teacher-run-status-panel';
// 新增从 teacher-run-status-panel 中引入工具函数：
import {
  clampRunProgress,
  getTeacherRunStepTranslationKey,
} from '@/components/teacher/teacher-run-status-panel';
```

> `clampRunProgress` 和 `getTeacherRunStepTranslationKey` 已在 `teacher-run-status-panel.tsx` 中 export（见现有文件第 6、11 行）。

- [ ] **步骤 5：添加 i18n key（`teacher.assist.expand` 和 `teacher.assist.collapse`）**

打开 `lib/i18n/locales/zh-CN.json`，在 `teacher.assist` 节点内（已有 `eyebrow`、`title` 等 key）添加：

```json
"expand": "展开辅助面板",
"collapse": "收起辅助面板"
```

打开 `lib/i18n/locales/en-US.json`（或 `en.json`，名称以实际存在的文件为准），在同一节点添加：

```json
"expand": "Expand assist panel",
"collapse": "Collapse assist panel"
```

运行 i18n 检查：

```bash
pnpm check:i18n-keys 2>&1 | tail -20
```

预期：无关于 `teacher.assist.expand` / `teacher.assist.collapse` 的报错。

- [ ] **步骤 6：验证 TypeScript 无报错**

```bash
npx tsc --noEmit 2>&1 | grep "course-studio-shell\|teacher-assist\|teacher-run"
```

预期：无输出。

- [ ] **步骤 7：Commit**

```bash
git add components/teacher/course-studio-shell.tsx lib/i18n/locales/
git commit -m "feat(studio): merge run status into collapsible AI assist panel"
```

---

## 任务 6：清理并运行全量测试

- [ ] **步骤 1：运行 lint**

```bash
pnpm lint 2>&1 | tail -30
```

预期：无 error（warning 可接受）。

- [ ] **步骤 2：运行格式化**

```bash
pnpm format 2>&1 | tail -10
```

- [ ] **步骤 3：运行全量单元测试**

```bash
pnpm test 2>&1 | tail -30
```

预期：所有测试 PASS，包括新增的 `chapter-scene-order.test.ts`。

- [ ] **步骤 4：类型检查**

```bash
npx tsc --noEmit 2>&1 | head -40
```

预期：0 errors。

- [ ] **步骤 5：最终 commit**

```bash
git add -A
git commit -m "chore: format and final cleanup for studio panel + chapter nav feature"
```

---

## 自检（编写后）

**规格覆盖度：**
- ✅ 运行状态移入 AI 辅助列顶部（任务 5 步骤 3 的 run status 卡片区块）
- ✅ AI 辅助列可收起（任务 5 步骤 3，`assistPanelCollapsed` 状态控制）
- ✅ 收起状态持久化（任务 1，Zustand persist 自动覆盖）
- ✅ AI 辅助聊天式重构（任务 4）
- ✅ 章节切换修复（任务 2 + 3）

**占位符扫描：** 无 TODO / 待定 / 补充细节。

**类型一致性：**
- `AssistMessage` 在任务 4 中定义并在同文件内使用
- `resolveChapterTargetSceneId` 在任务 2 中定义，任务 3 中 import 并使用——函数签名一致
- `assistPanelCollapsed` 在任务 1 中加入 `SettingsState`，任务 5 中通过 `useSettingsStore` 消费——字段名一致
- `clampRunProgress` / `getTeacherRunStepTranslationKey` 已在 `teacher-run-status-panel.tsx` export，任务 5 直接 import——无新增导出需要

**遗漏项核查：**
- `TeacherRunStatusPanel` 作为独立 aside 需要**从 `course-studio-shell.tsx` 的 JSX 中移除**——已在任务 5 步骤 3 的替换中完成（新 JSX 中不再出现 `<TeacherRunStatusPanel>` 标签，改为内联卡片）。但 import 语句保留（用于引入 helper 函数）——这是正确的。
