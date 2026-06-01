# AI Runtime Observability — Plan 4（其余流程接入）

**分支：** `feat/ai-runtime-observability`  
**前置：** Plan 1 完成

## 任务

| # | 流程 | kind | 接入点 |
| --- | --- | --- | --- |
| 1 | 章节媒体 batch | `chapter-media-generation` | `generate-chapter` route + `classroom-media-generation` fork |
| 2 | 场景重设计 | `scene-redesign` | `scene-content` / `scene-actions` route wrappers + `use-scene-redesign` headers |
| 3 | 学生流 outline | `preview-outline-stream` | `scene-outlines-stream` route |
| 4 | 学生流 content/actions | `preview-scene-content` / `preview-scene-actions` | route wrappers（默认 kind） |
| 5 | PBL | `pbl-generation` | `lib/extends/pbl/generate-pbl.ts` fork |
| 6 | TTS / ASR | `tts` / `asr` | `app/extends/api/generate/tts` + `transcription` forks |
| 7 | 知识库规划 | `knowledge-base-ai-plan` | `knowledge-base/ai/plan` route |

## fork-aliases 新增

- `@/app/api/generate/scene-content|scene-actions|tts`
- `@/app/api/transcription`
- `@/lib/server/classroom-media-generation`
- `@/lib/pbl/generate-pbl`
