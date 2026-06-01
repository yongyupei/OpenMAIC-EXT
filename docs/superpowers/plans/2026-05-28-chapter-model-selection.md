# 章节级模型选择 — 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 设计工作台每个章节可选择生成模型；未选则继承全局设置；生成 API 使用章节模型。

**架构：** 在 `generationProfileSchema` 顶层增加 `providerId`/`modelId`；章节通过 `generationProfileOverride` 持久化；客户端 `resolveChapterGenerationModelConfig` 解析后写入 `x-model` 请求头；服务端 `resolveModelForChapterGeneration` 以持久化 override 为 fallback。

**技术栈：** Next.js App Router、Zustand settings store、Vitest、i18n fork overlays

**规格：** [`docs/superpowers/specs/2026-05-28-chapter-model-selection-design.md`](../specs/2026-05-28-chapter-model-selection-design.md)

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `lib/extends/teacher/generation-profile.ts` | Schema 增加顶层 `providerId`/`modelId` |
| `lib/extends/teacher/resolve-chapter-model-config.ts` | 客户端：章节 override → 完整 model config |
| `lib/extends/server/resolve-chapter-model.ts` | 服务端：章节 override 优先于 headers |
| `app/extends/api/teacher/.../generate/route.ts` | 接入服务端解析 |
| `app/extends/api/teacher/.../generate-outline/route.ts` | 同上（单章 outline） |
| `components/extends/teacher/design-workbench/chapter-model-select-field.tsx` | 章节模型 Popover 选择器 |
| `components/extends/teacher/design-workbench/chapter-generation-settings-field.tsx` | 嵌入模型字段 |
| `components/extends/teacher/design-workbench/chapter-list-editor.tsx` | 传递 override 与 onChange |
| `components/extends/teacher/course-project-design-shell.tsx` | `updateChapter` 支持 `generationProfileOverride` |
| `components/extends/teacher/chapter-generate-shell.tsx` | POST 使用章节 headers |
| `lib/extends/i18n/locales/*.json` | 文案快照 |
| `tests/extends/teacher/resolve-chapter-model-config.test.ts` | 客户端解析测试 |
| `tests/extends/server/resolve-chapter-model.test.ts` | 服务端解析测试 |

---

### 任务 1：Schema — 顶层 model 字段

**文件：**
- 修改：`lib/extends/teacher/generation-profile.ts`

- [ ] **步骤 1：在 `generationProfileSchema` 增加字段**

在 `slideOutputFormat` 行之后、`promptOverrides` 之前添加：

```typescript
  providerId: z.string().optional(),
  modelId: z.string().optional(),
```

- [ ] **步骤 2：类型检查**

运行：`npx tsc --noEmit`
预期：无新增 error（`GenerationProfileOverride` 自动包含新字段）

- [ ] **步骤 3：Commit**

```bash
git add lib/extends/teacher/generation-profile.ts
git commit -m "feat(teacher): add providerId/modelId to generation profile schema"
```

---

### 任务 2：客户端模型解析

