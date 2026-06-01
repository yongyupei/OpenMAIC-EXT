# Teacher preview resume / gate / soft regenerate 实现计划

> **面向 AI 代理：** 推荐按任务提交；步骤可用 `- [ ]` 勾选。

**目标：** 教师预览生成页支持本地草稿恢复、已发布课堂提示、软重新生成；进入时非「全新」则显示门控而非自动开跑。

**架构：** `sessionStorage` 绑定 `(projectId, chapterKey) → draft stageId` + IndexedDB（现有 `saveToStorage`/`loadFromStorage`）；`deleteStageWithRelatedData` 清草稿；`GET /api/classroom` 探测已发布。

**技术栈：** Next.js、Zustand、`lib/utils/database.ts`、`sessionStorage`、Vitest。

---

### 任务 1：绑定与纯函数

**文件：**
- 新建 `lib/teacher/preview-binding.ts`
- 新建 `lib/teacher/preview-resume-helpers.ts`
- 新建 `tests/teacher/preview-resume-helpers.test.ts`

- [ ] 实现 `teacherPreviewBindingKey`、`readTeacherPreviewBinding`、`writeTeacherPreviewBinding`、`clearTeacherPreviewBinding`、`updateTeacherPreviewGenParams`（`genParams` 含 `languageDirective`、`agents?`、`userProfile?`）。
- [ ] 实现 `hasIncompleteOutlines(outlines, scenes)`、`localDraftLooksResumable(outlines, scenes, generationStatus)`。
- [ ] Vitest 覆盖边界（空大纲、全完成、paused）。

---

### 任务 2：门控 UI 组件

**文件：**
- 新建 `components/teacher/teacher-preview-gate.tsx`（`props`: entry、callbacks、project title）

- [ ] 按钮：继续生成、软重新生成（AlertDialog 确认）、进入 Studio（若已发布）、次要返回设计台。

---

### 任务 3：`TeacherPreviewShell` 编排

**文件：**
- 修改 `components/teacher/teacher-preview-shell.tsx`

- [ ] 挂载时 `hydrating`：`loadFromStorage(binding.stageId)` + 可选 `fetch` 已发布课堂；**不再**用 `publishedClassroomId` 作为草稿 `stage.id`（始终 `nanoid` 或绑定内 `stageId`）。
- [ ] `fresh` 自动跑现有流水线；写入/更新 binding 与 `genParams`；关键节点 `await saveToStorage()`。
- [ ] `resume`：`Continue` → `generateRemaining` + publish + 跳转。
- [ ] 软重生成：`deleteStageWithRelatedData` + `clearBinding` + `clearStore`/重置 → 重新 `nanoid` 与全流程。
- [ ] 错误态保留「重试」；与门控不冲突。

---

### 任务 4：i18n

**文件：** `lib/i18n/locales/*.json`（6 个）

- [ ] 新增 `teacher.preview.gate*`、`teacher.preview.softRegenerateConfirm*` 等键；运行 `pnpm check:i18n-keys`。

---

### 任务 5：验证

- [ ] `npx tsc --noEmit`、`pnpm test tests/teacher/preview-resume-helpers.test.ts`
