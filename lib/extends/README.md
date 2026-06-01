# lib/extends

Fork business logic. Mirror upstream paths (`generation/`, `orchestration/`, `prompts/`, …).

- Register capabilities in `registry/`.
- Call `registerExtensions()` from `@extends/bootstrap` (see `app/extends/layout.tsx`).

## 相对路径 import 规则

Fork 仅 alias **单个文件**到 `lib/extends/…`（见 `extends/fork-aliases.json`）。extends 目录内**没有**复制全部上游 sibling 文件。

在 `lib/extends/**` 中：

- **未**单独 fork 的模块 → 使用 `@/lib/…`（走 alias 或上游路径），**禁止** `./foo` 指向上游-only 文件。
- 已 fork 的模块 → 同样推荐 `@/lib/generation/scene-generator` 等形式，由 alias 解析到 extends 实现。

典型错误：`lib/extends/generation/scene-generator.ts` 中 `from './action-parser'` → 应改为 `from '@/lib/generation/action-parser'`。

违反时症状：章节生成页 `/teacher/projects/.../generate` 或 generate API 返回 HTTP 500，`Module not found`。

## Stage store 单例

`extends/fork-aliases.json` 仅 alias `@/lib/store/stage.ts`。若 `lib/store/index.ts` 用相对路径 `./stage` 导入，则 `@/lib/store` 会绑定**上游** stage，而 `@/lib/store/stage` 绑定 **extends** stage——`ChatArea` 等通过 barrel 读取的 scenes 会与 Studio  hydration 写入的不是同一份，笔记栏会显示空状态。

**规则：** `lib/store/index.ts` 必须通过 `@/lib/store/stage` 再导出 `useStageStore`。