**文件：**
- 创建：`lib/extends/teacher/resolve-chapter-model-config.ts`
- 创建：`tests/extends/teacher/resolve-chapter-model-config.test.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
// tests/extends/teacher/resolve-chapter-model-config.test.ts
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useSettingsStore } from '@/lib/store/settings';
import {
  resolveChapterGenerationModelConfig,
  getTeacherGenerationHeadersForChapter,
} from '@/lib/extends/teacher/resolve-chapter-model-config';

describe('resolveChapterGenerationModelConfig', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      providerId: 'openai',
      modelId: 'gpt-4o-mini',
      providersConfig: {
        openai: {
          name: 'OpenAI',
          type: 'openai',
          requiresApiKey: true,
          apiKey: 'sk-global',
          baseUrl: '',
          models: [{ id: 'gpt-4o-mini', name: 'GPT-4o Mini' }],
        },
        anthropic: {
          name: 'Anthropic',
          type: 'anthropic',
          requiresApiKey: true,
          apiKey: 'sk-anthropic',
          baseUrl: '',
          models: [{ id: 'claude-sonnet-4', name: 'Claude Sonnet 4' }],
        },
      },
    } as never);
  });

  test('returns global config when chapter has no override', () => {
    const cfg = resolveChapterGenerationModelConfig(undefined);
    expect(cfg.providerId).toBe('openai');
    expect(cfg.modelId).toBe('gpt-4o-mini');
    expect(cfg.modelString).toBe('openai:gpt-4o-mini');
  });

  test('returns chapter override when providerId and modelId set', () => {
    const cfg = resolveChapterGenerationModelConfig({
      generationProfileOverride: {
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4',
      },
    });
    expect(cfg.providerId).toBe('anthropic');
    expect(cfg.modelId).toBe('claude-sonnet-4');
    expect(cfg.apiKey).toBe('sk-anthropic');
  });

  test('falls back to global when override is partial', () => {
    const cfg = resolveChapterGenerationModelConfig({
      generationProfileOverride: { modelId: 'claude-sonnet-4' },
    });
    expect(cfg.providerId).toBe('openai');
    expect(cfg.modelId).toBe('gpt-4o-mini');
  });

  test('getTeacherGenerationHeadersForChapter sets x-model from override', () => {
    const headers = getTeacherGenerationHeadersForChapter({
      generationProfileOverride: {
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4',
      },
    });
    expect(headers['x-model']).toBe('anthropic:claude-sonnet-4');
    expect(headers['x-api-key']).toBe('sk-anthropic');
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`pnpm test tests/extends/teacher/resolve-chapter-model-config.test.ts`
预期：FAIL — module not found

- [ ] **步骤 3：实现解析模块**

```typescript
// lib/extends/teacher/resolve-chapter-model-config.ts
'use client';

import {
  getThinkingConfigKey,
  normalizeThinkingConfig,
  supportsConfigurableThinking,
} from '@/lib/ai/thinking-config';
import type { ProviderId } from '@/lib/ai/providers';
import { useSettingsStore } from '@/lib/store/settings';
import {
  buildTeacherGenerationHeaders,
  withCurrentTeacherThinkingConfig,
} from '@/lib/teacher/client-generation-config';
import type { GenerationProfileOverride } from '@/lib/teacher/generation-profile';

export interface ChapterModelSource {
  readonly generationProfileOverride?: GenerationProfileOverride;
}

function buildConfigFromProvider(
  providerId: ProviderId,
  modelId: string,
): ReturnType<typeof import('@/lib/utils/model-config').getCurrentModelConfig> {
  const { providersConfig, thinkingConfigs } = useSettingsStore.getState();
  const providerConfig = providersConfig[providerId];
  const modelInfo = providerConfig?.models.find((m) => m.id === modelId);
  const thinking = modelInfo?.capabilities?.thinking;
  const thinkingConfig = supportsConfigurableThinking(thinking)
    ? normalizeThinkingConfig(thinking, thinkingConfigs[getThinkingConfigKey(providerId, modelId)])
    : undefined;

  return {
    providerId,
    modelId,
    modelString: `${providerId}:${modelId}`,
    apiKey: providerConfig?.apiKey || '',
    baseUrl: providerConfig?.baseUrl || '',
    providerType: providerConfig?.type,
    requiresApiKey: providerConfig?.requiresApiKey,
    isServerConfigured: providerConfig?.isServerConfigured,
    thinkingConfig,
  };
}

export function resolveChapterGenerationModelConfig(chapter?: ChapterModelSource) {
  const override = chapter?.generationProfileOverride;
  if (override?.providerId && override?.modelId) {
    return buildConfigFromProvider(
      override.providerId as ProviderId,
      override.modelId,
    );
  }
  const { getCurrentModelConfig } = require('@/lib/utils/model-config') as typeof import('@/lib/utils/model-config');
  return getCurrentModelConfig();
}

export function getTeacherGenerationHeadersForChapter(chapter?: ChapterModelSource) {
  return buildTeacherGenerationHeaders(resolveChapterGenerationModelConfig(chapter));
}

