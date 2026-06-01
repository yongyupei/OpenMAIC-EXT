# 教师课程设计平台改造方案

## 背景

OpenMAIC 当前已经具备从用户需求生成互动课堂的 AI 教学模型：用户在首页输入课程需求，系统生成场景大纲，再生成 slide、quiz、interactive、PBL 等场景内容，最终进入课堂页面播放、编辑和导出。

本方案的目标是在保留现有学生侧 AI 智能教学体验的前提下，新增适合教师和课程制作人员使用的课程设计平台。教师侧不再把“输入需求后直接生成课堂”作为唯一流程，而是拆成可审阅、可编辑、可重新生成、可人工介入的课程制作 pipeline。

## 已选择方案

采用 A 方案：渐进式教师课程设计平台 MVP。

核心原则：

- 保留学生身份的现有功能和工作量，尽量不改动当前 `首页 -> generation-preview -> classroom` 主链路。
- 新增教师身份和教师制作壳层，先实现可演示闭环。
- 复用现有生成内核，包括 `scene-outlines-stream`、`scene-content`、`scene-actions`、`CourseEditorShell`、`SlideEditor`、`QuizEditor`、PPTX/课堂包导出。
- 先做轻量监控和人工介入，后续再升级为完整 workflow 状态机和运营控制台。

## 目标用户与身份入口

首页改造为身份选择入口：

- 学生身份：保留现有课程生成和课堂体验。
- 教师身份：进入教师课程制作向导。

学生路径继续使用当前首页中的生成逻辑。教师路径进入新的教师端路由，从课程需求、工作流模板和大纲审阅开始制作课程。

## 教师端核心流程

教师主流程为：

1. 选择教师身份。
2. 输入课程需求，包括主题、目标对象、课时、章节数、教学目标和约束。
3. 选择工作流模板。MVP 内置“标准课程制作”模板。
4. 生成课程大纲。
5. 编辑和确认大纲。
6. 按章节生成多页 PPT 内容和测试内容。
7. 进入教师 Studio 编辑课件。
8. 使用 AI 辅助优化大纲、PPT 页、测验题或章节内容。
9. 发布为现有 classroom/stage，进入课堂预览或导出 PPTX/资源包。

## 数据模型设计

MVP 新增教师侧课程项目模型，但最终产物仍转换为现有 `Stage / Scene` 数据结构，以复用课堂播放、课件编辑和导出能力。

### CourseProject

教师课程项目，保存课程需求、目标学生、课时、工作流模板、生成状态和当前编辑状态。

建议字段：

- `id`
- `title`
- `requirements`
- `targetAudience`
- `duration`
- `chapterCount`
- `workflowTemplateId`
- `status`
- `createdAt`
- `updatedAt`
- `publishedClassroomId`

### CourseOutline

教师可编辑的大纲结构，按“章节 -> 小节/页面意图 -> 测试点”组织。它位于现有 `SceneOutline` 之外，是教师产品层的外部结构。

建议字段：

- `projectId`
- `languageDirective`
- `chapters`
- `revision`

### CourseChapter

课程章节，对应一组现有 `SceneOutline`。每个章节可以生成多页 slide 和一个或多个 quiz，也可以扩展 interactive 或 PBL 场景。

建议字段：

- `id`
- `title`
- `learningObjectives`
- `sceneOutlines`
- `status`
- `dirty`
- `locked`
- `order`

### LessonArtifact

章节生成后的内容产物。MVP 中可以直接映射为现有 `Scene`，并记录其来源章节和大纲 revision。

建议字段：

- `chapterId`
- `sceneId`
- `sceneType`
- `sourceOutlineId`
- `outlineRevision`
- `locked`
- `lastGeneratedAt`

### PublishedClassroom

发布后的课堂产物使用现有 classroom/stage 数据。教师项目只保存 `publishedClassroomId` 或相关 revision 信息。

## 大纲到场景的映射

现有 `SceneOutline` 是场景级结构，适合生成单页 slide、quiz、interactive 或 PBL。教师平台需要在外层增加章节级结构：

