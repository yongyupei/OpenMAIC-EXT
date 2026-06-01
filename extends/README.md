# OpenMAIC 二次开发（extends）

本目录为二开 **bootstrap 层**，存放扩展注册入口与规范文档。完整功能说明见根目录 **[README-zh.md](../README-zh.md#-二开扩展功能)** / **[README.md](../README.md#-extensions-fork-features)**。

## 功能一览

| 模块 | 用户入口 | 主要 extends 路径 |
| --- | --- | --- |
| 教师课程平台 | `/teacher` | `app/extends/teacher/`, `lib/extends/teacher/`, `components/extends/teacher/` |
| 扩展首页 | `/home` | `app/extends/home/` |
| 知识库 | `/knowledge-base` | `app/extends/knowledge-base/`, `lib/extends/knowledge-base/` |
| 幻灯片模板 | `/slide-templates` | `app/extends/slide-templates/`, `lib/extends/slide-templates/` |
| 课程编辑 / 讲解视频 | `/classroom/[id]/edit` | `components/extends/course-editor/`, `lib/extends/server/video-export/` |
| HTML 动效页 | 设计工作台 | `lib/extends/generation/html-slide-*` |
| 生成模式 & Prompt | 项目/章节设置 | `lib/extends/prompts/`, `lib/extends/generation/` |
| AI 追踪（开发） | `/dev/ai-traces` | `lib/extends/observability/` |

**讲解视频导出 API：** `POST /api/extends/export-video`（需 FFmpeg、TTS 配置，详见主 README）。

## 文档

| 文件 | 说明 |
| --- | --- |
| **[DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md)** | 二开修改规范（必读） |
| **[INTEGRATION.md](./INTEGRATION.md)** | 别名、rewrite、API 桥接、Windows 注意项 |
| **[SYNC_MANIFEST.md](./SYNC_MANIFEST.md)** | 从上游复制改造的同步清单 |
| **[UPSTREAM_VERSION](./UPSTREAM_VERSION)** | 跟踪的上游 tag/commit |
| **[fork-aliases.json](./fork-aliases.json)** | `@/…` → `*/extends/…` 别名表 |

## 运行时入口

- [`bootstrap.ts`](./bootstrap.ts) — 启动校验（`registerExtensions()`）
- [`merge-i18n.ts`](./merge-i18n.ts) — i18n 增量合并
- [`configs/extends/`](../configs/extends/) — 可选主题/配置覆盖

客户端在 [`app/extends/layout.tsx`](../app/extends/layout.tsx) 启动时注册；健康检查 [`GET /extends/api/health`](../app/extends/api/health/route.ts)。

## 目录约定

扩展代码按模块分布在：

```
app/extends/          # 新页面、API（对外 /api/extends/…）
components/extends/   # UI 扩展
lib/extends/          # 核心逻辑、Prompt、生成、服务端
configs/extends/      # 配置覆盖
public/extends/       # 静态资源（/extends/… URL）
tests/extends/        # 单元测试
e2e/extends/          # E2E
```

**请勿**在上游 `app/`、`components/`、`lib/` 等业务目录内直接改文件。

路径别名见根目录 `tsconfig.json`（`@extends/*`、`@lib-extends/*`、`@app-extends/*` 等）。变更 [`fork-aliases.json`](./fork-aliases.json) 后：

```bash
pnpm sync:fork-tsconfig-paths
node scripts/sync-api-bridges.mjs   # 同步 app/api/extends 桥接
```

Fork 代码已从 `feat/html-slide-design-workbench` 镜像到 `*/extends/`；重新迁移：`node scripts/migrate-fork-to-extends.mjs`（见 [INTEGRATION.md](./INTEGRATION.md)）。
