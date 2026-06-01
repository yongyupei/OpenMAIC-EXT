# 课程结构区域重构 — 场景选择下拉框与 AI 重设计

**日期：** 2026-05-18
**状态：** 已批准
**方案决策：** B — 弹出对话框输入 AI 重设计指令

---

## 背景

章节 Studio 页面左侧面板（`SceneListEditor`）的顶部区域当前仅有一个「添加测验」按钮，只能创建 `quiz` 类型场景，无法快速添加其他类型（slide / interactive / pbl）。同时，左侧场景列表项的操作按钮区域（↑ ↓ ⎘ 🗑）缺少对已有场景进行 AI 重新设计的能力。

教师需要：
1. **按需选择场景类型**：通过下拉框选择要添加的场景类型，而非只能添加测验
2. **AI 重新设计单个场景**：对已有场景输入重新设计方向，触发 AI 重新生成内容并覆盖原场景

---

## 目标

| 能力 | 说明 |
|------|------|
| 场景类型下拉框 | 顶部区域左侧为 `SceneType` 下拉框（slide / quiz / interactive / pbl），右侧为添加按钮 |
| 记忆上次选择 | 下拉框默认选中上次使用的场景类型，通过 localStorage 持久化 |
| AI 重设计按钮 | 场景列表项操作区域新增「✦ AI重设计」按钮 |
| 重设计对话框 | 点击按钮弹出 Dialog，包含场景信息、重新设计方向文本框、参考资料上传区域 |
| 生成并覆盖 | 复用现有 `scene-content` + `scene-actions` API，生成完成后 `updateScene` 覆盖原场景 |
| 加载与取消 | 生成过程中显示进度状态，支持 AbortController 取消 |

## 非目标

- 批量多场景重设计
- 重设计历史版本管理 / 回滚
- 参考资料 OCR 解析（仅传递引用）
- 场景类型显示改为彩色徽章（顺带优化，非核心需求）

---

## 设计详情

### 1. 顶部添加场景区域重构

**当前：** 单一「+ 添加测验」按钮（`Button` + `Plus` 图标），硬编码 `createQuizScene()`。

**改为：** 一行两组件：

```
┌─────────────────────────┐ ┌──────────┐
│ 📊 测验 Quiz          ▼ │ │ ＋ 添加   │
└─────────────────────────┘ └──────────┘
```

- **下拉框**：`<Select>` 组件，选项从 `SceneType` 枚举动态生成
  - 选项文本格式：`{emoji} {中文名} {英文名}`，例如 `📊 测验 Quiz`
  - emoji / 中文名通过 i18n key `courseEditor.sceneTypeLabel.{type}` 映射
  - 默认选中 `localStorage.getItem('lastSelectedSceneType')`，回退到 `'quiz'`
  - 选择后写入 `localStorage.setItem('lastSelectedSceneType', type)`
- **添加按钮**：点击后根据下拉框当前选中的类型调用对应的 `createXxxScene()` 工厂函数
  - `slide` → `createSlideScene()`
  - `quiz` → `createQuizScene()`（已有）
  - `interactive` → `createInteractiveScene()`
  - `pbl` → `createPblScene()`

**新增工厂函数**（位于 `scene-list-editor.tsx` 或抽取到 `lib/course-editor/scene-factories.ts`）：

```typescript
function createSlideScene(stageId: string, order: number, title: string): Scene {
  return {
    id: createId('scene'),
    stageId,
    type: 'slide',
    title,
    order,
    content: { type: 'slide', canvas: { slides: [] } },
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
    content: {
      type: 'pbl',
      projectConfig: { projectTopic: title, projectDescription: '', targetSkills: [], issueCount: 3 },
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
```

默认标题使用 i18n key `courseEditor.defaultSceneTitle.{type}`，参数 `{{n}}` 为序号。

### 2. 场景列表项 — AI 重设计按钮

在现有操作按钮区域（↑ ↓ ⎘ 之后、🗑 之前）新增：

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

- 图标：`Sparkles`（lucide-react），紫色主题
- `redesigningSceneId` 来自 `useSceneRedesign` hook，生成中时按钮禁用
- 点击调用 `setRedesignTarget(scene)` 打开重设计对话框

### 3. AI 重设计对话框

**新组件**：`components/course-editor/scene-redesign-dialog.tsx`

**结构：**

