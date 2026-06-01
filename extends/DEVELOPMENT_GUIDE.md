# OpenMAIC 二次开发修改规范

> 版本：1.0  
> 适用项目：OpenMAIC（基于 THU-MAIC/OpenMAIC 上游 fork / 本地二开）  
> 目标：在不修改上游业务模块的前提下进行扩展，便于持续合并上游版本更新。

---

## 1. 总则

### 1.1 核心原则

| 原则 | 说明 |
|------|------|
| **上游只读** | `app/`、`components/`、`lib/`、`configs/`、`packages/` 等目录下的**原有文件不得修改** |
| **扩展隔离** | 所有二开代码放入对应目录下的 `extends/` 子目录，或根目录 `extends/` |
| **最小集成** | 允许修改的「基础设施文件」应控制在最少范围（见 §2） |
| **可合并性** | 每次开发前先评估：上游 merge 时是否会产生冲突 |
| **可追溯** | 扩展代码需有清晰命名、注释和注册入口，避免「散落式 patch」 |

### 1.2 禁止事项

- ❌ 直接修改上游 `.ts` / `.tsx` / `.md` 业务文件
- ❌ 在上游目录中「就地改几行」后提交
- ❌ 删除、重命名上游文件或目录
- ❌ 修改 `packages/mathml2omml`、`packages/pptxgenjs` 源码（应 fork 子包或新建 workspace 包）
- ❌ 将 `.env.local`、`server-providers.yml` 等含密钥文件提交到 Git
- ❌ 在 `node_modules/`、`.next/` 等构建产物中做持久化修改

### 1.3 允许修改的文件（基础设施层）

以下文件可在二开中修改，但应**尽量保持稳定、变更可文档化**：

| 文件 | 用途 | 变更频率 |
|------|------|---------|
| `tsconfig.json` | 路径别名（`@extends/*` 等） | 低 |
| `next.config.ts` | 部署、Header、代理等 | 低 |
| `.env.local` / `server-providers.yml` | 本地/服务端密钥与 Provider 配置 | 按需 |
| `extends/bootstrap.ts` | 扩展注册入口 | 中 |
| `extends/DEVELOPMENT_GUIDE.md` | 本规范文档 | 低 |
| `.gitignore` | 忽略二开本地产物（如有） | 低 |

> **说明**：若上游更新了 `tsconfig.json` 或 `next.config.ts`，merge 后需手动合并路径别名等二开配置。

---

## 2. 目录结构规范

### 2.1 标准 extends 布局

```
OpenMAIC/
├── extends/                          # 根 bootstrap 层（注册、合并、启动）
│   ├── bootstrap.ts
│   ├── merge-config.ts               # 可选：合并 configs
│   ├── merge-i18n.ts                 # 可选：合并 i18n
│   └── DEVELOPMENT_GUIDE.md          # 本规范
│
├── app/extends/                      # 新页面、新 API Route
├── components/extends/               # UI 组件扩展
├── lib/extends/                      # 核心业务逻辑扩展
├── configs/extends/                  # 配置覆盖/追加
├── public/extends/                   # 自定义静态资源
├── tests/extends/                    # 扩展单元测试
└── e2e/extends/                      # 扩展 E2E 测试
```

### 2.2 不在各子模块内重复建 extends

❌ 错误示例：

```
lib/generation/extends/     # 不推荐
lib/ai/extends/             # 不推荐
```

✅ 正确示例：在 `lib/extends/` 内**镜像**上游子路径：

```
lib/extends/generation/custom-scene-generator.ts
lib/extends/ai/providers/my-provider.ts
lib/extends/prompts/templates/my-prompt/system.md
```

### 2.3 路径别名（tsconfig.json）

二开项目应在 `tsconfig.json` 的 `paths` 中配置：

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"],
      "@extends/*": ["./extends/*"],
      "@app-extends/*": ["./app/extends/*"],
      "@components-extends/*": ["./components/extends/*"],
      "@lib-extends/*": ["./lib/extends/*"],
      "@configs-extends/*": ["./configs/extends/*"]
    }
  }
}
```

导入规范：

```typescript
// ✅ 扩展代码之间
import { registerExtensions } from '@extends/bootstrap';
import { MySceneRenderer } from '@components-extends/scene-renderers/my-scene';

// ✅ 扩展引用上游（只读依赖）
import { generateSceneContent } from '@/lib/generation/scene-generator';

