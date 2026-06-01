# OpenMAIC 二次开发（extends）

本目录为二开 **bootstrap 层**，存放扩展注册入口与规范文档。

## 文档

- **[二次开发修改规范](./DEVELOPMENT_GUIDE.md)** — 必读
- [复制改造同步清单](./SYNC_MANIFEST.md)
- [上游版本跟踪](./UPSTREAM_VERSION)

## 运行时入口

- [`bootstrap.ts`](./bootstrap.ts) — 启动校验（`registerExtensions()`）
- [`merge-i18n.ts`](./merge-i18n.ts) — i18n 增量合并
- [`configs/extends/`](../configs/extends/) — 可选主题/配置覆盖（暂无运行时合并入口）

客户端在 [`app/extends/layout.tsx`](../app/extends/layout.tsx) 启动时注册；健康检查：[`GET /extends/api/health`](../app/extends/api/health/route.ts)。

## 目录约定

扩展代码按模块分布在：

```
app/extends/
components/extends/
lib/extends/
configs/extends/
public/extends/
tests/extends/
e2e/extends/
```

业务代码请勿写入上游 `app/`、`components/`、`lib/` 等原有路径。

路径别名见根目录 `tsconfig.json`（`@extends/*`、`@lib-extends/*` 等）。

Fork 代码已从 `feat/html-slide-design-workbench` 镜像到 `*/extends/`（2026-05-18 后变更）。集成方式见 **[INTEGRATION.md](./INTEGRATION.md)**；重新迁移：`node scripts/migrate-fork-to-extends.mjs`。