```
┌─────────────────────────────────────────────┐
│  ✦ AI 重新设计场景                           │
│  场景：第一章：课程介绍 · [幻灯片]             │
│                                              │
│  重新设计方向                                 │
│  ┌────────────────────────────────────────┐  │
│  │ 描述你希望如何改变这个场景的内容、     │  │
│  │ 风格或结构…                            │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  参考资料（可选）                              │
│  [📄 上传文档]  [🔗 添加链接]                  │
│                                              │
│  ─────────────────────────────────────────── │
│                          [取消]  [✦ 开始重设计] │
└─────────────────────────────────────────────┘
```

**状态流转：**

1. **初始态**：文本框空白，参考资料为空
2. **生成中**：按钮禁用，显示进度指示（步骤 1/2：生成场景内容 → 步骤 2/2：生成场景动作），支持取消
3. **成功**：自动关闭对话框，场景内容已更新
4. **失败**：显示错误信息，提供重试按钮

**参考资料（MVP 简化方案）：**
- 上传文档：暂为占位按钮，显示 "coming soon" 提示
- 添加链接：文本输入框，输入 URL 后以 tag 形式显示，传递给生成 API 的 `stageInfo` 字段

### 4. 生成流程（`useSceneRedesign` Hook）

**新 Hook**：`lib/hooks/use-scene-redesign.ts`

**核心逻辑：**

```typescript
export function useSceneRedesign() {
  const updateScene = useStageStore.use.updateScene();
  const scenes = useStageStore.use.scenes();
  const outlines = useStageStore.use.outlines();
  const stage = useStageStore.use.stage();

  const [redesignTarget, setRedesignTarget] = useState<Scene | null>(null);
  const [isRedesigning, setIsRedesigning] = useState(false);
  const [redesignStep, setRedesignStep] = useState<'content' | 'actions' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startRedesign = useCallback(async (direction: string, referenceLinks?: string[]) => {
    if (!redesignTarget || !stage) return;

    setIsRedesigning(true);
    setError(null);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    try {
      // 1. 从当前 scene 反推 SceneOutline
      const outline = sceneToOutline(redesignTarget);
      // 2. 将用户方向和参考资料注入到 outline.description
      let enhancedDescription = outline.description;
      if (direction) {
        enhancedDescription += `\n\n[重新设计方向]: ${direction}`;
      }
      if (referenceLinks && referenceLinks.length > 0) {
        enhancedDescription += `\n\n[参考资料]: ${referenceLinks.join(', ')}`;
      }
      const enhancedOutline = {
        ...outline,
        description: enhancedDescription,
      };

      // 3. Step 1: 生成场景内容
      setRedesignStep('content');
      const contentResult = await fetchSceneContent({
        outline: enhancedOutline,
        allOutlines: outlines,
        stageId: stage.id,
        stageInfo: { name: stage.name, description: stage.description },
      }, signal);

      // 4. Step 2: 生成场景动作
      setRedesignStep('actions');
      const actionsResult = await fetchSceneActions({
        outline: contentResult.effectiveOutline || enhancedOutline,
        allOutlines: outlines,
        content: contentResult.content,
        stageId: stage.id,
      }, signal);

      // 5. 构建完整场景并覆盖
      const newScene = buildCompleteScene(
        enhancedOutline,
        contentResult.content,
        actionsResult.scene.actions,
        stage.id,
      );
      // 保留原 scene 的 id 和 order
      updateScene(redesignTarget.id, {
        content: newScene.content,
        actions: newScene.actions,
        updatedAt: Date.now(),
      });

      setRedesignTarget(null); // 关闭对话框
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setIsRedesigning(false);
      setRedesignStep(null);
    }
  }, [redesignTarget, stage, outlines, updateScene]);

  const cancelRedesign = useCallback(() => {
    abortRef.current?.abort();
    setIsRedesigning(false);
    setRedesignStep(null);
  }, []);

  return {
    redesignTarget,
    setRedesignTarget,
    isRedesigning,
    redesigningSceneId: isRedesigning ? redesignTarget?.id ?? null : null,
    redesignStep,
    error,
    startRedesign,
    cancelRedesign,
  };
}
```

**`sceneToOutline` 辅助函数**：从 `Scene` 反推 `SceneOutline`

```typescript
function sceneToOutline(scene: Scene): SceneOutline {
  return {
    id: scene.id,
    type: scene.type,
    title: scene.title,
    description: '',
    keyPoints: [],
    order: scene.order,
    // 根据类型填充类型特定配置
    ...(scene.type === 'quiz' ? { quizConfig: { questionCount: 1, difficulty: 'medium' as const, questionTypes: ['single' as const] } } : {}),
    ...(scene.type === 'pbl' ? { pblConfig: { projectTopic: scene.title, projectDescription: '', targetSkills: [] } } : {}),
  };
}
```

