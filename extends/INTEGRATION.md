# 二开集成说明

> 5 月 18 日后 fork 功能已从 `feat/html-slide-design-workbench` 镜像到 `*/extends/`，上游路径已恢复为 `origin/master`。
> 重新生成迁移：`node scripts/migrate-fork-to-extends.mjs`（需指定 `FORK_BRANCH` / `BASE_REF`）。

## 机制

| 层 | 作用 |
| --- | --- |
| **`extends/fork-aliases.json`** | 模块别名表（`@/lib/…` → `lib/extends/…`）；目录级 prefix 仅用于完整 fork 子树（如 `lib/slide-templates`）。`lib/prompts`、`lib/knowledge-base` 等**部分 fork** 模块只用逐文件 alias，避免 shadow 上游-only 文件 |
| **`next.config.ts`** | `turbopack.resolveAlias` + `webpack.alias` + `rewrites` |
| **`vitest.config.ts`** | 测试环境同步别名；**自动 exclude** `fork-aliases.json` 中已有 `tests/extends/` 镜像的上游 `tests/**` 入口 |
| **`scripts/sync-fork-tsconfig-paths.mjs`** | 将 fork 别名写入 `tsconfig.json` paths（修改 `fork-alias-utils.mjs` 或 `fork-aliases.json` 后执行 `pnpm sync:fork-tsconfig-paths`） |
| **`app/extends/**`** | 新 API / 页面实现；API 经 `app/api` 桥接，页面经 rewrite |

## API 桥接

所有二开 API 统一使用公开路径 **`/api/extends/{module}/...`**。实现位于 `app/extends/api/**`，由 `app/api/extends/**/route.ts` 桥接（`export * from '@app-extends/...'`），不依赖 rewrite。

```bash
node scripts/sync-api-bridges.mjs   # 生成/同步 app/api/extends/** 桥接
```

**不要**在 `app/api/{module}/...` 做镜像桥接（如 `app/api/teacher/**`）；`extends/fork-aliases.json` 中 `apiMirrorPrefix` 应为空数组。

覆盖上游行为的 fork API（如 classroom PUT、generate/*、transcription）同样走 `/api/extends/...`；上游 GET 等未改动的路由仍用 `/api/...`（如 `GET /api/classroom`）。

## URL 映射

### 页面（rewrite）

- `/knowledge-base` → `/extends/knowledge-base`
- `/slide-templates` → `/extends/slide-templates`

### API

- 二开 API：`/api/extends/{module}/...`（teacher、knowledge-base、export-video、generate/*、classroom PUT 等）
- 上游未改 API：仍用 `/api/...`（如 `GET /api/classroom`）

同步桥接：

```bash
node scripts/sync-api-bridges.mjs
node scripts/generate-fork-rewrites.mjs   # 仅页面 rewrite（/knowledge-base、/slide-templates）
```

修改 `next.config` / `fork-aliases.json` 的 `rewrites` 后需 **重启** `pnpm dev`。

## 首页双入口

| 路径 | 说明 |
| --- | --- |
| `/` | 上游开源首页（`app/page.tsx`，已恢复） |
| `/home` | 二开工作台首页（`app/home/`，含幻灯片模板、知识库等工具栏入口） |

上游首页工具栏（`components/extends/header.tsx`，别名替换上游 header）已接入 [`ForkHomeEntryLink`](../components/extends/home/fork-home-entry-link.tsx)（Layers 图标 → `/home`）。

> 不要将整页 `app/page.tsx` 别名到 extends。

## 多语言（i18n）

完整规则见 **[`lib/extends/i18n/README.md`](../lib/extends/i18n/README.md)**。

### 机制

| 层 | 路径 | 说明 |
| --- | --- | --- |
| 上游 base | `lib/i18n/locales/*.json` | 合并底稿 |
| 二开 overlay | `lib/extends/i18n/overlays/*.json` | **运行时生效**的增量 key |
| 全量快照 | `lib/extends/i18n/locales/*.json` | 仅用于 diff 生成 overlay |
| 运行时 config | `lib/extends/i18n/config.ts` | 别名替换 `@/lib/i18n/config` |

### 必做流程（改二开文案后）

```bash
node scripts/extract-i18n-overlay.mjs
pnpm check:i18n-keys
```

**未跑 overlay 脚本时**，`/home` 等页会出现 raw i18n key（如 `teacher.identity.*`、`knowledgeBase.picker.label`）。

### 别名禁忌

- **勿**在 `fork-alias-utils.mjs` 为 `lib/i18n/locales` 配置目录级前缀别名（会破坏 `@/lib/i18n/locales` → `locales.ts`）。
- **仅** alias `@/lib/i18n/config`；locale JSON 走上游路径 + overlay 合并。

### Windows / Turbopack

`next.config.ts` 中 fork `resolveAlias` 须用 `relative-posix` 路径（见 `fork-alias-utils.mjs`），否则 Windows 报 *windows imports are not implemented yet*。

## 恢复纯上游

1. `git fetch upstream && git checkout upstream/main -- .`（或合并上游 tag）
2. 保留 `extends/`、`app/extends/`、`lib/extends/` 等目录
3. 保留 `next.config.ts` / `vitest.config.ts` 中的 fork 集成块
4. 按上表补回首页 `SlideTemplatesNavLink`（若仍需该入口）

## 功能模块索引

| 模块 | extends 路径 |
| --- | --- |
| 知识库 UI/API | `app/extends/knowledge-base/`, `lib/extends/knowledge-base/`, `components/extends/knowledge-base/` |
| 幻灯片模板 | `lib/extends/slide-templates/`, `app/extends/api/slide-templates/`, `app/extends/slide-templates/` |
| HTML 动效页 | `lib/extends/generation/html-slide-*`, `components/extends/teacher/html-slide-scene-preview.tsx` |
| 设计工作台 | `components/extends/teacher/design-workbench/`, `lib/extends/teacher/` |
| 章节生成 API | `app/extends/api/teacher/projects/.../generate/route.ts` |
