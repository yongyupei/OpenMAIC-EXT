# Studio 右侧面板重构 + 章节切换修复 设计规格

**日期：** 2026-05-16  
**状态：** 待审查  
**涉及文件：**
- `components/teacher/course-studio-shell.tsx`
- `components/teacher/teacher-assist-panel.tsx`
- `components/teacher/teacher-run-status-panel.tsx`
- `components/course-editor/course-editor-shell.tsx`
- `lib/store/settings.ts`（新增持久化字段）

---

## 背景与问题描述

Studio 页面（`/teacher/projects/[projectId]/studio`）当前存在三个问题：

1. **运行状态位置不合理：** `TeacherRunStatusPanel` 作为独立的第三列 aside（`w-80`）渲染在 AI 辅助列右侧，视觉噪声大、占用宽度多。
2. **AI 辅助列不可收起：** 固定 `w-96`，教师在专注编辑时无法获得更多画布空间。
3. **AI 辅助面板交互陈旧：** 表单式 UI（选范围 → 填指令 → 显示单次结果），不保留对话历史，风格与课程设计助手脱节。
4. **章节切换失效：** 点击左侧章节 tab 无法切换到对应章节的课件场景。根因：`handleSelectChapterFromNav` 使用 `chapterNav.sceneIdsByChapterId[chapterId][0]` 调用 `setCurrentSceneId`，但该 scene ID 来自 `project.artifacts[i].sceneId`，可能因课件重生成或本地缓存导致与 Store 中实际加载的 `scene.id` 不匹配，最终 `currentScene` 回落到 `scenes[0]`，视觉无变化。

---

## 目标布局（实现后）

```
┌───────────────────────────────────┬──────────────────────────────┐
│  CourseEditorShell                │  ▼ [折叠按钮]                │
│  ┌────────┬──────────────┬──────┐ │  ─────────────────────────── │
│  │章节/  │  画布区域    │ 编辑 │ │  [运行状态卡片（仅run存在时）]│
│  │场景   │  (CanvasArea) │ 聊天 │ │  ─────────────────────────── │
│  │列表   │              │ 区   │ │  AI 辅助面板（聊天式）        │
│  └────────┴──────────────┴──────┘ │  - 对话历史气泡               │
│                                    │  - 底部输入框 + 发送           │
└───────────────────────────────────┴──────────────────────────────┘
                                       ← 可收起为 w-10 窄条 →
```

---

## 变更 1：运行状态移入 AI 辅助列

### 实现方式

在 `course-studio-shell.tsx` 中，将 `<TeacherRunStatusPanel run={project.run} />` 从外层 flex 行移除，改为渲染在右侧 `<aside>` 内部的最顶端：

```tsx
// 变更前
<div className="flex h-screen min-h-0 overflow-hidden">
  <div className="min-w-0 flex-1">...</div>
  <aside className="w-96 ...">
    <TeacherAssistPanel {...assistPanelProps} />
    ...
  </aside>
  <TeacherRunStatusPanel run={project.run} />   {/* 第三列 */}
</div>

// 变更后
<div className="flex h-screen min-h-0 overflow-hidden">
  <div className="min-w-0 flex-1">...</div>
  <aside className={assistCollapsed ? "w-10 ..." : "w-96 ..."}>
    <RunStatusCompact run={project.run} />       {/* 顶部紧凑卡片 */}
    <TeacherAssistChatPanel {...props} />         {/* 聊天式面板 */}
  </aside>
</div>
```

`TeacherRunStatusPanel` 的渲染逻辑提取为 aside 顶部的紧凑内联区块（步骤文字 + 进度条，无独立 aside 边框）。`TeacherRunStatusPanel` 组件本身保留不变，aside 内复用其核心展示逻辑或直接 inline 该组件并通过 className 覆盖样式。

---

## 变更 2：AI 辅助列可收起（持久化）

### 状态管理

在 `lib/store/settings.ts` 新增两个字段（与 `chatAreaCollapsed` 同模式）：

```typescript
assistPanelCollapsed: boolean;       // 默认 false（展开）
setAssistPanelCollapsed: (v: boolean) => void;
```

使用 Zustand `persist` 存储（已有的 localStorage 持久化层），key 与现有设置共享，无需新建 store。

### UI 行为

| 状态 | aside 宽度 | 内容 |
|------|-----------|------|
| 展开 | `w-96` | 运行状态 + AI 辅助聊天面板 |
| 收起 | `w-10` | 竖排「AI 辅助」文字 + 展开图标 |

- 切换动画：`transition-[width] duration-200 ease-in-out`
- 收起时 aside 内容 `overflow-hidden`，文字使用 `writing-mode: vertical-rl` 旋转
- 折叠按钮：位于 aside 顶部，使用 `ChevronLeft` / `ChevronRight` 图标

---

## 变更 3：AI 辅助面板 → 聊天式重构

### 组件重命名

`TeacherAssistPanel` → `TeacherAssistChatPanel`（同文件内或新文件）

### 新交互模型

