# 教师课程中断恢复与聊天记录持久化

**日期**：2026-05-15  
**状态**：待实现审批  
**关联**：`2026-05-14-teacher-course-platform-design.md`（教师平台总规格）

## 问题陈述

教师在课程设计中途关闭浏览器后，无法找到「做到一半」的课程入口；设计工作台右侧 **AI 对话记录** 仅存于 React 内存，刷新即丢失。

服务端已将 `CourseProject` 写入 `data/teacher-projects/{id}.json`，且 **PATCH 已支持** `designWorkbenchChat` 字段（见 `lib/teacher/design-chat-validation.ts`、`app/api/teacher/projects/[projectId]/route.ts`），但：

1. **无列表/继续入口**：`GET /api/teacher/projects` 存在，前端无 `/teacher/projects` 页面，首页教师路径主要进入 `/teacher/new`。
2. **聊天未接线**：`CourseProjectDesignShell` 使用 `useState(messages)`，未从 `initialProject.designWorkbenchChat` 恢复，也未在对话变更时 PATCH。

## 目标与成功标准

| 目标 | 成功标准 |
|------|----------|
| 可发现未完成课程 | 教师从固定入口看到按 `updatedAt` 降序的项目列表（标题、状态、最近更新时间） |
| 一键继续 | 「继续」跳转到与项目状态匹配的页面（设计 / 生成 / Studio） |
| **聊天记录可恢复** | 关闭浏览器后重新打开同一项目的 **design** 页，右侧对话与工具事件气泡与关闭前一致（在服务端已保存的范围内） |
| 与现有存储一致 | 不引入新数据库；继续复用 `CourseProject` JSON 与原子写盘 |

**非目标（本期不做）**

- 多教师账号隔离与权限（沿用当前单机/单租户文件存储假设）
- 生成页 `/generate` 内进度面板的独立聊天（该页无 design chat）
- 跨设备实时同步（无 WebSocket；以服务端 JSON 为准）

## 已选方案

**A + B（列表页 + 首页最近课程）+ 内嵌 `designWorkbenchChat`（不拆文件）**

- **项目列表页** `/teacher/projects`：主入口，展示全部可恢复项目。
- **首页教师区「最近课程」**：展示最近 3～5 条 +「查看全部」链到列表页（与学生「最近课堂」模式对齐）。
- **聊天**：写入已有 `CourseProject.designWorkbenchChat`，通过现有 PATCH 持久化。

不推荐仅 `localStorage` 记 `lastProjectId`（换设备/清缓存失效）。

## 数据模型（已有，实现需接线）

```ts
// lib/teacher/design-chat-types.ts
interface CourseProjectDesignWorkbenchChat {
  messages: CourseProjectChatMessage[];
  updatedAt: string; // ISO；服务端 PATCH 时覆盖
}
```

校验上限（已实现，实现须遵守）：

- 最多 **250** 条消息
- `content` / `reasoning` 单字段最长 **120_000** 字符
- `toolEvents` 种类与 `ToolEventKind` 一致

## 聊天记录持久化行为

### 写入时机

在 `CourseProjectDesignShell` 中，与左侧表单 PATCH 类似，对聊天使用 **防抖 PATCH**（建议与表单共用 `PATCH_DEBOUNCE_MS`，或略长如 800ms）：

1. **用户发送消息后**（assistant 占位消息已创建）
2. **流式回复结束**（`finalizeAssistantMessage`）
3. **取消流式**（`cancelled: true`）
4. **工具事件追加到 assistant 消息时**（`recordToolEventOnAssistant`）
5. **重试/截断对话后**（`onRetry` / regenerate 改变 messages 时）

**流式过程中**：不对每个 token PATCH；仅在上述节点 + 防抖批量写入，避免磁盘与 API 压力。

### PATCH 载荷

扩展现有 `flushPatch`（或并行 `flushChatPatch`，最终合并为一次 PATCH 更优）：

```json
{
  "overview": "...",
  "chapters": [...],
  "designWorkbenchChat": { "messages": [...] }
}
```

`updatedAt` 由服务端 `parseDesignWorkbenchChatFromPatchBody` 生成，客户端不传。

### 恢复（hydrate）

- `app/teacher/projects/[projectId]/design/page.tsx` 已通过 `readTeacherProject` 传入 `initialProject`。
- `CourseProjectDesignShell` 初始化时：若 `initialProject.designWorkbenchChat?.messages.length > 0`，用其初始化 `messages` / `messagesRef`，并跳过「空对话自动 bootstrap」逻辑（与现有 `messagesRef.current.length > 0` 守卫一致）。
- `/teacher/new`（无 `initialProject`）：在 **首次 `createTeacherProject` 成功** 后，若内存中已有 messages，立即 PATCH `designWorkbenchChat`（避免仅依赖 URL 带 id 才存聊天）。

