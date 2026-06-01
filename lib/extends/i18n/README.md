# 二开 i18n 规则

> 运行时合并逻辑：`lib/extends/i18n/config.ts` + `extends/merge-i18n.ts`  
> 集成总览：[`extends/INTEGRATION.md`](../../../extends/INTEGRATION.md) §多语言

## 加载机制

| 层 | 路径 | 作用 |
| --- | --- | --- |
| **上游 base** | `lib/i18n/locales/<code>.json` | 开源主仓文案，合并时的底稿 |
| **二开 overlay** | `lib/extends/i18n/overlays/<code>.json` | 与上游 diff 后的增量 key，**运行时真正生效** |
| **全量快照** | `lib/extends/i18n/locales/<code>.json` | 仅用于生成 overlay，**不被运行时直接 import** |
| **注册表** | `lib/i18n/locales.ts` | 语言列表（`label` / `shortLabel`），语言切换器读此文件 |
| **运行时 config** | `lib/extends/i18n/config.ts` | 通过 fork 别名替换 `@/lib/i18n/config`，负责 deep-merge |

合并规则：**overlay 与 base 同 key 时 overlay 优先**；overlay 中不存在的 key 沿用上游。

## 必须遵守的工作流

### 1. 修改二开文案

优先改 **`lib/extends/i18n/locales/<code>.json` 全量快照**（或从 fork 分支同步后再改），不要只改 overlay 手工拼 key——overlay 由脚本统一生成，保证 6 语种 key 路径一致。

### 2. 重新生成 overlay（必做）

```bash
node scripts/extract-i18n-overlay.mjs
pnpm check:i18n-keys
```

`extract-i18n-overlay.mjs` 以 **en-US** 上游 vs fork 全量 diff 出 key 路径列表，再为 6 个 locale 各抽取对应译文写入 `overlays/`。

**跳过此步骤的典型症状：** 页面显示 raw key，例如 `teacher.identity.studentTitle`、`knowledgeBase.picker.label`、`home.recentSection`。

### 3. 验证

- 刷新 `/home`（二开首页）与相关 fork 页面
- 切换语言，确认选项与标签均为人类可读文案，而非 key

## 禁止事项

| 禁止 | 原因 |
| --- | --- |
| 在 `fork-alias-utils.mjs` 对 `lib/i18n/locales` 做**目录级**前缀别名 | 会把 `@/lib/i18n/locales` 指到 JSON 目录，破坏 `locales.ts` 与动态 import |
| 在 `fork-aliases.json` 把 `lib/i18n/locales/*.json` 整文件 alias 到 extends | 应走 overlay 合并，而非替换上游 JSON |
| 只改 `overlays/` 而不更新 `locales/` 全量快照 | 下次跑脚本会被覆盖；key 路径也无法与 en-US diff 对齐 |
| 在 locale / overlay JSON 中加 `/**` 注释头 | 会导致 JSON 解析失败 |
| 将整页 `app/page.tsx` alias 到 extends | 见 INTEGRATION.md「首页双入口」 |

## 与 fork 别名的关系

- **仅** `@/lib/i18n/config` → `lib/extends/i18n/config.ts`（见 `extends/fork-aliases.json`）
- `@/lib/i18n/locales.ts`、`@/lib/i18n/types.ts` 等保持上游路径
- `@/lib/i18n/locales/<code>.json` 运行时读上游文件；overlay 在 config 里合并

## 语言切换器

`components/language-switcher.tsx` 使用 `lib/i18n/locales.ts` 的 `supportedLocales[].label` / `shortLabel`。  
若**下拉语言名**错误，查 `locales.ts`；若**页面其它文案**显示 key，查 overlay 是否过期。

## 相关命令

```bash
# 从 fork 全量快照刷新 overlay（日常）
node scripts/extract-i18n-overlay.mjs

# 校验 6 语种 key 对齐
pnpm check:i18n-keys

# 大规模 fork 迁移后（可选）
node scripts/migrate-fork-to-extends.mjs
node scripts/extract-i18n-overlay.mjs
```
