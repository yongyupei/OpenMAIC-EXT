# 课程结构区域重构 — 场景选择下拉框与 AI 重设计

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将课程结构面板顶部的单一"添加测验"按钮重构为场景类型下拉框 + 添加按钮；在场景列表操作区域新增"AI 重设计"按钮及对话框。

**架构：** 抽取 `fetchSceneContent` / `fetchSceneActions` 为共享工具函数；新建 `useSceneRedesign` Hook 管理重设计状态和调用流程；新建 `SceneRedesignDialog` Dialog 组件；修改 `SceneListEditor` 集成下拉框、添加按钮和 AI 重设计按钮。

**技术栈：** React, TypeScript, shadcn/ui (Select, Dialog, Textarea, Button), Zustand, lucide-react, i18next

---

## 文件结构

| 文件 | 类型 | 职责 |
|------|------|------|
| `lib/hooks/scene-fetch-helpers.ts` | 新增 | 从 `use-scene-generator.ts` 抽取的 `fetchSceneContent` 和 `fetchSceneActions` 共享函数，附带类型定义和 `getApiHeaders` 辅助函数 |
| `lib/hooks/use-scene-generator.ts` | 修改 | 移除本地 `fetchSceneContent` / `fetchSceneActions` / `getApiHeaders` / 相关类型定义，改为从 `scene-fetch-helpers.ts` import |
| `lib/hooks/use-scene-redesign.ts` | 新增 | 重设计逻辑 Hook：管理对话框目标场景、生成状态、进度步骤、错误、AbortController 取消 |
| `components/course-editor/scene-redesign-dialog.tsx` | 新增 | shadcn Dialog 组件：显示当前场景信息、重新设计方向文本框、参考资料链接输入、进度/错误状态展示 |
| `components/course-editor/scene-list-editor.tsx` | 修改 | ① 顶部按钮改为下拉框 + 添加按钮；② 每个场景项操作区域插入 AI 重设计按钮；③ 引入 SceneRedesignDialog |
| `lib/i18n/locales/zh-CN.json` | 修改 | 新增 22 个 i18n key |
| `lib/i18n/locales/en-US.json` | 修改 | 新增 22 个 i18n key |

---

## 任务 1：抽取共享 fetch 工具函数

**文件：**
- 创建：`lib/hooks/scene-fetch-helpers.ts`
- 修改：`lib/hooks/use-scene-generator.ts`

- [ ] **步骤 1：创建 `lib/hooks/scene-fetch-helpers.ts`**

将 `use-scene-generator.ts` 中以下私有函数和类型完整移动到新文件并 export：

```typescript
'use client';

import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { useSettingsStore } from '@/lib/store/settings';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import type { Scene } from '@/lib/types/stage';

export interface SceneContentResult {
  success: boolean;
  content?: unknown;
  effectiveOutline?: SceneOutline;
  error?: string;
}

export interface SceneActionsResult {
  success: boolean;
  scene?: Scene;
  previousSpeeches?: string[];
  error?: string;
}

function getApiHeaders(): HeadersInit {
  const config = getCurrentModelConfig();
  const settings = useSettingsStore.getState();
  const imageProviderConfig = settings.imageProvidersConfig?.[settings.imageProviderId];
  const videoProviderConfig = settings.videoProvidersConfig?.[settings.videoProviderId];

  return {
    'Content-Type': 'application/json',
    'x-model': config.modelString || '',
    'x-api-key': config.apiKey || '',
    'x-base-url': config.baseUrl || '',
    'x-provider-type': config.providerType || '',
    'x-image-provider': settings.imageProviderId || '',
    'x-image-model': settings.imageModelId || '',
    'x-image-api-key': imageProviderConfig?.apiKey || '',
    'x-image-base-url': imageProviderConfig?.baseUrl || '',
    'x-video-provider': settings.videoProviderId || '',
    'x-video-model': settings.videoModelId || '',
    'x-video-api-key': videoProviderConfig?.apiKey || '',
    'x-video-base-url': videoProviderConfig?.baseUrl || '',
    'x-image-generation-enabled': String(settings.imageGenerationEnabled ?? false),
    'x-video-generation-enabled': String(settings.videoGenerationEnabled ?? false),
  };
}

function withThinkingConfig<T extends Record<string, unknown>>(body: T): T {
  const { thinkingConfig } = getCurrentModelConfig();
  return thinkingConfig ? ({ ...body, thinkingConfig } as T) : body;
}

export async function fetchSceneContent(
  params: {
    outline: SceneOutline;
    allOutlines: SceneOutline[];
    stageId: string;
    pdfImages?: PdfImage[];
    imageMapping?: ImageMapping;
    stageInfo: {
      name: string;
      description?: string;
      language?: string;
      style?: string;
    };
    agents?: AgentInfo[];
    languageDirective?: string;
  },
  signal?: AbortSignal,
): Promise<SceneContentResult> {
  const response = await fetch('/api/generate/scene-content', {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(withThinkingConfig(params)),
    signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Request failed' }));
    return { success: false, error: data.error || `HTTP ${response.status}` };
  }

  return response.json();
}

export async function fetchSceneActions(
  params: {
    outline: SceneOutline;
    allOutlines: SceneOutline[];
    content: unknown;
    stageId: string;
    agents?: AgentInfo[];
    previousSpeeches?: string[];
    userProfile?: string;
    languageDirective?: string;
  },
  signal?: AbortSignal,
): Promise<SceneActionsResult> {
  const response = await fetch('/api/generate/scene-actions', {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(withThinkingConfig(params)),
    signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Request failed' }));
    return { success: false, error: data.error || `HTTP ${response.status}` };
  }

  return response.json();
}
```