// ❌ 禁止：在上游文件中 import 扩展（意味着改了上游）
```

---

## 3. 各目录 extends 职责

### 3.1 `app/extends/`

| 用途 | 路由示例 |
|------|---------|
| 新业务页面 | `app/extends/admin/page.tsx` → `/extends/admin` |
| 新 API | `app/extends/api/my-service/route.ts` → `/extends/api/my-service` |
| 中间件扩展 | `app/extends/middleware.ts`（若采用，需在 bootstrap 说明） |

**规范**：

- 新路由统一使用 `/extends/` 前缀，避免与上游路由冲突
- 不要复制并覆盖 `app/page.tsx`、`app/classroom/[id]/page.tsx` 等上游页面路径
- API 扩展优先走新路径；若必须包装上游 API，在新 Route 内调用 `@/lib/server/*`，不修改原 Route

### 3.2 `components/extends/`

| 子目录（镜像） | 典型用途 |
|---------------|---------|
| `stage/` | 扩展 `SceneRenderer`、舞台布局 |
| `scene-renderers/` | 新场景类型 UI |
| `settings/` | 自定义设置面板 |
| `generation/` | 首页/生成流程 UI 定制 |
| `agent/`、`whiteboard/`、`ui/` | 按业务需要 |

**扩展方式选择**：

| 场景 | 推荐方式 |
|------|---------|
| 小改动（多一个 tab、多一个按钮） | 组合：引入上游组件 + 扩展组件并列渲染 |
| 中等改动（多一种 scene type） | 复制 `scene-renderer.tsx` 到 `extends/stage/`，增加 switch 分支 |
| 大改动（整页重设计） | 复制目标组件到 extends，改 extends 版；通过 registry 切换 |

**组件命名**：

- 扩展组件：`Ext` 前缀或 `Custom` 前缀，如 `ExtSceneRenderer`、`CustomSettingsPanel`
- 文件名：`kebab-case.tsx`
- 若复制上游文件，文件头注释标明来源与修改日期：

```typescript
/**
 * @extends-from components/stage/scene-renderer.tsx
 * @upstream-version 0.2.1
 * @modified 2026-05-22 — 增加 my-scene 分支
 */
```

### 3.3 `lib/extends/`（核心）

| 子目录（镜像） | 典型用途 |
|---------------|---------|
| `registry/` | 统一注册：scene types、providers、prompts |
| `generation/` | 生成流水线扩展 |
| `orchestration/` | Agent 编排扩展 |
| `prompts/templates/`、`prompts/snippets/` | 自定义 Prompt（纯 Markdown，零冲突） |
| `ai/`、`media/`、`audio/` | Provider 适配器 |
| `server/` | 服务端逻辑 |
| `store/` | Zustand slice 扩展 |
| `types/` | 类型扩展（module augmentation） |
| `i18n/locales/` | 增量翻译 JSON |
| `hooks/` | 自定义 Hooks |

**Prompt 扩展规范**（参考 `lib/prompts/README.md`）：

1. 新 Prompt 放在 `lib/extends/prompts/templates/<id>/system.md`
2. 在 `lib/extends/registry/prompts.ts` 注册 ID 与加载逻辑
3. **不要**修改 `lib/prompts/types.ts`；在 extends 侧维护扩展 ID 联合类型
4. 占位符命名使用 `camelCase`；模板 ID 使用 `kebab-case`

**Provider 扩展规范**：

1. 新 Provider 实现放在 `lib/extends/ai/providers/`
2. 在 `lib/extends/registry/providers.ts` 注册
3. 密钥仍走 `.env.local` / `server-providers.yml`，不写死在代码中

### 3.4 `configs/extends/`

用于覆盖或追加静态配置，不直接改 `configs/theme.ts` 等：

```typescript
// configs/extends/theme.override.ts
import { theme as baseTheme } from '@/configs/theme';

export const theme = {
  ...baseTheme,
  primaryColor: '#your-brand',
};
```

合并入口：`extends/merge-config.ts` 或 `configs/extends/index.ts`。

### 3.5 `public/extends/`

- 自定义 logo、avatar、favicon
- 引用路径：`/extends/logos/my-logo.svg`
- 不要覆盖 `public/logos/`、`public/avatars/` 下上游文件

### 3.6 `tests/extends/` 与 `e2e/extends/`

- 扩展测试独立存放，命名：`*.extends.test.ts` 或 `e2e/extends/*.spec.ts`
- 不修改上游 `tests/`、`e2e/tests/` 中的用例

---

## 4. 三种扩展模式

### 4.1 模式 A：组合/包装（优先）

适用：在原有逻辑前后增加行为，或追加数据字段。

```typescript
// lib/extends/generation/wrapped-scene-generator.ts
import { generateSceneContent } from '@/lib/generation/scene-generator';

export async function generateSceneWithExtension(ctx: Parameters<typeof generateSceneContent>[0]) {
  const result = await generateSceneContent(ctx);
  return applyCustomPostProcess(result);
}
```

**要求**：不复制大段上游代码；仅依赖公开 export 的 API。

### 4.2 模式 B：复制改造

适用：UI 或核心流程需大幅修改，无法通过组合实现。

**流程**：

1. 复制上游文件到对应 `*/extends/` 镜像路径
2. 在文件头添加 `@extends-from` 注释
3. 在 `extends/registry/` 或 `extends/bootstrap.ts` 注册，使入口引用扩展版
4. 上游该文件更新时，**人工 diff 合并**必要改动到 extends 副本

**复制改造检查清单**：

- [ ] 已标注 `@extends-from` 与 `@upstream-version`
- [ ] 已在 registry 注册
- [ ] 已添加 extends 侧测试
- [ ] 已记录与上游差异摘要（见 §7 变更日志）

### 4.3 模式 C：注册表注入

适用：新增 scene type、Provider、Prompt 等可插拔能力。

```typescript
// lib/extends/registry/scene-types.ts
import type { ComponentType } from 'react';
import { MySceneRenderer } from '@components-extends/scene-renderers/my-scene';