export function withChapterThinkingConfig<T extends Record<string, unknown>>(
  body: T,
  chapter?: ChapterModelSource,
): T {
  const thinkingConfig = resolveChapterGenerationModelConfig(chapter).thinkingConfig;
  return withCurrentTeacherThinkingConfig(body); // replace: use thinkingConfig from resolveChapterGenerationModelConfig
}
```

**修正：** `withChapterThinkingConfig` 应调用 `withTeacherThinkingConfig(body, thinkingConfig)`（从 `@/lib/teacher/client-generation-config` 导入），不要用 global 的 `withCurrentTeacherThinkingConfig`。

`resolveChapterGenerationModelConfig` 中对 `getCurrentModelConfig` 使用 **静态 import**，不要用 `require`。

最终 import 区：

```typescript
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import {
  buildTeacherGenerationHeaders,
  withTeacherThinkingConfig,
} from '@/lib/teacher/client-generation-config';
```

- [ ] **步骤 4：运行测试确认通过**

运行：`pnpm test tests/extends/teacher/resolve-chapter-model-config.test.ts`
预期：PASS（4 tests）

- [ ] **步骤 5：Commit**

```bash
git add lib/extends/teacher/resolve-chapter-model-config.ts tests/extends/teacher/resolve-chapter-model-config.test.ts
git commit -m "feat(teacher): resolve chapter generation model from override or global"
```

---

### 任务 3：服务端章节模型解析

**文件：**
- 创建：`lib/extends/server/resolve-chapter-model.ts`
- 创建：`tests/extends/server/resolve-chapter-model.test.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
// tests/extends/server/resolve-chapter-model.test.ts
import { describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { CourseChapter } from '@/lib/teacher/course-types';

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModel: vi.fn(async (params: { modelString?: string }) => ({
    model: {},
    modelInfo: {},
    modelString: params.modelString ?? 'default',
    providerId: 'mock',
    modelId: 'mock',
    apiKey: '',
  })),
  resolveModelFromRequest: vi.fn(async () => ({
    model: {},
    modelInfo: {},
    modelString: 'from-headers',
    providerId: 'header-provider',
    modelId: 'header-model',
    apiKey: '',
  })),
}));

import { resolveModel, resolveModelFromRequest } from '@/lib/server/resolve-model';
import { resolveModelForChapterGeneration } from '@/lib/extends/server/resolve-chapter-model';