- [ ] **步骤 2：修改 `lib/hooks/use-scene-generator.ts` 移除本地定义**

删除以下本地定义（它们已被移到 `scene-fetch-helpers.ts`）：
- `SceneContentResult` interface
- `SceneActionsResult` interface
- `getApiHeaders()` function
- `withThinkingConfig()` function
- `fetchSceneContent()` function
- `fetchSceneActions()` function

添加 import：
```typescript
import {
  fetchSceneContent,
  fetchSceneActions,
  type SceneContentResult,
  type SceneActionsResult,
} from './scene-fetch-helpers';
```

移除以下 import（不再需要）：
- `getCurrentModelConfig` from `@/lib/utils/model-config`
- `useSettingsStore` from `@/lib/store/settings`

- [ ] **步骤 3：运行 TypeScript 检查**

```bash
cd d:/CodeSpace/VibeSpace/case003/open-maic && npx tsc --noEmit
```
预期：无错误

- [ ] **步骤 4：Commit**

```bash
git add lib/hooks/scene-fetch-helpers.ts lib/hooks/use-scene-generator.ts
git commit -m "refactor: extract fetchSceneContent/fetchSceneActions into shared helpers"
```

---

## 任务 2：添加 i18n Key

**文件：**
- 修改：`lib/i18n/locales/zh-CN.json`
- 修改：`lib/i18n/locales/en-US.json`

- [ ] **步骤 1：在 `zh-CN.json` 的 `courseEditor` 对象中添加 key**

在 `courseEditor` 对象内（插入到任意现有 key 之后，保持字母排序），添加以下 key：

```json
    "sceneTypeLabel": {
      "slide": "幻灯片 Slide",
      "quiz": "测验 Quiz",
      "interactive": "交互 Interactive",
      "pbl": "PBL项目 PBL"
    },
    "addScene": "添加",
    "defaultSceneTitle": {
      "slide": "幻灯片 {{n}}",
      "quiz": "测验 {{n}}",
      "interactive": "交互 {{n}}",
      "pbl": "PBL项目 {{n}}"
    },
    "redesignScene": "AI重设计",
    "redesignTitle": "AI 重新设计场景",
    "redesignDirection": "重新设计方向",
    "redesignDirectionPlaceholder": "描述你希望如何改变这个场景的内容、风格或结构…",
    "redesignReferences": "参考资料（可选）",
    "redesignUploadDoc": "上传文档",
    "redesignAddLink": "添加链接",
    "redesignStart": "开始重设计",
    "redesignCancel": "取消",
    "redesignCancelGeneration": "取消生成",
    "redesignGenerating": "正在生成内容…",
    "redesignStepContent": "步骤 1/2：生成场景内容",
    "redesignStepActions": "步骤 2/2：生成场景动作",
    "redesignError": "生成失败",
    "redesignRetry": "重试",
    "redesignComingSoon": "即将支持",
```

- [ ] **步骤 2：在 `en-US.json` 的 `courseEditor` 对象中添加对应 key**