export const extendedSceneRenderers: Record<string, ComponentType<any>> = {
  'my-scene': MySceneRenderer,
};

// extends/bootstrap.ts
import { extendedSceneRenderers } from '@lib-extends/registry/scene-types';

export function registerExtensions() {
  // 向全局 registry 或 Context 注册
}
```

**要求**：所有可插拔扩展必须经 registry 注册，禁止在多个文件散落硬编码。

---

## 5. 注册与启动规范

### 5.1 统一入口

所有扩展必须在 `extends/bootstrap.ts` 中集中注册：

```typescript
// extends/bootstrap.ts
import { registerSceneTypes } from '@lib-extends/registry/scene-types';
import { registerProviders } from '@lib-extends/registry/providers';
import { registerPrompts } from '@lib-extends/registry/prompts';

let registered = false;

export function registerExtensions() {
  if (registered) return;
  registerSceneTypes();
  registerProviders();
  registerPrompts();
  registered = true;
}
```

### 5.2 启动时机

| 场景 | 调用位置 |
|------|---------|
| 客户端 | 自定义 Layout / Provider 组件的 `useEffect`，或 `app/extends/layout.tsx` |
| 服务端 | `app/extends/api/*/route.ts` 顶部，或独立 server init |
| 测试 | `tests/extends/setup.ts` 中调用 |

**禁止**：在上游 `app/layout.tsx` 中直接 import 扩展（属于修改上游）。可选方案：

- 使用 `app/extends/layout.tsx` 包裹扩展页面
- 或在二开允许的 `next.config.ts` 中通过 rewrites 注入（需文档化）

---

## 6. 与上游版本合并规范

### 6.1 日常开发流程

```bash
# 1. 拉取上游更新
git fetch upstream
git merge upstream/main   # 或 rebase，按团队规范

# 2. 仅检查基础设施冲突
#    tsconfig.json / next.config.json / package.json

# 3. 运行验证
pnpm install
pnpm lint
npx tsc --noEmit
pnpm test
pnpm test:e2e   # 含 e2e/extends

# 4. 若上游改了被 copy 的源文件，手动 sync extends 副本
```

### 6.2 冲突处理优先级

| 文件类型 | 处理策略 |
|---------|---------|
| `*/extends/**` | 始终保留本地（上游不存在） |
| `tsconfig.json`、`next.config.ts` | 手动合并：保留上游更新 + 保留本地 aliases |
| `package.json` | 合并 dependencies；extends 新增依赖写在 dependencies 中并注释 |
| 上游业务文件 | **一律采用上游版本**，禁止保留本地 inline 修改 |

### 6.3 Copy 文件同步

维护 `extends/SYNC_MANIFEST.md`，记录所有 copy 改造文件：

```markdown
| 扩展文件 | 上游源文件 | 上次同步上游版本 | 差异摘要 |
|---------|-----------|-----------------|---------|
| components/extends/stage/scene-renderer.tsx | components/stage/scene-renderer.tsx | v0.2.1 | 增加 my-scene case |
```

每次上游升级后，按 manifest 逐项 diff。

---

## 7. 命名与代码风格

### 7.1 命名约定

| 类型 | 规范 | 示例 |
|------|------|------|
| 目录 | `kebab-case` | `scene-renderers/` |
| React 组件文件 | `kebab-case.tsx` | `my-scene-renderer.tsx` |
| 组件名 | `PascalCase` | `MySceneRenderer` |
| 扩展组件 | `Ext` / `Custom` 前缀 | `ExtSceneRenderer` |
| Hook | `use` 前缀 | `useCustomGeneration` |
| Registry 文件 | 复数名词 | `scene-types.ts` |
| Prompt ID | `kebab-case` | `my-custom-quiz` |
| 环境变量 | `SCREAMING_SNAKE` | `MY_API_KEY` |

### 7.2 代码风格

- 遵循项目现有 ESLint / Prettier 配置（`pnpm format`、`pnpm lint`）
- Import 放在文件顶部，禁止 inline import（与项目规则一致）
- TypeScript 联合类型分支使用 exhaustive switch
- 扩展代码注释使用中文或英文均可，但 `@extends-from` 元数据必须英文键名

### 7.3 Git 提交规范

```
ext(<scope>): <简短描述>

scope 示例: scene, provider, prompt, ui, api, config
```

示例：

```
ext(scene): add my-scene renderer and registry
ext(provider): add custom LLM adapter
ext(api): add /extends/api/crm-sync route
```

---

## 8. 测试规范

### 8.1 必须测试的场景

- 新增 API Route
- 复制改造的核心业务逻辑
- 新 Provider 适配器
- 新 scene type 的渲染与生成链路

### 8.2 测试文件位置

```
tests/extends/generation/custom-scene.test.ts
tests/extends/registry/scene-types.test.ts
e2e/extends/custom-dashboard.spec.ts
```

### 8.3 测试命名

- 单元测试：`*.extends.test.ts` 或放在 `tests/extends/` 下
- E2E：`e2e/extends/<feature>.spec.ts`

---

## 9. 安全与配置

- 密钥、Token 只放在 `.env.local`、`server-providers.yml`（已在 `.gitignore`）
- 扩展 API 需复用上游 `@/lib/server/ssrf-guard` 等安全工具，不自行绕过
- 对外暴露的新 API 应做鉴权（Access Code 或自有 SSO）
- `public/extends/` 不存放敏感配置

---

## 10. 快速决策表

| 我想… | 应该… | 不应… |
|------|------|------|
| 加新页面 | `app/extends/xxx/page.tsx` | 改 `app/page.tsx` |
| 加新 API | `app/extends/api/xxx/route.ts` | 改 `app/api/chat/route.ts` |
| 改首页 UI | `components/extends/generation/` 复制改造 + registry | 直接改 `components/generation/*` |
| 加新场景类型 | `components/extends/scene-renderers/` + `lib/extends/registry/` | 改 `scene-renderer.tsx` 上游文件 |
| 改 Prompt | `lib/extends/prompts/templates/` | 改 `lib/prompts/templates/` |
| 加 LLM Provider | `lib/extends/ai/providers/` + registry | 改 `lib/ai/providers.ts` |
| 改主题色 | `configs/extends/theme.override.ts` | 改 `configs/theme.ts` |
| 改 logo | `public/extends/logos/` | 覆盖 `public/logos/` |
| 改 pptx 导出 | 新建 workspace 包或 fork `packages/pptxgenjs` | 改 `packages/pptxgenjs/src/` |

---

## 11. 新功能开发检查清单

提交前逐项确认：

- [ ] 未修改任何上游业务源文件
- [ ] 代码位于正确的 `*/extends/` 目录
- [ ] 已在 `extends/bootstrap.ts` 或对应 registry 注册
- [ ] 若 copy 改造，已添加 `@extends-from` 注释并更新 `SYNC_MANIFEST.md`
- [ ] 已添加/更新 `tests/extends/` 或 `e2e/extends/` 测试
- [ ] `pnpm lint` 与 `npx tsc --noEmit` 通过
- [ ] 提交信息使用 `ext(scope):` 前缀
- [ ] 无密钥或内部 URL 硬编码

---

## 12. 附录：上游主要目录速查

| 上游目录 | 职责 | 二开映射 |
|---------|------|---------|
| `app/` | 路由与 API | `app/extends/` |
| `components/` | React UI | `components/extends/` |
| `lib/generation/` | 内容生成 | `lib/extends/generation/` |
| `lib/orchestration/` | Agent 编排 | `lib/extends/orchestration/` |
| `lib/prompts/` | Prompt 模板 | `lib/extends/prompts/` |
| `lib/ai/` | LLM Provider | `lib/extends/ai/` |
| `lib/server/` | 服务端逻辑 | `lib/extends/server/` |
| `lib/store/` | 客户端状态 | `lib/extends/store/` |
| `configs/` | 静态配置 | `configs/extends/` |
| `packages/` | 子包 | 新建 package 或 fork，不用 extends |

---

## 13. 文档维护

- 本文档路径：`extends/DEVELOPMENT_GUIDE.md`
- 复制改造清单：`extends/SYNC_MANIFEST.md`（随 copy 文件维护）
- 上游版本记录：在 `extends/UPSTREAM_VERSION` 中记录当前跟踪的上游 tag/commit

```text
# extends/UPSTREAM_VERSION
upstream=THU-MAIC/OpenMAIC
version=v0.2.1
commit=xxxxxxxx
last_sync=2026-05-22
```

---

**如有疑问或需新增扩展模式，请在团队内评审后更新本文档版本号。**