- 一个 `CourseChapter` 包含多个 `SceneOutline`。
- 每个章节通常生成多页 slide，再附带 quiz。
- 教师修改章节大纲后，只将该章节标记为 `dirty`。
- 重新生成时仅重新生成 dirty 章节对应的 scenes。
- 未修改章节保留已有生成结果和人工编辑内容。
- 被 `locked` 的课件页不参与批量覆盖。

这个策略可以避免一次大纲调整覆盖整门课，也能保护人工修改结果。

## 页面与路由设计

### 首页

路径：`app/page.tsx`

新增身份选择卡片：

- 学生：继续执行当前 `handleGenerate`。
- 教师：跳转到 `/teacher/new`。

UI 文案必须通过 `lib/i18n/locales/*.json` 管理，不在组件中硬编码。

### 教师创建页

建议路径：`/teacher/new`

功能：

- 输入课程主题、目标对象、课时、章节数、教学目标。
- 选择工作流模板。MVP 只需要一个“标准课程制作”模板。
- 创建 `CourseProject` 并进入大纲页。

### 大纲页

建议路径：`/teacher/projects/:id/outline`

功能：

- 调用现有 `/api/generate/scene-outlines-stream` 生成初始大纲。
- 将生成结果转换为章节结构。
- 支持章节标题、教学目标、页面意图、测试点编辑。
- 支持增删章节、排序、重新生成大纲。
- 确认大纲后进入章节内容生成。

### 教师 Studio

建议路径：`/teacher/projects/:id/studio`

布局：

- 左侧：章节和页面树。
- 中间：复用 `CanvasArea`、`SlideEditor`、`QuizEditor`。
- 右侧：AI 辅助面板和生成状态面板。
- 顶部：保存、预览课堂、发布、导出入口。

MVP 优先复用现有 `CourseEditorShell`，在外层增加教师项目、章节树和生成状态，而不是重写课件编辑器。

### 轻量监控面板

MVP 中监控面板可以嵌入教师 Studio 右侧，不单独建设完整运营控制台。

功能：

- 当前 pipeline 步骤。
- 章节生成进度。
- 失败原因。
- 重试失败步骤。
- 进入大纲或课件编辑进行人工介入。

后续可扩展为工作人员控制台，支持多项目列表、任务事件流、暂停/继续/取消、审批和审计。

## AI 辅助编辑设计

AI 辅助采用“生成建议 -> 教师确认应用”的模式，默认不直接覆盖人工内容。

建议新增窄接口 `/api/teacher/assist`，避免把现有课堂 `/api/chat` 的上下文协议扩得过宽。

请求应包含明确作用域：

- `outline`：优化章节结构、补充教学目标、调整难度、拆分章节。
- `chapter`：基于章节大纲重新生成或优化章节内容。
- `slide`：优化当前页表达、补充案例、生成讲稿、改写为适合目标年级的表达。
- `quiz`：生成或优化测验题、调整难度、补充解析。

AI 返回建议内容和可应用 patch，由教师确认后写入项目或课件。

## 人工介入规则

MVP 的人工介入重点放在大纲和课件编辑阶段：

- 每个生成步骤都产生可编辑结果。
- 默认不自动覆盖已人工修改的内容。
- 教师修改某章节大纲后，该章节标记为 `dirty`。
- 重新生成章节时提示覆盖范围。
- 被锁定的课件页不会被批量重新生成覆盖。
- 失败步骤支持重试或人工编辑绕过。
- 工作人员可以进入项目查看状态并协助编辑。

暂停、继续、取消、多人审批、完整审计链属于后续增强。

## 与现有系统的复用关系

可复用的现有能力：

- 首页生成需求输入能力。
- `lib/generation/outline-generator.ts`
- `/api/generate/scene-outlines-stream`
- `/api/generate/scene-content`
- `/api/generate/scene-actions`
- `lib/generation/scene-builder.ts`
- `CourseEditorShell`
- `CanvasArea`
- `SlideEditor`
- `QuizEditor`
- `useStageStore`
- `/api/classroom`
- PPTX、资源包和课堂 ZIP 导出能力。

需要新增的能力：