```json
    "sceneTypeLabel": {
      "slide": "Slide",
      "quiz": "Quiz",
      "interactive": "Interactive",
      "pbl": "PBL Project"
    },
    "addScene": "Add",
    "defaultSceneTitle": {
      "slide": "Slide {{n}}",
      "quiz": "Quiz {{n}}",
      "interactive": "Interactive {{n}}",
      "pbl": "PBL Project {{n}}"
    },
    "redesignScene": "AI Redesign",
    "redesignTitle": "AI Redesign Scene",
    "redesignDirection": "Redesign Direction",
    "redesignDirectionPlaceholder": "Describe how you want to change the content, style, or structure of this scene…",
    "redesignReferences": "References (optional)",
    "redesignUploadDoc": "Upload Document",
    "redesignAddLink": "Add Link",
    "redesignStart": "Start Redesign",
    "redesignCancel": "Cancel",
    "redesignCancelGeneration": "Cancel Generation",
    "redesignGenerating": "Generating content…",
    "redesignStepContent": "Step 1/2: Generating scene content",
    "redesignStepActions": "Step 2/2: Generating scene actions",
    "redesignError": "Generation failed",
    "redesignRetry": "Retry",
    "redesignComingSoon": "Coming soon",
```

- [ ] **步骤 3：运行 i18n key 检查**

```bash
cd d:/CodeSpace/VibeSpace/case003/open-maic && pnpm check:i18n-keys
```
预期：通过（无 missing/extra key 报错）

- [ ] **步骤 4：Commit**

```bash
git add lib/i18n/locales/zh-CN.json lib/i18n/locales/en-US.json
git commit -m "feat(i18n): add keys for scene type selector and AI redesign"
```

---

## 任务 3：创建 `useSceneRedesign` Hook

**文件：**
- 创建：`lib/hooks/use-scene-redesign.ts`

- [ ] **步骤 1：创建 Hook 文件**

```typescript
'use client';

import { useState, useRef, useCallback } from 'react';
import { useStageStore } from '@/lib/store/stage';
import { buildCompleteScene } from '@/lib/generation/scene-builder';
import { fetchSceneContent, fetchSceneActions } from './scene-fetch-helpers';
import type { Scene } from '@/lib/types/stage';
import type { SceneOutline } from '@/lib/types/generation';

function sceneToOutline(scene: Scene): SceneOutline {
  return {
    id: scene.id,
    type: scene.type,
    title: scene.title,
    description: '',
    keyPoints: [],
    order: scene.order,
    ...(scene.type === 'quiz'
      ? {
          quizConfig: {
            questionCount: 1,
            difficulty: 'medium' as const,
            questionTypes: ['single' as const],
          },
        }
      : {}),
    ...(scene.type === 'pbl'
      ? {
          pblConfig: {
            projectTopic: scene.title,
            projectDescription: '',
            targetSkills: [],
            issueCount: 3,
          },
        }
      : {}),
  };
}

export function useSceneRedesign() {
  const updateScene = useStageStore.use.updateScene();
  const outlines = useStageStore.use.outlines();
  const stage = useStageStore.use.stage();

  const [redesignTarget, setRedesignTarget] = useState<Scene | null>(null);
  const [isRedesigning, setIsRedesigning] = useState(false);
  const [redesignStep, setRedesignStep] = useState<'content' | 'actions' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startRedesign = useCallback(
    async (direction: string, referenceLinks?: string[]) => {
      if (!redesignTarget || !stage) return;

      setIsRedesigning(true);
      setError(null);
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      try {
        const outline = sceneToOutline(redesignTarget);

        let enhancedDescription = outline.description;
        if (direction) {
          enhancedDescription += `\n\n[重新设计方向]: ${direction}`;
        }
        if (referenceLinks && referenceLinks.length > 0) {
          enhancedDescription += `\n\n[参考资料]: ${referenceLinks.join(', ')}`;
        }

        const enhancedOutline = { ...outline, description: enhancedDescription };

        setRedesignStep('content');
        const contentResult = await fetchSceneContent(
          {
            outline: enhancedOutline,
            allOutlines: outlines,
            stageId: stage.id,
            stageInfo: {
              name: stage.name,
              description: stage.description,
            },
          },
          signal,
        );

        if (!contentResult.success) {
          throw new Error(contentResult.error || 'Failed to generate scene content');
        }

        setRedesignStep('actions');
        const actionsResult = await fetchSceneActions(
          {
            outline: contentResult.effectiveOutline || enhancedOutline,
            allOutlines: outlines,
            content: contentResult.content,
            stageId: stage.id,
          },
          signal,
        );

        if (!actionsResult.success || !actionsResult.scene) {
          throw new Error(actionsResult.error || 'Failed to generate scene actions');
        }

        const newScene = buildCompleteScene(
          enhancedOutline,
          contentResult.content!,
          actionsResult.scene.actions || [],
          stage.id,
        );

        if (!newScene) {
          throw new Error('Failed to build complete scene');
        }

        updateScene(redesignTarget.id, {
          content: newScene.content,
          actions: newScene.actions,
          title: newScene.title,
          updatedAt: Date.now(),
        });

        setRedesignTarget(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Generation failed');
      } finally {
        setIsRedesigning(false);
        setRedesignStep(null);
        abortRef.current = null;
      }
    },
    [redesignTarget, stage, outlines, updateScene],
  );

  const cancelRedesign = useCallback(() => {
    abortRef.current?.abort();
    setIsRedesigning(false);
    setRedesignStep(null);
    abortRef.current = null;
  }, []);

  return {
    redesignTarget,
    setRedesignTarget,
    isRedesigning,
    redesigningSceneId: isRedesigning ? (redesignTarget?.id ?? null) : null,
    redesignStep,
    error,
    startRedesign,
    cancelRedesign,
  };
}
```

