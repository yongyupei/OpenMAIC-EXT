# 复制改造同步清单

> 记录所有从上游 **复制到 extends** 的文件，便于上游版本升级后手动 diff 合并。  
> 规范详见 [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md) §6.3。

| 扩展文件 | 上游源文件 | 上次同步上游版本 | 差异摘要 |
|---------|-----------|-----------------|---------|
| `app/extends/api/generate-classroom/route.ts` | `app/api/generate-classroom/route.ts` | v0.2.1 | fork → extends |
| `app/extends/api/generate/scene-outlines-stream/route.ts` | `app/api/generate/scene-outlines-stream/route.ts` | v0.2.1 | fork → extends |
| `app/extends/api/knowledge-base/ai/plan/route.ts` | `app/api/knowledge-base/ai/plan/route.ts` | v0.2.1 | fork → extends |
| `app/extends/api/teacher/projects/[projectId]/chapters/[chapterId]/generate/route.ts` | `app/api/teacher/projects/[projectId]/chapters/[chapterId]/generate/route.ts` | v0.2.1 | fork → extends |
| `app/extends/api/teacher/projects/[projectId]/chapters/[chapterId]/route.ts` | `app/api/teacher/projects/[projectId]/chapters/[chapterId]/route.ts` | v0.2.1 | fork → extends |
| `app/extends/api/teacher/projects/[projectId]/generate-chapter/route.ts` | `app/api/teacher/projects/[projectId]/generate-chapter/route.ts` | v0.2.1 | fork → extends |
| `app/extends/api/teacher/projects/[projectId]/generate-outline/route.ts` | `app/api/teacher/projects/[projectId]/generate-outline/route.ts` | v0.2.1 | fork → extends |
| `app/extends/api/teacher/projects/[projectId]/route.ts` | `app/api/teacher/projects/[projectId]/route.ts` | v0.2.1 | fork → extends |
| `app/extends/classroom/[id]/edit/page.tsx` | `app/classroom/[id]/edit/page.tsx` | v0.2.1 | fork → extends |
| `app/extends/knowledge-base/page.tsx` | `app/knowledge-base/page.tsx` | v0.2.1 | fork → extends |
| `app/extends/page.tsx` | `app/page.tsx` | v0.2.1 | fork → extends |
| `components/extends/audio/speech-button.tsx` | `components/audio/speech-button.tsx` | v0.2.1 | fork → extends |
| `components/extends/canvas/canvas-area.tsx` | `components/canvas/canvas-area.tsx` | v0.2.1 | fork → extends |
| `components/extends/course-editor/course-editor-shell.tsx` | `components/course-editor/course-editor-shell.tsx` | v0.2.1 | fork → extends |
| `components/extends/course-editor/scene-list-editor.tsx` | `components/course-editor/scene-list-editor.tsx` | v0.2.1 | fork → extends |
| `components/extends/course-editor/workflow-config-panel.tsx` | `components/course-editor/workflow-config-panel.tsx` | v0.2.1 | fork → extends |
| `components/extends/header.tsx` | `components/header.tsx` | v0.2.1 | fork → extends |
| `components/extends/home/fork-home-entry-link.tsx` | — | — | fork-only：/home 入口 |
| `components/extends/stage/scene-renderer.tsx` | `components/stage/scene-renderer.tsx` | v0.2.1 | fork → extends |
| `components/extends/teacher/chapter-generate-shell.tsx` | `components/teacher/chapter-generate-shell.tsx` | v0.2.1 | fork → extends |
| `components/extends/teacher/chapter-generation-progress-card.tsx` | — | — | fork-only：章节生成卡片 UI |
| `components/extends/teacher/chapter-studio-shell.tsx` | `components/teacher/chapter-studio-shell.tsx` | v0.2.1 | fork → extends |
| `components/extends/teacher/course-project-design-shell.tsx` | `components/teacher/course-project-design-shell.tsx` | v0.2.1 | fork → extends |
| `components/extends/teacher/course-project-streaming-banner.tsx` | `components/teacher/course-project-streaming-banner.tsx` | v0.2.1 | fork → extends |
| `components/extends/teacher/course-studio-shell.tsx` | `components/teacher/course-studio-shell.tsx` | v0.2.1 | fork → extends |
| `components/extends/teacher/design-workbench/chapter-classroom-status-badge.tsx` | `components/teacher/design-workbench/chapter-classroom-status-badge.tsx` | v0.2.1 | fork → extends |
| `components/extends/teacher/design-workbench/chapter-failure-detail-dialog.tsx` | `components/teacher/design-workbench/chapter-failure-detail-dialog.tsx` | v0.2.1 | fork → extends |
| `components/extends/teacher/design-workbench/chapter-list-editor.tsx` | `components/teacher/design-workbench/chapter-list-editor.tsx` | v0.2.1 | fork → extends |
| `components/extends/teacher/design-workbench/course-knowledge-mount-block.tsx` | `components/teacher/design-workbench/course-knowledge-mount-block.tsx` | v0.2.1 | fork → extends |
| `components/extends/teacher/design-workbench/course-overview-block.tsx` | `components/teacher/design-workbench/course-overview-block.tsx` | v0.2.1 | fork → extends |
| `lib/extends/generation/generation-pipeline.ts` | `lib/generation/generation-pipeline.ts` | v0.2.1 | fork → extends |
| `lib/extends/generation/outline-generator.ts` | `lib/generation/outline-generator.ts` | v0.2.1 | fork → extends |
| `lib/extends/generation/scene-assembler.ts` | `lib/generation/scene-assembler.ts` | v0.2.1 | fork → extends |
| `lib/extends/generation/scene-generator.ts` | `lib/generation/scene-generator.ts` | v0.2.1 | fork → extends |
| `lib/extends/hooks/use-audio-recorder.ts` | `lib/hooks/use-audio-recorder.ts` | v0.2.1 | fork → extends |
| `lib/extends/i18n/locales/ar-SA.json` | `lib/i18n/locales/ar-SA.json` | v0.2.1 | fork → extends |
| `lib/extends/i18n/locales/en-US.json` | `lib/i18n/locales/en-US.json` | v0.2.1 | fork → extends |
| `lib/extends/i18n/locales/ja-JP.json` | `lib/i18n/locales/ja-JP.json` | v0.2.1 | fork → extends |
| `lib/extends/i18n/locales/ru-RU.json` | `lib/i18n/locales/ru-RU.json` | v0.2.1 | fork → extends |
| `lib/extends/i18n/locales/zh-CN.json` | `lib/i18n/locales/zh-CN.json` | v0.2.1 | fork → extends |
| `lib/extends/i18n/locales/zh-TW.json` | `lib/i18n/locales/zh-TW.json` | v0.2.1 | fork → extends |
| `lib/extends/knowledge-base/client.ts` | `lib/knowledge-base/client.ts` | v0.2.1 | fork → extends |
| `lib/extends/knowledge-base/tree-utils.ts` | `lib/knowledge-base/tree-utils.ts` | v0.2.1 | fork → extends |
| `lib/extends/prompts/index.ts` | `lib/prompts/index.ts` | v0.2.1 | fork → extends |
| `lib/extends/prompts/loader.ts` | `lib/prompts/loader.ts` | v0.2.1 | extends-first template/snippet resolution |
| `lib/extends/generation/scene-generator-media-utils.ts` | — | — | fork-only：scene-generator 媒体/元素处理 |
| `lib/extends/generation/scene-generator-actions.ts` | — | — | fork-only：scene-generator 动作生成 |
| `lib/extends/generation/scene-generator-constants.ts` | — | — | fork-only：scene-generator 常量 |
| `lib/extends/generation/scene-generator-fallbacks.ts` | — | — | fork-only：slide/quiz/interactive 降级 |
| `lib/extends/generation/scene-generator-pbl-content.ts` | — | — | fork-only：PBL 场景内容生成 |
| `lib/extends/generation/scene-generator-quiz-content.ts` | — | — | fork-only：quiz 场景内容生成 |
| `lib/extends/generation/scene-generator-slide-content.ts` | — | — | fork-only：slide 场景内容生成 |
| `lib/extends/generation/scene-generator-types.ts` | — | — | fork-only：scene-generator 类型 |
| `lib/extends/generation/scene-generator-widget-content.ts` | — | — | fork-only：widget/interactive 场景内容 |
| `lib/extends/prompts/templates/requirements-to-outlines/system.md` | `lib/prompts/templates/requirements-to-outlines/system.md` | v0.2.1 | fork → extends |
| `lib/extends/prompts/templates/slide-content/system.md` | `lib/prompts/templates/slide-content/system.md` | v0.2.1 | fork → extends |
| `lib/extends/prompts/templates/slide-content/user.md` | `lib/prompts/templates/slide-content/user.md` | v0.2.1 | fork → extends |
| `lib/extends/prompts/types.ts` | `lib/prompts/types.ts` | v0.2.1 | fork → extends |
| `lib/extends/server/classroom-generation.ts` | `lib/server/classroom-generation.ts` | v0.2.1 | fork → extends |
| `lib/extends/server/classroom-storage.ts` | `lib/server/classroom-storage.ts` | v0.2.1 | fork → extends（补充 `updateClassroom`） |
| `lib/extends/store/stage.ts` | `lib/store/stage.ts` | v0.2.1 | fork → extends |
| `lib/extends/teacher/chapter-classroom-api.ts` | `lib/teacher/chapter-classroom-api.ts` | v0.2.1 | fork → extends |
| `lib/extends/teacher/chapter-diff.ts` | `lib/teacher/chapter-diff.ts` | v0.2.1 | fork → extends |
| `lib/extends/teacher/chapter-generate-precheck.ts` | `lib/teacher/chapter-generate-precheck.ts` | v0.2.1 | fork → extends |
| `lib/extends/teacher/chapter-generation-enrichment.ts` | `lib/teacher/chapter-generation-enrichment.ts` | v0.2.1 | fork → extends |
| `lib/extends/teacher/chapter-generation-input.ts` | `lib/teacher/chapter-generation-input.ts` | v0.2.1 | fork → extends |
| `lib/extends/teacher/chapter-generation-resume.ts` | `lib/teacher/chapter-generation-resume.ts` | v0.2.1 | fork → extends |
| `lib/extends/teacher/course-project-storage.ts` | `lib/teacher/course-project-storage.ts` | v0.2.1 | fork → extends |
| `lib/extends/teacher/course-project.ts` | `lib/teacher/course-project.ts` | v0.2.1 | fork → extends |
| `lib/extends/teacher/course-types.ts` | `lib/teacher/course-types.ts` | v0.2.1 | fork → extends |
| `lib/extends/teacher/design-shell-reducer.ts` | `lib/teacher/design-shell-reducer.ts` | v0.2.1 | fork → extends |
| `lib/extends/teacher/teacher-projects-client.ts` | `lib/teacher/teacher-projects-client.ts` | v0.2.1 | fork → extends |
| `lib/extends/teacher/teacher-refine-client.ts` | `lib/teacher/teacher-refine-client.ts` | v0.2.1 | fork → extends |
| `lib/extends/types/generation.ts` | `lib/types/generation.ts` | v0.2.1 | fork → extends |
| `lib/extends/types/slides.ts` | `lib/types/slides.ts` | v0.2.1 | fork → extends |
| `lib/extends/types/stage.ts` | `lib/types/stage.ts` | v0.2.1 | fork → extends |
| `tests/extends/knowledge-base/tree-utils.test.ts` | `tests/knowledge-base/tree-utils.test.ts` | v0.2.1 | fork → extends |
| `tests/extends/teacher/chapter-diff.test.ts` | `tests/teacher/chapter-diff.test.ts` | v0.2.1 | fork → extends |
| `tests/extends/teacher/generate-chapter-api.test.ts` | `tests/teacher/generate-chapter-api.test.ts` | v0.2.1 | fork → extends |
| `tests/extends/teacher/outline-api.test.ts` | `tests/teacher/outline-api.test.ts` | v0.2.1 | fork → extends |
| `lib/extends/observability/*` | (no upstream) | Plan 1 新增 | new module |
| `lib/extends/ai/llm.ts` | `lib/ai/llm.ts` | Plan 1 新增 | fork wrapper（callLLM 拦截器） |
| `components/extends/agent/agent-bar.tsx` | `components/agent/agent-bar.tsx` | v0.2.1 | fork → extends（讲义笔记 UI） |
| `components/extends/chat/session-list.tsx` | `components/chat/session-list.tsx` | v0.2.1 | fork → extends |
| `components/extends/chat/use-chat-sessions.ts` | `components/chat/use-chat-sessions.ts` | v0.2.1 | fork → extends（maxTurns agent loop） |
| `components/extends/settings/agent-settings.tsx` | `components/settings/agent-settings.tsx` | v0.2.1 | fork → extends |
| `lib/extends/chat/agent-loop.ts` | `lib/chat/agent-loop.ts` | v0.2.1 | fork → extends（maxTurns 终止） |
| `lib/extends/orchestration/director-graph.ts` | `lib/orchestration/director-graph.ts` | v0.2.1 | fork → extends |
| `lib/extends/prompts/templates/agent-system/system.md` | `lib/prompts/templates/agent-system/system.md` | v0.2.1 | fork → extends |
| `lib/extends/prompts/templates/director/system.md` | `lib/prompts/templates/director/system.md` | v0.2.1 | fork → extends |
| `lib/extends/store/settings.ts` | `lib/store/settings.ts` | v0.2.1 | fork → extends |
| `lib/extends/types/chat.ts` | `lib/types/chat.ts` | v0.2.1 | fork → extends（maxTurns + 合并上游 error 状态） |


1. 更新 `extends/UPSTREAM_VERSION`
2. 对本表每一行执行：`git diff upstream/<tag> -- <上游源文件>`
3. 将必要改动合并到对应扩展文件
4. 更新「上次同步上游版本」与「差异摘要」列
5. 运行 `pnpm test` 与相关 `e2e/extends` 用例