### 与表单 PATCH 的合并策略（推荐）

**单次 PATCH 同时携带** `overview`、`chapters`、`designWorkbenchChat`（当 chat 脏时），减少竞态与 `updatedAt` 分叉。实现方式：

- `designStateRef` + `messagesRef` 双脏标记，或统一 `flushProjectPatch()` 读取两者快照。
- `schedulePatch()` 在表单或聊天变更时均触发同一 flush。

### 失败与离线

- PATCH 失败：沿用现有 `persistenceStatus: 'error'`，i18n 提示；聊天仍保留在内存，用户可重试保存。
- 关闭页面前：可选 `beforeunload` 同步 `flushPatch`（`sendBeacon` 非必须；MVP 以最后一次防抖成功为准）。

## 继续入口与路由解析

新增 `lib/teacher/resolve-resume-path.ts`（名称可调整）：

| `status` | 目标路径 |
|----------|----------|
| `draft`, `outlining` | `buildTeacherDesignPath(id)` |
| `generating` | `buildTeacherGeneratePath(id)` |
| `editing` | `buildTeacherStudioPath(id)` |
| `published` | `buildTeacherStudioPath(id)`（编辑已发布课件；预览可走 `publishedClassroomId` 二级操作） |

读取时 `outline-ready` 已折叠为 `draft`（`migrateForRead`），列表展示标签使用折叠后状态。

新增路由：

- `app/teacher/projects/page.tsx` — 服务端或客户端拉取 `listTeacherProjects` / `GET /api/teacher/projects`，渲染 `TeacherProjectList` 组件。

新增客户端：

- `listTeacherProjects()` in `lib/teacher/teacher-projects-client.ts`
- `buildTeacherProjectsPath()` in `lib/teacher/routes.ts` → `/teacher/projects`

## UI 规格

### 项目列表页 `/teacher/projects`

- 顶栏：标题、返回首页、**新建课程** → `/teacher/new`
- 列表项：课程标题（无则 fallback i18n）、状态徽章、`updatedAt` 相对时间
- 主操作：**继续** → `resolveResumePath(project)`
- 次操作（可选 MVP）：**设计**（始终进 design，便于只看大纲/聊天）
- 空状态：引导去 `/teacher/new`

### 首页教师身份

- 在教师输入区下方增加「最近课程」折叠块（与 `recentClassrooms` 类似），`GET /api/teacher/projects` 取前 5 条
- 链接：「查看全部」→ `/teacher/projects`

### 设计页

- 已有 `persistenceStatus` 可扩展文案：保存中同时覆盖表单与对话（或统一为「正在保存…」）

## i18n

在 `teacher.projects`（或 `teacher.resume`）命名空间下新增键，**6 个 locale 对齐**，包括但不限于：

- 列表标题、空状态、继续按钮、状态标签（draft / generating / editing / published）
- 首页「最近课程」「查看全部」

运行 `pnpm check:i18n-keys`。

## API（无破坏性变更）

- `GET /api/teacher/projects` — 已存在，列表页使用
- `PATCH /api/teacher/projects/:id` — 已支持 `designWorkbenchChat`，设计页接线即可

可选增强（非阻塞 MVP）：

- `GET` 单项目响应已含 `designWorkbenchChat`（确认 `readTeacherProject` 返回该字段 — 已通过 `migrateForRead`）

## 测试策略

| 层级 | 内容 |
|------|------|
| 单元 | `resolve-resume-path` 对各 status 的路径；`normalizeDesignWorkbenchChatFromStorage` 边界（已有则补） |
| API | PATCH 带 `designWorkbenchChat` 往返；超 250 条截断 |
| 组件/集成 | design shell：hydrate messages；mock PATCH 在 finalize 后调用 |
| E2E | 创建项目 → 发一条聊天 → PATCH 落盘 → 刷新 design 页 → 消息仍在；列表页可见项目并继续 |

## 实现顺序建议

1. `resolve-resume-path` + `listTeacherProjects` + `/teacher/projects` 页面（先解决「找不到入口」）
2. 设计页 **hydrate + PATCH 聊天**（满足「必须含聊天记录」）
3. 首页最近课程区块
4. i18n + E2E

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| JSON 体积过大 | 服务端校验上限；列表 API 可不返回 `designWorkbenchChat`（**列表 DTO 省略 chat 字段**，仅详情/ design 页加载全文） |
| PATCH 竞态 | 合并为单次 PATCH 快照 |
| `/teacher/new` 未创建 id 时丢聊天 | 首次 create 后立即 PATCH chat |

## 审批

- [ ] 产品：列表 + 首页最近课程 + 继续路由表
- [ ] 工程：聊天与表单合并 PATCH、列表不返回完整 chat 正文

批准后使用 **writing-plans** 生成 `docs/superpowers/plans/2026-05-15-teacher-project-resume.md` 并开始实现。