**不新增 API 路由**：直接复用现有 `/api/generate/scene-content` 和 `/api/generate/scene-actions`，前端通过 `fetchSceneContent` / `fetchSceneActions` 调用（与 `useSceneGenerator` 共享同一套工具函数）。

---

## 变更范围

| 类型 | 文件路径 | 变更内容 |
|------|---------|---------|
| 新增 | `components/course-editor/scene-redesign-dialog.tsx` | AI 重设计对话框组件 |
| 新增 | `lib/hooks/use-scene-redesign.ts` | 重设计逻辑 Hook（状态管理 + 生成流程） |
| 新增 | `lib/hooks/scene-fetch-helpers.ts` | 从 `use-scene-generator.ts` 抽取 `fetchSceneContent` / `fetchSceneActions` 为共享函数 |
| 修改 | `lib/hooks/use-scene-generator.ts` | 改为从 `scene-fetch-helpers.ts` import，删除本地私有定义 |
| 修改 | `components/course-editor/scene-list-editor.tsx` | ① 顶部改为下拉框 + 添加按钮；② 场景项加 AI重设计按钮；③ 引入 Dialog |
| 修改 | `lib/i18n/locales/zh-CN.json` | 新增 i18n key |
| 修改 | `lib/i18n/locales/en.json` | 新增 i18n key |

### 不变的文件

- 现有 API 路由（`/api/generate/scene-content`、`/api/generate/scene-actions`）——复用不修改
- Zustand store（`lib/store/stage.ts`）——使用现有 `updateScene` action
- 生成管线核心逻辑（`lib/generation/scene-generator.ts`、`scene-builder.ts`）
- 其他页面和组件

---

## i18n Key 列表

| Key | zh-CN | en |
|-----|-------|-----|
| `courseEditor.sceneTypeLabel.slide` | 幻灯片 Slide | Slide |
| `courseEditor.sceneTypeLabel.quiz` | 测验 Quiz | Quiz |
| `courseEditor.sceneTypeLabel.interactive` | 交互 Interactive | Interactive |
| `courseEditor.sceneTypeLabel.pbl` | PBL项目 PBL | PBL Project |
| `courseEditor.addScene` | 添加 | Add |
| `courseEditor.defaultSceneTitle.slide` | 幻灯片 {{n}} | Slide {{n}} |
| `courseEditor.defaultSceneTitle.interactive` | 交互 {{n}} | Interactive {{n}} |
| `courseEditor.defaultSceneTitle.pbl` | PBL项目 {{n}} | PBL Project {{n}} |
| `courseEditor.redesignScene` | AI重设计 | AI Redesign |
| `courseEditor.redesignTitle` | AI 重新设计场景 | AI Redesign Scene |
| `courseEditor.redesignDirection` | 重新设计方向 | Redesign Direction |
| `courseEditor.redesignDirectionPlaceholder` | 描述你希望如何改变这个场景的内容、风格或结构… | Describe how you want to change the content, style, or structure of this scene… |
| `courseEditor.redesignReferences` | 参考资料（可选） | References (optional) |
| `courseEditor.redesignUploadDoc` | 上传文档 | Upload Document |
| `courseEditor.redesignAddLink` | 添加链接 | Add Link |
| `courseEditor.redesignStart` | 开始重设计 | Start Redesign |
| `courseEditor.redesignCancel` | 取消 | Cancel |
| `courseEditor.redesignCancelGeneration` | 取消生成 | Cancel Generation |
| `courseEditor.redesignGenerating` | 正在生成内容… | Generating content… |
| `courseEditor.redesignStepContent` | 步骤 1/2：生成场景内容 | Step 1/2: Generating scene content |
| `courseEditor.redesignStepActions` | 步骤 2/2：生成场景动作 | Step 2/2: Generating scene actions |
| `courseEditor.redesignError` | 生成失败 | Generation failed |
| `courseEditor.redesignRetry` | 重试 | Retry |
| `courseEditor.redesignComingSoon` | 即将支持 | Coming soon |

---

## 依赖关系

- `fetchSceneContent` 和 `fetchSceneActions` 当前为 `use-scene-generator.ts` 的模块内私有函数。实现时需将其抽取到 `lib/hooks/scene-fetch-helpers.ts` 并由两个 hook 共同 import
- `buildCompleteScene` 来自 `lib/generation/scene-builder.ts`（已 export）
- `SceneOutline` 类型来自 `lib/types/generation.ts`
- Dialog 组件使用 `@/components/ui/dialog`（shadcn，已有）
- Select 组件使用 `@/components/ui/select`（shadcn，已有）
- 图标：`Sparkles` 来自 `lucide-react`