describe('resolveModelForChapterGeneration', () => {
  test('uses chapter override when both providerId and modelId present', async () => {
    const chapter = {
      generationProfileOverride: { providerId: 'anthropic', modelId: 'claude-sonnet-4' },
    } as CourseChapter;
    const req = new NextRequest('http://localhost/api/test');
    await resolveModelForChapterGeneration(req, {}, chapter);
    expect(resolveModel).toHaveBeenCalledWith(
      expect.objectContaining({ modelString: 'anthropic:claude-sonnet-4' }),
    );
    expect(resolveModelFromRequest).not.toHaveBeenCalled();
  });

  test('falls back to request headers when no override', async () => {
    const chapter = {} as CourseChapter;
    const req = new NextRequest('http://localhost/api/test', {
      headers: { 'x-model': 'openai:gpt-4o-mini' },
    });
    await resolveModelForChapterGeneration(req, {}, chapter);
    expect(resolveModelFromRequest).toHaveBeenCalled();
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`pnpm test tests/extends/server/resolve-chapter-model.test.ts`
预期：FAIL

- [ ] **步骤 3：实现服务端 helper**

```typescript
// lib/extends/server/resolve-chapter-model.ts
import type { NextRequest } from 'next/server';
import {
  resolveModel,
  resolveModelFromRequest,
  type ResolvedModel,
} from '@/lib/server/resolve-model';
import type { CourseChapter } from '@/lib/teacher/course-types';

export async function resolveModelForChapterGeneration(
  request: NextRequest,
  body: unknown,
  chapter: CourseChapter,
): Promise<ResolvedModel> {
  const override = chapter.generationProfileOverride;
  if (override?.providerId && override?.modelId) {
    const resolved = await resolveModel({
      modelString: `${override.providerId}:${override.modelId}`,
    });
    const fromBody = await resolveModelFromRequest(request, body);
    return {
      ...resolved,
      thinkingConfig: fromBody.thinkingConfig ?? resolved.thinkingConfig,
    };
  }
  return resolveModelFromRequest(request, body);
}
```

- [ ] **步骤 4：运行测试确认通过**

运行：`pnpm test tests/extends/server/resolve-chapter-model.test.ts`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add lib/extends/server/resolve-chapter-model.ts tests/extends/server/resolve-chapter-model.test.ts
git commit -m "feat(teacher): server-side chapter model resolution with override priority"
```

---

### 任务 4：接入生成 API 路由

**文件：**
- 修改：`app/extends/api/teacher/projects/[projectId]/chapters/[chapterId]/generate/route.ts`
- 修改：`app/extends/api/teacher/projects/[projectId]/generate-outline/route.ts`

- [ ] **步骤 1：替换 chapter generate 路由中的 model 解析**

将：

```typescript
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
// ...
const { model: languageModel, modelInfo, thinkingConfig } =
  await resolveModelFromRequest(request, body);
```

改为：

```typescript
import { resolveModelForChapterGeneration } from '@/lib/extends/server/resolve-chapter-model';
// ...
const { model: languageModel, modelInfo, thinkingConfig } =
  await resolveModelForChapterGeneration(request, body, chapter);
```

- [ ] **步骤 2：替换 generate-outline 路由**

在读取 `chapter` 之后，同样将 `resolveModelFromRequest` 换为 `resolveModelForChapterGeneration(request, body, chapter)`。

- [ ] **步骤 3：类型检查**

运行：`npx tsc --noEmit`
预期：无 error

- [ ] **步骤 4：Commit**

```bash
git add app/extends/api/teacher/projects/[projectId]/chapters/[chapterId]/generate/route.ts \
        app/extends/api/teacher/projects/[projectId]/generate-outline/route.ts
git commit -m "feat(teacher): use chapter model override in generate API routes"
```

---

### 任务 5：章节模型选择 UI 组件

**文件：**
- 创建：`components/extends/teacher/design-workbench/chapter-model-select-field.tsx`

- [ ] **步骤 1：创建 Popover 选择器**

参考 `components/generation/generation-toolbar.tsx` 中 `ModelSettingsPopover`（约 651–900 行）的 provider 列表 + 模型搜索逻辑，实现精简版：

```typescript
'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import type { ProviderId } from '@/lib/ai/providers';
import { resolveChapterGenerationModelConfig } from '@/lib/extends/teacher/resolve-chapter-model-config';
import type { GenerationProfileOverride } from '@/lib/teacher/generation-profile';
import { cn } from '@/lib/utils';

const INHERIT_VALUE = '__inherit__';

export interface ChapterModelSelectFieldProps {
  readonly generationProfileOverride?: GenerationProfileOverride;
  readonly disabled?: boolean;
  readonly onChange: (override: GenerationProfileOverride | undefined) => void;
}

export function ChapterModelSelectField({
  generationProfileOverride,
  disabled,
  onChange,
}: ChapterModelSelectFieldProps) {
  const { t } = useI18n();
  const providersConfig = useSettingsStore((s) => s.providersConfig);
  const [open, setOpen] = useState(false);

  const hasOverride = Boolean(
    generationProfileOverride?.providerId && generationProfileOverride?.modelId,
  );

  const effective = resolveChapterGenerationModelConfig({
    generationProfileOverride,
  });

  const configuredProviders = useMemo(
    () =>
      Object.entries(providersConfig).filter(
        ([, cfg]) =>
          cfg.models.length > 0 &&
          (cfg.requiresApiKey
            ? cfg.apiKey || cfg.isServerConfigured
            : cfg.isServerConfigured || cfg.baseUrl || cfg.defaultBaseUrl),
      ),
    [providersConfig],
  );

  const effectiveModelName =
    providersConfig[effective.providerId]?.models.find((m) => m.id === effective.modelId)
      ?.name ?? effective.modelId;

  const handleSelect = (providerId: ProviderId, modelId: string) => {
    onChange({
      ...generationProfileOverride,
      providerId,
      modelId,
    });
    setOpen(false);
  };

  const handleInherit = () => {
    const next = { ...generationProfileOverride };
    delete next.providerId;
    delete next.modelId;
    onChange(Object.keys(next).length > 0 ? next : undefined);
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">{t('teacher.design.chapterModel.label')}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-9 w-full justify-between text-sm font-normal"
          >
            <span className="truncate">
              {hasOverride
                ? effectiveModelName
                : t('teacher.design.chapterModel.inheritGlobal')}
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          <button
            type="button"
            className={cn(
              'w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
              !hasOverride && 'bg-muted font-medium',
            )}
            onClick={handleInherit}
          >
            {t('teacher.design.chapterModel.inheritGlobal')}
          </button>
          {configuredProviders.map(([pid, cfg]) => (
            <div key={pid} className="mt-2">
              <p className="px-2 text-[11px] font-medium text-muted-foreground">{cfg.name}</p>
              {cfg.models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  className={cn(
                    'w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
                    hasOverride &&
                      generationProfileOverride?.providerId === pid &&
                      generationProfileOverride?.modelId === model.id &&
                      'bg-muted font-medium',
                  )}
                  onClick={() => handleSelect(pid as ProviderId, model.id)}
                >
                  {model.name}
                </button>
              ))}
            </div>
          ))}
        </PopoverContent>
      </Popover>
      <p className="text-[11px] text-muted-foreground">
        {t('teacher.design.chapterModel.effectiveHint', {
          model: effectiveModelName,
          source: hasOverride
            ? t('teacher.design.chapterModel.sourceChapter')
            : t('teacher.design.chapterModel.sourceGlobal'),
        })}
      </p>
    </div>
  );
}
```

- [ ] **步骤 2：Commit**

```bash
git add components/extends/teacher/design-workbench/chapter-model-select-field.tsx
git commit -m "feat(teacher): add chapter model select field component"
```

---

### 任务 6：嵌入设计工作台章节卡片

**文件：**
- 修改：`components/extends/teacher/design-workbench/chapter-generation-settings-field.tsx`
- 修改：`components/extends/teacher/design-workbench/chapter-list-editor.tsx`
- 修改：`components/extends/teacher/course-project-design-shell.tsx`

- [ ] **步骤 1：ChapterGenerationSettingsField 增加模型 props**

在 props 中增加：

```typescript
  readonly generationProfileOverride?: GenerationProfileOverride;
  readonly onGenerationProfileOverrideChange: (
    override: GenerationProfileOverride | undefined,
  ) => void;
```

在 JSX 中 `GenerationMode` Select 之后渲染：

```tsx
<ChapterModelSelectField
  generationProfileOverride={generationProfileOverride}
  disabled={disabled}
  onChange={onGenerationProfileOverrideChange}
/>
```

- [ ] **步骤 2：chapter-list-editor 传参**

```tsx
<ChapterGenerationSettingsField
  // ...existing props
  generationProfileOverride={chapter.generationProfileOverride}
  onGenerationProfileOverrideChange={(override) =>
    onChapterChange(chapter.id, { generationProfileOverride: override })
  }
/>
```

- [ ] **步骤 3：course-project-design-shell 扩展 updateChapter**

在 `updateChapter` 的 `Pick<>` 类型中加入 `'generationProfileOverride'`。

在 map 逻辑中，当 patch 清除 override 时：

```typescript
if ('generationProfileOverride' in patch && patch.generationProfileOverride === undefined) {
  delete next.generationProfileOverride;
}
```

- [ ] **步骤 4：手动验证**

运行：`pnpm dev`，打开设计工作台 → 展开章节 → 确认模型选择器可见、选择后 PATCH 成功。

- [ ] **步骤 5：Commit**

```bash
git add components/extends/teacher/design-workbench/chapter-generation-settings-field.tsx \
        components/extends/teacher/design-workbench/chapter-list-editor.tsx \
        components/extends/teacher/course-project-design-shell.tsx
git commit -m "feat(teacher): wire chapter model picker into design workbench"
```

---

### 任务 7：章节生成页使用章节模型

**文件：**
- 修改：`components/extends/teacher/chapter-generate-shell.tsx`

- [ ] **步骤 1：缓存章节 override**

在组件 state 中增加：

```typescript
const [chapterModelSource, setChapterModelSource] = useState<
  { generationProfileOverride?: GenerationProfileOverride } | undefined
>();
```

在已有 GET project 的 `useEffect`（约 104–128 行）中，找到 chapter 后设置：

```typescript
setChapterModelSource({
  generationProfileOverride: chapter?.generationProfileOverride,
});
```

需在 project 类型中补充 `generationProfileOverride` 字段。

- [ ] **步骤 2：替换 POST headers 与 thinking config**

将 import：

```typescript
import {
  getTeacherGenerationHeaders,
  withCurrentTeacherThinkingConfig,
} from '@/lib/teacher/client-generation-config';
```

改为：

```typescript
import {
  getTeacherGenerationHeadersForChapter,
} from '@/lib/extends/teacher/resolve-chapter-model-config';
import { withTeacherThinkingConfig } from '@/lib/teacher/client-generation-config';
import { resolveChapterGenerationModelConfig } from '@/lib/extends/teacher/resolve-chapter-model-config';
```

在 `runGeneratePost` 中：

```typescript
headers: getTeacherGenerationHeadersForChapter(chapterModelSource),
body: JSON.stringify(
  withTeacherThinkingConfig(
    body,
    resolveChapterGenerationModelConfig(chapterModelSource).thinkingConfig,
  ),
),
```

- [ ] **步骤 3：将 chapterModelSource 加入 useEffect 依赖**

确保 fetch project 完成后 POST 能读到 override。

- [ ] **步骤 4：Commit**

```bash
git add components/extends/teacher/chapter-generate-shell.tsx
git commit -m "feat(teacher): chapter generate page uses per-chapter model headers"
```

---

### 任务 8：i18n

**文件：**
- 修改：`lib/extends/i18n/locales/zh-CN.json`（及 en、zh-TW、ja、ko、fr）
- 运行 overlay 脚本

- [ ] **步骤 1：在 `teacher.design` 下增加键（zh-CN 示例）**

```json
"chapterModel": {
  "label": "生成模型",
  "inheritGlobal": "继承全局默认",
  "effectiveHint": "当前生效：{{model}}（{{source}}）",
  "sourceGlobal": "全局",
  "sourceChapter": "本章"
}
```

位置：`teacher.design.chapterGeneration` 同级。

- [ ] **步骤 2：补全其他 5 种语言**

- [ ] **步骤 3：生成 overlay 并校验**

运行：

```bash
node scripts/extract-i18n-overlay.mjs
pnpm check:i18n-keys
```

预期：PASS

- [ ] **步骤 4：Commit**

```bash
git add lib/extends/i18n/
git commit -m "i18n(teacher): chapter model selection strings"
```

---

### 任务 9：最终验证

- [ ] **步骤 1：运行相关测试**

```bash
pnpm test tests/extends/teacher/resolve-chapter-model-config.test.ts tests/extends/server/resolve-chapter-model.test.ts
pnpm lint
npx tsc --noEmit
```

预期：全部 PASS / 无 error

- [ ] **步骤 2：端到端冒烟**

1. 全局设置选模型 A
2. 章节 1 继承全局 → 生成 → trace/日志显示模型 A
3. 章节 2 覆盖为模型 B → 生成 → 显示模型 B
4. 刷新页面后章节 2 仍为模型 B

- [ ] **步骤 3：Commit（若有遗漏修复）**

```bash
git commit -m "chore(teacher): chapter model selection verification fixes"
```

---

## 规格自检

| 规格需求 | 对应任务 |
|----------|----------|
| Schema providerId/modelId | 任务 1 |
| 客户端 resolve + headers | 任务 2 |
| 服务端 fallback | 任务 3 |
| generate + generate-outline 路由 | 任务 4 |
| ChapterModelSelectField UI | 任务 5–6 |
| chapter-generate-shell | 任务 7 |
| i18n | 任务 8 |
| 测试 | 任务 2–3、9 |
| updateChapter 支持 override | 任务 6 |

无占位符；类型名在各任务间一致（`GenerationProfileOverride`、`resolveModelForChapterGeneration`）。