- [ ] **步骤 2：运行 TypeScript 检查**

```bash
cd d:/CodeSpace/VibeSpace/case003/open-maic && npx tsc --noEmit
```
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add lib/hooks/use-scene-redesign.ts
git commit -m "feat(hooks): add useSceneRedesign hook for single scene AI redesign"
```

---

## 任务 4：创建 `SceneRedesignDialog` 组件

**文件：**
- 创建：`components/course-editor/scene-redesign-dialog.tsx`

- [ ] **步骤 1：创建组件文件**

```tsx
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Sparkles, Loader2, X, Link2, FileUp } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { Scene } from '@/lib/types/stage';
import type { SceneType } from '@/lib/types/stage';

interface SceneRedesignDialogProps {
  scene: Scene | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isRedesigning: boolean;
  redesignStep: 'content' | 'actions' | null;
  error: string | null;
  onStartRedesign: (direction: string, referenceLinks: string[]) => void;
  onCancel: () => void;
}

const SCENE_TYPE_LABELS: Record<SceneType, string> = {
  slide: '幻灯片',
  quiz: '测验',
  interactive: '交互',
  pbl: 'PBL项目',
};

export function SceneRedesignDialog({
  scene,
  open,
  onOpenChange,
  isRedesigning,
  redesignStep,
  error,
  onStartRedesign,
  onCancel,
}: SceneRedesignDialogProps) {
  const { t } = useI18n();
  const [direction, setDirection] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [referenceLinks, setReferenceLinks] = useState<string[]>([]);

  const handleClose = () => {
    if (isRedesigning) return;
    onOpenChange(false);
  };

  const handleAddLink = () => {
    const trimmed = linkInput.trim();
    if (!trimmed) return;
    if (!referenceLinks.includes(trimmed)) {
      setReferenceLinks((prev) => [...prev, trimmed]);
    }
    setLinkInput('');
  };

  const handleRemoveLink = (link: string) => {
    setReferenceLinks((prev) => prev.filter((l) => l !== link));
  };

  const handleStart = () => {
    onStartRedesign(direction.trim(), referenceLinks);
  };

  if (!scene) return null;

  const typeLabel = SCENE_TYPE_LABELS[scene.type] || scene.type;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => {
        if (isRedesigning) e.preventDefault();
      }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-purple-600" />
            {t('courseEditor.redesignTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Scene info */}
          <div className="text-sm text-muted-foreground">
            {t('courseEditor.sceneTitle')}: <strong>{scene.title}</strong>
            {' · '}
            <span className="rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-700 dark:bg-purple-900/20 dark:text-purple-400">
              {typeLabel}
            </span>
          </div>

          {isRedesigning ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="size-8 animate-spin text-purple-600" />
              <div className="text-sm text-muted-foreground">
                {redesignStep === 'content' && t('courseEditor.redesignStepContent')}
                {redesignStep === 'actions' && t('courseEditor.redesignStepActions')}
                {!redesignStep && t('courseEditor.redesignGenerating')}
              </div>
            </div>
          ) : error ? (
            <div className="space-y-3">
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStart()}
                className="w-full"
              >
                {t('courseEditor.redesignRetry')}
              </Button>
            </div>
          ) : (
            <>
              {/* Direction */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('courseEditor.redesignDirection')}
                </label>
                <Textarea
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                  placeholder={t('courseEditor.redesignDirectionPlaceholder')}
                  rows={4}
                  className="resize-none"
                />
              </div>

              {/* References */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('courseEditor.redesignReferences')}
                </label>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2 text-muted-foreground"
                  disabled
                  title={t('courseEditor.redesignComingSoon')}
                >
                  <FileUp className="size-4" />
                  {t('courseEditor.redesignUploadDoc')}
                </Button>

                <div className="flex gap-2">
                  <Input
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    placeholder="https://..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddLink();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddLink}
                    disabled={!linkInput.trim()}
                  >
                    <Link2 className="size-4" />
                    {t('courseEditor.redesignAddLink')}
                  </Button>
                </div>

                {referenceLinks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {referenceLinks.map((link) => (
                      <span
                        key={link}
                        className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs"
                      >
                        {link.length > 40 ? `${link.slice(0, 40)}...` : link}
                        <button
                          type="button"
                          onClick={() => handleRemoveLink(link)}
                          className="rounded-full p-0.5 hover:bg-muted"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            {isRedesigning ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
              >
                {t('courseEditor.redesignCancelGeneration')}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                >
                  {t('courseEditor.redesignCancel')}
                </Button>
                <Button
                  size="sm"
                  onClick={handleStart}
                  disabled={!direction.trim()}
                  className="gap-1.5"
                >
                  <Sparkles className="size-3.5" />
                  {t('courseEditor.redesignStart')}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **步骤 2：运行 TypeScript 检查**

```bash
cd d:/CodeSpace/VibeSpace/case003/open-maic && npx tsc --noEmit
```
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add components/course-editor/scene-redesign-dialog.tsx
git commit -m "feat(ui): add SceneRedesignDialog component"
```

---

## 任务 5：修改 `SceneListEditor` — 顶部下拉框 + 添加按钮

**文件：**
- 修改：`components/course-editor/scene-list-editor.tsx`

- [ ] **步骤 1：添加 import**

添加以下 import：
```tsx
import { Sparkles, ChevronDown } from 'lucide-react';
import { useState } from 'react'; // 已有 useState import，无需重复
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
```

- [ ] **步骤 2：定义场景类型配置和工厂函数**

在文件顶部（`createQuizScene` 函数之后），添加：

```typescript
const SCENE_TYPE_CONFIG: { type: SceneType; labelKey: string; emoji: string }[] = [
  { type: 'slide', labelKey: 'courseEditor.sceneTypeLabel.slide', emoji: '🖼' },
  { type: 'quiz', labelKey: 'courseEditor.sceneTypeLabel.quiz', emoji: '📊' },
  { type: 'interactive', labelKey: 'courseEditor.sceneTypeLabel.interactive', emoji: '🧪' },
  { type: 'pbl', labelKey: 'courseEditor.sceneTypeLabel.pbl', emoji: '📚' },
];

function createSlideScene(stageId: string, order: number, title: string): Scene {
  return {
    id: createId('scene'),
    stageId,
    type: 'slide',
    title,
    order,
    content: { type: 'slide', canvas: { id: createId('slide'), viewportSize: 1000, viewportRatio: 0.5625, theme: { backgroundColor: '#ffffff', themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'], fontColor: '#333333', fontName: 'Microsoft YaHei', outline: { color: '#d14424', width: 2, style: 'solid' }, shadow: { h: 0, v: 0, blur: 10, color: '#000000' } }, elements: [], background: { type: 'solid', color: '#ffffff' } } },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createInteractiveScene(stageId: string, order: number, title: string): Scene {
  return {
    id: createId('scene'),
    stageId,
    type: 'interactive',
    title,
    order,
    content: { type: 'interactive', url: '' },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createPblScene(stageId: string, order: number, title: string): Scene {
  return {
    id: createId('scene'),
    stageId,
    type: 'pbl',
    title,
    order,
    content: { type: 'pbl', projectConfig: { projectTopic: title, projectDescription: '', targetSkills: [], issueCount: 3 } },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createScene(type: SceneType, stageId: string, order: number, title: string): Scene {
  switch (type) {
    case 'slide': return createSlideScene(stageId, order, title);
    case 'quiz': return createQuizScene(stageId, order, title);
    case 'interactive': return createInteractiveScene(stageId, order, title);
    case 'pbl': return createPblScene(stageId, order, title);
  }
}

const LAST_SELECTED_SCENE_TYPE_KEY = 'lastSelectedSceneType';
```

注意：需要引入 `SceneType`（它来自 `@/lib/types/stage`，已引入 `Scene`）。

添加 `import type { SceneType } from '@/lib/types/stage';`

- [ ] **步骤 3：将顶部按钮区域替换为下拉框 + 添加按钮**

在 `SceneListEditor` 组件内部，找到当前"添加测验"按钮的 JSX（位于 `shrink-0 px-3 pb-2` div 内）。需要替换两处（一处在 `chapterNav` 分支，一处在 `else` 分支）。

替换为以下组件逻辑：

```tsx
  // 在组件内添加 state
  const [selectedSceneType, setSelectedSceneType] = useState<SceneType>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(LAST_SELECTED_SCENE_TYPE_KEY) as SceneType | null;
      if (saved && SCENE_TYPE_CONFIG.some((c) => c.type === saved)) return saved;
    }
    return 'quiz';
  });

  const handleAddScene = () => {
    if (!stage) return;
    const title = t(`courseEditor.defaultSceneTitle.${selectedSceneType}`, { n: scenes.length + 1 });
    const newScene = createScene(selectedSceneType, stage.id, scenes.length, title);
    const nextScenes = normalizeSceneOrder([...scenes, newScene]);
    setScenes(nextScenes);
    setCurrentSceneId(nextScenes[nextScenes.length - 1]?.id ?? null);
  };
```

然后将两处按钮区域（分别位于第 189-214 行和第 316-341 行附近）替换为：

```tsx
<div className="shrink-0 px-3 pb-2">
  {!readOnly ? (
    <div className="flex items-center gap-2">
      <Select
        value={selectedSceneType}
        onValueChange={(value: SceneType) => {
          setSelectedSceneType(value);
          localStorage.setItem(LAST_SELECTED_SCENE_TYPE_KEY, value);
        }}
        disabled={!stage}
      >
        <SelectTrigger className="h-8 flex-1 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SCENE_TYPE_CONFIG.map((config) => (
            <SelectItem key={config.type} value={config.type}>
              <span className="mr-1">{config.emoji}</span>
              {t(config.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        disabled={!stage}
        onClick={handleAddScene}
      >
        <Plus className="size-4" />
        {t('courseEditor.addScene')}
      </Button>
    </div>
  ) : null}
</div>
```

注意：`courseEditor.defaultSceneTitle.xxx` 这些 key 是新添加的，使用 `t(key, { n: value })` 插值。

- [ ] **步骤 4：运行 TypeScript 检查**

```bash
cd d:/CodeSpace/VibeSpace/case003/open-maic && npx tsc --noEmit
```
预期：无错误

- [ ] **步骤 5：Commit**

```bash
git add components/course-editor/scene-list-editor.tsx
git commit -m "feat(editor): replace add-quiz button with scene type selector + add button"
```

---

## 任务 6：修改 `SceneListEditor` — AI 重设计按钮集成

**文件：**
- 修改：`components/course-editor/scene-list-editor.tsx`

- [ ] **步骤 1：添加 import**

```tsx
import { SceneRedesignDialog } from './scene-redesign-dialog';
import { useSceneRedesign } from '@/lib/hooks/use-scene-redesign';
import { Sparkles } from 'lucide-react'; // 步骤5中已有
```

- [ ] **步骤 2：在组件内引入 hook**

```tsx
  const { t } = useI18n(); // 已有
  const stage = useStageStore.use.stage(); // 已有
  const scenes = useStageStore.use.scenes(); // 已有
  // ...

  const {
    redesignTarget,
    setRedesignTarget,
    isRedesigning,
    redesigningSceneId,
    redesignStep,
    error,
    startRedesign,
    cancelRedesign,
  } = useSceneRedesign();
```

- [ ] **步骤 3：在每个场景项的操作区域插入 AI 重设计按钮**

在场景项的 `!readOnly` 操作按钮区域（`mt-2 flex flex-wrap gap-1` div 内），在「复制」按钮之后、「删除」按钮之前，插入：

```tsx
<Button
  size="icon-xs"
  variant="ghost"
  className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20"
  aria-label={t('courseEditor.redesignScene')}
  disabled={redesigningSceneId === scene.id}
  onClick={() => setRedesignTarget(scene)}
>
  <Sparkles className="size-3" />
</Button>
```

有两处需要修改（`chapterNav` 分支内的场景列表和 `else` 分支内的场景列表），两处结构完全相同。确保两处都插入。

- [ ] **步骤 4：在组件 JSX 底部添加 Dialog 组件**

在 `return (...)` 的末尾（`</div>` 闭合标签之前），添加：

```tsx
      <SceneRedesignDialog
        scene={redesignTarget}
        open={redesignTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isRedesigning) {
            setRedesignTarget(null);
          }
        }}
        isRedesigning={isRedesigning}
        redesignStep={redesignStep}
        error={error}
        onStartRedesign={startRedesign}
        onCancel={cancelRedesign}
      />
```

注意：此 Dialog 应放在最外层 `return` 的 `</div>` 之前，与面板内容同级（但在面板容器内部或外部均可，Dialog 使用 portal）。建议放在最外层 `</div>` 之前。

- [ ] **步骤 5：运行 TypeScript 检查**

```bash
cd d:/CodeSpace/VibeSpace/case003/open-maic && npx tsc --noEmit
```
预期：无错误

- [ ] **步骤 6：Commit**

```bash
git add components/course-editor/scene-list-editor.tsx
git commit -m "feat(editor): add AI redesign button and dialog to scene list items"
```

---

## 任务 7：代码质量检查

- [ ] **步骤 1：运行 Prettier 格式化**

```bash
cd d:/CodeSpace/VibeSpace/case003/open-maic && pnpm format
```

- [ ] **步骤 2：运行 ESLint**

```bash
cd d:/CodeSpace/VibeSpace/case003/open-maic && pnpm lint
```
预期：无错误（或仅与本次变更无关的现有警告）

- [ ] **步骤 3：运行 TypeScript 类型检查**

```bash
cd d:/CodeSpace/VibeSpace/case003/open-maic && npx tsc --noEmit
```
预期：无错误

- [ ] **步骤 4：运行 i18n key 检查**

```bash
cd d:/CodeSpace/VibeSpace/case003/open-maic && pnpm check:i18n-keys
```
预期：通过（无 missing/extra key 报错）

- [ ] **步骤 5：Commit 格式化变更**

```bash
git add -A
git commit -m "style: format and lint"
```

---

## 自检

**1. 规格覆盖度：**

| 规格需求 | 实现任务 |
|----------|---------|
| 场景类型下拉框（slide/quiz/interactive/pbl） | 任务 5 |
| 记忆上次选择（localStorage） | 任务 5 |
| 添加按钮调用对应工厂函数 | 任务 5 |
| AI 重设计按钮（紫色 Sparkles 图标） | 任务 6 |
| 重设计对话框（方向输入 + 参考资料） | 任务 4 |
| 生成中进度显示 | 任务 4 + 任务 3 |
| 生成完成后覆盖原场景 | 任务 3 |
| 取消生成（AbortController） | 任务 3 |
| i18n 支持 | 任务 2 |
| 复用现有 API 不新增路由 | 任务 1 + 任务 3 |

无遗漏。

**2. 占位符扫描：**

- 无 "TODO" / "TBD" / "后续实现"
- 所有代码片段包含完整实现
- 所有步骤包含具体命令和预期结果
- 所有文件路径精确

**3. 类型一致性：**

- `SceneContentResult` / `SceneActionsResult` 在任务 1 定义，任务 1 和任务 3 中使用一致
- `SceneType` 来自 `@/lib/types/stage`，与项目类型系统一致
- `Partial<Scene>` 是 `updateScene` 接受的类型，任务 3 传递 `{ content, actions, title, updatedAt }` 正确

**4. 依赖验证：**

- `scene-fetch-helpers.ts` 中的 `getApiHeaders` 使用了 `useSettingsStore.getState()`，这是有效的 store 访问模式（非 hook 调用，在函数内部调用）
- `buildCompleteScene` 返回 `Scene | null`，任务 3 中已处理 `null` 情况
- `fetchSceneContent` / `fetchSceneActions` 的 `success` 字段已检查