```
┌──────────────────────────────────┐
│ 紫色眉标 + 标题（获取教学建议）  │
│ Scope 选择器（outline/chapter/.. │
├──────────────────────────────────┤
│ 消息历史（滚动区，flex-1）       │
│  ┌──────────────────────────┐   │
│  │ 👤 你：请优化第2页的标题  │   │
│  └──────────────────────────┘   │
│  ┌──────────────────────────┐   │
│  │ 🤖 建议：...             │   │
│  │   [应用] 按钮            │   │
│  └──────────────────────────┘   │
│  ┌──────────────────────────┐   │
│  │ 👤 ...                   │   │
│  └──────────────────────────┘   │
├──────────────────────────────────┤
│ Textarea + [发送] 按钮（底部固定）│
└──────────────────────────────────┘
```

### 数据结构

```typescript
interface AssistMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  scope: TeacherAssistScope;
  status?: 'loading' | 'error';
  timestamp: number;
}
```

消息历史保存在组件 `useState`（非持久化，刷新后清空，与现有行为一致）。

### 视觉风格（参考课程设计助手）

- 面板背景：`bg-white/85 backdrop-blur dark:bg-slate-900/85`（与 `CourseStudioUnavailable` 卡片同款）
- 头部：紫色眉标 `text-purple-600` + 加粗标题，与 `teacher-assist-panel.tsx` 现有头部一致，但字号缩小适配
- 用户气泡：`bg-purple-50 text-slate-800 rounded-xl px-3 py-2`（右对齐）
- AI 气泡：`bg-slate-50 border rounded-xl px-3 py-2`（左对齐）+ 「应用」按钮内联
- 加载状态：AI 气泡内显示动态省略号（`animate-pulse`）
- 错误状态：AI 气泡内红色提示 + 重试按钮

### 接口变化

`onApplySuggestion` 回调签名不变（`(suggestion: string, scope: TeacherAssistScope) => void`），调用时机改为每条 AI 消息上的「应用」按钮点击。`context` prop 语义不变（当 context 变化时 resetSuggestionState 的逻辑保留，对所有未完成的 loading 请求取消）。

---

## 变更 4：章节切换修复

### 根因

`handleSelectChapterFromNav` 在 `course-editor-shell.tsx` 中：

```typescript
const ids = chapterNav.sceneIdsByChapterId[chapterId];
const first = ids?.[0];
if (first) setCurrentSceneId(first);
```

`ids` 来自 `buildCourseEditorChapterNavFromProject → getSceneIdsForChapterInOrder`，使用 `artifact.sceneId` 构建。当 `artifact.sceneId` 与 Store 中 `scene.id` 不匹配时，`first` 存在但不在 scenes 中，`currentScene` 回落 `scenes[0]`，切换无效。

### 修复策略

**防御性存在校验 + 有效 ID 过滤：**

```typescript
const handleSelectChapterFromNav = useCallback(
  (chapterId: string) => {
    if (!chapterNav) return;
    const ids = chapterNav.sceneIdsByChapterId[chapterId] ?? [];
    // 只取 Store 中实际存在的 scene IDs
    const validIds = ids.filter((id) => scenes.some((s) => s.id === id));
    const targetId = validIds[0];
    if (targetId) {
      setCurrentSceneId(targetId);
      return;
    }
    // Fallback：按章节在 outline 中的顺序估算 sortedScenes 中的位置
    const chapterIndex = chapterNav.chapters.findIndex((c) => c.id === chapterId);
    if (chapterIndex < 0) return;
    const scenesPerChapter = Math.ceil(sortedScenes.length / chapterNav.chapters.length);
    const estimatedIdx = chapterIndex * scenesPerChapter;
    const fallbackScene = sortedScenes[Math.min(estimatedIdx, sortedScenes.length - 1)];
    if (fallbackScene) setCurrentSceneId(fallbackScene.id);
  },
  [chapterNav, scenes, sortedScenes, setCurrentSceneId],
);
```

**`activeChapterIdForNav` 无需改动：** fallback 路径成功后，`currentSceneId` 已设置为真实存在于 Store 的 scene ID。现有 `activeChapterIdForNav` 逻辑（遍历 `sceneIdsByChapterId` 判断归属）若找不到匹配章节，会回落到 `chapters[0]`——属于可接受的降级，无需额外 state。

**Fallback 降级显示：** 若主路径和 fallback 均无法定位有效 scene，不显示 toast（避免干扰），仅保持当前 scene 不变（`handleSelectChapterFromNav` 提前 return）。

---

## 不在本次范围内

- 不修改 `/api/teacher/assist` 接口（复用现有接口）
- 不改动 `CourseProjectChat`（设计助手组件）
- 不修改 generation pipeline 或 scene ID 的生成逻辑
- 不引入流式响应（保留 JSON 响应，与现有 API 一致）
- 不做无关重构

---

## 测试要点

1. 运行状态卡片：`project.run` 为 null 时不显示；非 null 时显示在 AI 辅助列顶部
2. 收起/展开：刷新后状态持久化；动画平滑；收起时 aside 仍占位不影响布局
3. 聊天面板：多轮对话正确追加；加载中状态正确；应用按钮触发回调；context 变化时 loading 请求正确取消
4. 章节切换：有效 scene ID 存在时正确切换；ID 不匹配时 fallback 切换到估算场景；无任何场景时显示 toast