- 教师身份入口。
- 教师项目数据模型。
- 章节级大纲编辑。
- `CourseProject -> Stage/Scene` 映射层。
- 章节 dirty/locked 状态。
- 教师 AI 辅助接口和面板。
- 项目内轻量监控面板。

## 分阶段实施路线

### 阶段 1：双身份入口与教师创建流程

目标：

- 首页增加学生/教师身份选择。
- 学生路径保持现状。
- 教师路径进入 `/teacher/new`。
- 教师能创建 `CourseProject`。

验收标准：

- 现有学生 happy path 不回退。
- 教师能创建课程项目并进入大纲页。
- 新增 UI 文案完成 i18n。

### 阶段 2：可编辑大纲与按大纲生成章节

目标：

- 复用 `scene-outlines-stream` 生成大纲。
- 展示并编辑章节结构。
- 按章节生成 slide 和 quiz。
- 支持修改大纲后重新生成相关章节。

验收标准：

- 教师可以编辑、排序、增删章节。
- 修改某章节后只重新生成该章节。
- 未修改章节保留已有内容。

### 阶段 3：教师 Studio 与课件编辑

目标：

- 复用现有课件编辑器。
- 增加章节树、生成状态和保存/预览按钮。
- 将教师项目发布为现有 classroom/stage。

验收标准：

- 教师能编辑生成后的 PPT 和测试题。
- 保存后可进入现有课堂页面预览。
- 可继续使用现有 PPTX/资源包导出。

### 阶段 4：AI 辅助与轻量监控

目标：

- 新增教师 AI 辅助面板。
- 支持大纲、章节、当前 PPT 页、当前测验题的局部优化。
- 增加项目内生成状态面板。

验收标准：

- AI 建议不会直接覆盖人工内容。
- 教师确认后才能应用建议。
- 失败步骤可重试或人工编辑绕过。

## 测试策略

重点测试：

- 学生身份现有 happy path。
- 教师创建课程项目。
- 大纲生成、编辑和重新生成。
- `CourseProject -> Stage/Scene` 映射。
- 章节 dirty/locked 规则。
- 课件人工编辑后重新生成不覆盖锁定页。
- AI 辅助建议的确认应用流程。
- 发布后课堂预览和导出。
- i18n key parity：`pnpm check:i18n-keys`。

建议测试位置：

- `tests/generation/`：大纲转换和章节生成逻辑。
- `tests/course-editor/`：教师 Studio 与编辑保存行为。
- `tests/server/`：教师项目存储、发布和 classroom 映射。
- `e2e/tests/`：教师创建课程、生成大纲、生成章节、编辑、预览课堂的关键路径。

## 非目标

MVP 不包含以下内容：

- 完整账号体系和 RBAC。
- 多人同时编辑冲突解决。
- 完整运营后台。
- 任务 WebSocket/SSE 实时事件总线。
- 复杂审批流配置器。
- 对所有现有课堂运行时交互做重构。

这些能力可以在教师 MVP 验证后继续扩展。

## 风险与缓解

### 风险：影响现有学生链路

缓解：学生身份继续走现有逻辑；教师侧新增路由和壳层，避免改动核心课堂运行时。

### 风险：大纲结构与现有 SceneOutline 不匹配

缓解：新增章节级映射层，不改变现有生成内核的数据契约。

### 风险：重新生成覆盖人工编辑

缓解：引入 `dirty` 和 `locked` 规则，默认只重新生成相关章节，并跳过锁定页。

### 风险：AI 辅助不可控

缓解：AI 只生成建议，由教师确认应用；接口按作用域收窄。

### 风险：监控诉求扩大导致 MVP 失焦

缓解：MVP 只做项目内轻量状态面板，完整运营控制台作为后续阶段。

## 后续计划

本设计获得确认后，下一步应创建实现计划，拆成可测试的小任务：

1. 首页身份入口。
2. 教师项目模型和存储。
3. 教师创建页。
4. 大纲生成与编辑页。
5. 章节生成和映射。
6. 教师 Studio 集成。
7. AI 辅助接口和面板。
8. 轻量监控与重试。
9. 发布、预览和导出。
10. 单元测试与 E2E 覆盖。
