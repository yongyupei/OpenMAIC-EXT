# 知识库管理模块 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现全局知识库（树形目录 + 多格式文件 + AI 确认后规划目录），支持首页/教师课程挂载引用，并与章节本地上传参考资料合并注入生成链路。

**架构：** 服务端 `data/knowledge-base/` 存 `meta.json` + `tree.json` + 文件二进制；挂载仅存 `nodeId[]`。`resolveKnowledgeMountContext` 展开文件夹并抽取文本，与 `chapter-reference` 抽取结果经 `mergeReferenceSources` 合并后注入现有 prompt。AI 输出 `PlanOperation[]` 写入 proposal，用户 apply 后原子更新树。

**技术栈：** Next.js App Router、React 19、Zod、`nanoid`、`fs/promises`、`extractChapterReferenceText`、`callLLM`、`writeJsonFileAtomic`、Vitest、i18next

**设计规格：** `docs/superpowers/specs/2026-05-20-knowledge-base-design.md`

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `lib/knowledge-base/types.ts` | 实体与 PlanOperation 类型 |
| `lib/knowledge-base/constants.ts` | 目录路径、`DEFAULT_KB_ID`、截断长度 |
| `lib/knowledge-base/file-types.ts` | allowlist（扩展章节 reference） |
| `lib/knowledge-base/storage.ts` | 读写 meta/tree、原子 revision |
| `lib/knowledge-base/tree-utils.ts` | 展开挂载、重算 displayPath、环检测 |
| `lib/knowledge-base/extract-file.ts` | 单文件抽取 + parseStatus |
| `lib/knowledge-base/resolve-mount-context.ts` | 挂载 → referenceText |
| `lib/knowledge-base/merge-reference.ts` | KB + 章节文本合并截断 |
| `lib/knowledge-base/proposal-apply.ts` | apply / discard proposal |
| `lib/knowledge-base/ai-plan.ts` | 调 LLM 生成 proposal JSON |
| `lib/knowledge-base/client.ts` | 前端 fetch 封装 |
| `lib/prompts/templates/knowledge-base-plan/system.md` | AI 规划 system |
| `lib/prompts/templates/knowledge-base-plan/user.md` | AI 规划 user |
| `app/api/knowledge-base/route.ts` | GET 整树 |
| `app/api/knowledge-base/nodes/route.ts` | POST mkdir |
| `app/api/knowledge-base/nodes/[nodeId]/route.ts` | PATCH/DELETE |
| `app/api/knowledge-base/files/route.ts` | POST 上传 |
| `app/api/knowledge-base/files/[nodeId]/download/route.ts` | GET 下载 |
| `app/api/knowledge-base/files/[nodeId]/reparse/route.ts` | POST 重解析 |
| `app/api/knowledge-base/import/route.ts` | 批量上传 + 初稿 proposal |
| `app/api/knowledge-base/ai/plan/route.ts` | 对话 proposal |
| `app/api/knowledge-base/ai/proposals/[id]/route.ts` | GET proposal |
| `app/api/knowledge-base/ai/proposals/[id]/apply/route.ts` | POST apply |
| `app/api/knowledge-base/ai/proposals/[id]/discard/route.ts` | POST discard |
| `app/api/teacher/projects/[projectId]/knowledge/route.ts` | PATCH 课程挂载 |
| `components/knowledge-base/knowledge-picker.tsx` | 选材 Popover |
| `components/knowledge-base/knowledge-tree.tsx` | 管理页树 |
| `components/knowledge-base/proposal-diff-panel.tsx` | AI diff 预览 |
| `app/knowledge-base/page.tsx` | 管理页 |
| `tests/knowledge-base/tree-utils.test.ts` | 树工具测试 |
| `tests/knowledge-base/merge-reference.test.ts` | 合并截断测试 |
| `tests/knowledge-base/proposal-apply.test.ts` | apply 测试 |
| `tests/knowledge-base/resolve-mount-context.test.ts` | 挂载解析测试（mock fs） |

**修改：**

| 文件 | 变更 |
|------|------|
| `lib/teacher/course-types.ts` | `CourseProjectKnowledge`、`knowledge?` |
| `lib/teacher/course-project-storage.ts` | `migrateForRead` 补 `knowledge` |
| `lib/types/generation.ts` | `UserRequirements.knowledgeNodeIds?` |
| `lib/server/classroom-generation.ts` | `knowledgeNodeIds` + resolve |
| `app/api/generate-classroom/route.ts` | 透传 `knowledgeNodeIds` |
| `lib/teacher/chapter-generation-enrichment.ts` | 合并课程挂载 + 章节 reference |
| `lib/teacher/homepage-handoff.ts` | 可选 `knowledgeNodeIds` handoff |
| `app/page.tsx` | 入口 + form + 传参 |
| `components/generation/llm-composer-action-row.tsx` | 知识库按钮 slot |
| `components/teacher/course-project-design-shell.tsx` | 课程挂载 UI |
| `lib/i18n/locales/*.json` | `knowledgeBase.*` |

---

## 任务 1：类型与常量

**文件：**
- 创建：`lib/knowledge-base/types.ts`
- 创建：`lib/knowledge-base/constants.ts`

- [ ] **步骤 1：创建 constants**

```typescript
// lib/knowledge-base/constants.ts
import path from 'path';

export const DEFAULT_KB_ID = 'default';
export const KNOWLEDGE_BASE_DIR = path.join(process.cwd(), 'data', 'knowledge-base');
export const KNOWLEDGE_BASE_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const KNOWLEDGE_REFERENCE_MAX_CHARS = 6_000;
export const KNOWLEDGE_PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000;
```

- [ ] **步骤 2：创建 types（与规格 1.2 一致）**

从 `docs/superpowers/specs/2026-05-20-knowledge-base-design.md` 复制 `KnowledgeBaseMeta`、`KnowledgeNode`、`KnowledgeFileMeta`、`KnowledgeMount`、`CourseProjectKnowledge`、`PlanOperation`、`AiPlanProposal`，并增加：

```typescript
export interface KnowledgeTreeDocument {
  revision: number;
  nodes: KnowledgeNode[];
}

export type KnowledgeFileCategory =
  | 'pdf' | 'word' | 'excel' | 'powerpoint' | 'text' | 'html' | 'image' | 'archive' | 'media' | 'unknown';
```

- [ ] **步骤 3：Commit**

```bash
git add lib/knowledge-base/types.ts lib/knowledge-base/constants.ts
git commit -m "feat(knowledge-base): add types and constants"
```

---

## 任务 2：文件类型 allowlist

**文件：**
- 创建：`lib/knowledge-base/file-types.ts`
- 创建：`tests/knowledge-base/file-types.test.ts`

- [ ] **步骤 1：编写失败测试**

```typescript
// tests/knowledge-base/file-types.test.ts
import { describe, expect, test } from 'vitest';
import {
  getKnowledgeFileCategory,
  isKnowledgeFileAllowed,
  isKnowledgeLegacyFormat,
  KNOWLEDGE_FILE_ACCEPT,
} from '@/lib/knowledge-base/file-types';

describe('isKnowledgeFileAllowed', () => {
  test('allows pdf and html', () => {
    expect(isKnowledgeFileAllowed('a.pdf')).toBe(true);
    expect(isKnowledgeFileAllowed('page.html', 'text/html')).toBe(true);
  });
  test('allows common images', () => {
    expect(isKnowledgeFileAllowed('photo.png', 'image/png')).toBe(true);
  });
  test('rejects unknown ext', () => {
    expect(isKnowledgeFileAllowed('virus.exe')).toBe(false);
  });
});

describe('isKnowledgeLegacyFormat', () => {
  test('flags .doc', () => {
    expect(isKnowledgeLegacyFormat('old.doc')).toBe(true);
  });
});
```

- [ ] **步骤 2：运行确认失败**

`pnpm test tests/knowledge-base/file-types.test.ts` → 模块未找到

- [ ] **步骤 3：实现 file-types**

- 从 `lib/teacher/chapter-reference-file-types.ts` **re-export** 或包装 `isChapterReferenceFileAllowed` 等，并扩展：
  - `html`, `htm`
  - `jpg`, `jpeg`, `png`, `webp`, `gif`
  - `zip`（allowed 但 category `archive`，parse `unsupported`）
  - `mp3`, `mp4`, `wav`（category `media`）
- 导出 `KNOWLEDGE_FILE_ACCEPT` 供 `<input accept>` 使用。

- [ ] **步骤 4：运行测试通过**

- [ ] **步骤 5：Commit**

---

## 任务 3：存储层与树工具

**文件：**
- 创建：`lib/knowledge-base/storage.ts`
- 创建：`lib/knowledge-base/tree-utils.ts`
- 创建：`tests/knowledge-base/tree-utils.test.ts`

- [ ] **步骤 1：tree-utils 失败测试**

```typescript
// tests/knowledge-base/tree-utils.test.ts
import { describe, expect, test } from 'vitest';
import {
  expandNodeIdsToFileNodes,
  recomputeDisplayPaths,
  wouldCreateCycle,
} from '@/lib/knowledge-base/tree-utils';
import type { KnowledgeNode } from '@/lib/knowledge-base/types';

const nodes: KnowledgeNode[] = [
  { id: 'root', parentId: null, type: 'folder', name: 'Root', displayPath: '/', sortOrder: 0, createdAt: '', updatedAt: '' },
  { id: 'f1', parentId: 'root', type: 'folder', name: 'Docs', displayPath: '/Docs', sortOrder: 0, createdAt: '', updatedAt: '' },
  { id: 'file1', parentId: 'f1', type: 'file', name: 'a.pdf', displayPath: '/Docs/a.pdf', sortOrder: 0, createdAt: '', updatedAt: '', file: { storageKey: 'file1', originalName: 'a.pdf', mimeType: 'application/pdf', size: 1, category: 'pdf', parseStatus: 'ready' } },
];

describe('expandNodeIdsToFileNodes', () => {
  test('expands folder to descendant files', () => {
    const files = expandNodeIdsToFileNodes(['f1'], nodes);
    expect(files.map((n) => n.id)).toEqual(['file1']);
  });
  test('returns file when mounting file id', () => {
    const files = expandNodeIdsToFileNodes(['file1'], nodes);
    expect(files).toHaveLength(1);
  });
});

describe('wouldCreateCycle', () => {
  test('detects moving parent into child', () => {
    expect(wouldCreateCycle('root', 'f1', nodes)).toBe(true);
  });
});
```

- [ ] **步骤 2：实现 tree-utils.ts**

- `expandNodeIdsToFileNodes(nodeIds, nodes)`
- `recomputeDisplayPaths(nodes)` — 从 root 广度优先
- `wouldCreateCycle(nodeId, newParentId, nodes)`
- `findNode(nodes, id)`

- [ ] **步骤 3：实现 storage.ts**

- `ensureKnowledgeBaseInitialized()` — 无 meta 时创建 default root
- `readKnowledgeMeta()` / `writeKnowledgeMeta()`
- `readKnowledgeTree()` / `writeKnowledgeTree(tree, expectedRevision?)` — 使用 `writeJsonFileAtomic`；revision 冲突抛 `KnowledgeRevisionConflictError`
- 路径：`meta.json`, `tree.json`

- [ ] **步骤 4：测试通过**

`pnpm test tests/knowledge-base/tree-utils.test.ts`

- [ ] **步骤 5：Commit**

---

## 任务 4：参考文本合并

**文件：**
- 创建：`lib/knowledge-base/merge-reference.ts`
- 创建：`tests/knowledge-base/merge-reference.test.ts`

- [ ] **步骤 1：失败测试**

```typescript
import { describe, expect, test } from 'vitest';
import { mergeReferenceSources } from '@/lib/knowledge-base/merge-reference';

describe('mergeReferenceSources', () => {
  test('concatenates kb and chapter with separator', () => {
    const out = mergeReferenceSources('KB text', 'Chapter text');
    expect(out).toContain('KB text');
    expect(out).toContain('Chapter text');
  });
  test('truncates to max chars', () => {
    const long = 'a'.repeat(10_000);
    const out = mergeReferenceSources(long, undefined, 100);
    expect(out.length).toBeLessThanOrEqual(103);
  });
  test('dedupes identical blocks', () => {
    const out = mergeReferenceSources('same', 'same');
    expect(out.match(/same/g)?.length).toBe(1);
  });
});
```

- [ ] **步骤 2：实现 merge-reference.ts**

```typescript
import { KNOWLEDGE_REFERENCE_MAX_CHARS } from '@/lib/knowledge-base/constants';

export function mergeReferenceSources(
  kbText?: string,
  chapterText?: string,
  maxChars = KNOWLEDGE_REFERENCE_MAX_CHARS,
): string {
  const parts: string[] = [];
  const kb = kbText?.trim();
  const ch = chapterText?.trim();
  if (kb) parts.push(kb);
  if (ch && ch !== kb) parts.push(ch);
  const joined = parts.join('\n\n---\n\n');
  if (joined.length <= maxChars) return joined;
  return `${joined.slice(0, maxChars)}\n…`;
}
```

- [ ] **步骤 3：测试通过 + Commit**

---

## 任务 5：文件抽取与挂载解析

**文件：**
- 创建：`lib/knowledge-base/extract-file.ts`
- 创建：`lib/knowledge-base/resolve-mount-context.ts`
- 创建：`tests/knowledge-base/resolve-mount-context.test.ts`

- [ ] **步骤 1：extract-file.ts**

- `async function extractKnowledgeFile(node: KnowledgeNode): Promise<{ text: string; parseStatus: KnowledgeParseStatus }>`
- 读 `path.join(KNOWLEDGE_BASE_DIR, 'files', node.id, ...)` 
- 复用 `extractChapterReferenceText(buffer, originalName)`；`.html` 用简单 strip tags（`replace(/<[^>]+>/g, ' ')`）或 `node-html-parser` 若项目已有
- 图片 → `parseStatus: 'partial'`, text = `[Image: ${name}]`
- 失败 → `failed` + `parseError`

- [ ] **步骤 2：resolve-mount-context 测试（mock readKnowledgeTree）**

使用 `vi.mock('@/lib/knowledge-base/storage')` 返回 fixture 树，断言 `referenceText` 含文件名、 `missingNodeIds` 含无效 id。

- [ ] **步骤 3：实现 resolve-mount-context.ts**

```typescript
export async function resolveKnowledgeMountContext(nodeIds: string[]): Promise<{
  referenceText: string;
  missingNodeIds: string[];
  unsupported: string[];
}> {
  if (nodeIds.length === 0) return { referenceText: '', missingNodeIds: [], unsupported: [] };
  const { nodes } = await readKnowledgeTree();
  const fileNodes = expandNodeIdsToFileNodes(nodeIds, nodes);
  const missingNodeIds = nodeIds.filter((id) => !nodes.some((n) => n.id === id) && !fileNodes.some((f) => f.id === id));
  // ... load extract cache from extracts/{id}.txt or call extractKnowledgeFile, write cache
  // build referenceText with ### headers per file
}
```

- [ ] **步骤 4：测试通过 + Commit**

---

## 任务 6：Proposal apply

**文件：**
- 创建：`lib/knowledge-base/proposal-apply.ts`
- 创建：`tests/knowledge-base/proposal-apply.test.ts`

- [ ] **步骤 1：测试 mkdir + assign 序列**

内存 fixture：`applyProposalOperations(nodes, operations, stagingFiles)` 纯函数版本便于单测；磁盘版 `applyKnowledgeProposal(proposalId)` 调 storage。

- [ ] **步骤 2：实现 apply 顺序**

1. 备份 `tree.json` → `tree.json.bak`
2. `mkdir`（tempId → real id map）
3. `assign`（staging → `files/{nodeId}/`）
4. `move` / `rename`
5. `delete` / `remove`（删磁盘）
6. `recomputeDisplayPaths`
7. `revision++`, 写 tree, proposal status `applied`

- [ ] **步骤 3：discardProposal(id)** — status `discarded`，删 staging

- [ ] **步骤 4：测试 + Commit**

---

## 任务 7：知识库 CRUD API

**文件：**
- 创建：`app/api/knowledge-base/route.ts`
- 创建：`app/api/knowledge-base/nodes/route.ts`
- 创建：`app/api/knowledge-base/nodes/[nodeId]/route.ts`
- 创建：`app/api/knowledge-base/files/route.ts`
- 创建：`app/api/knowledge-base/files/[nodeId]/download/route.ts`
- 创建：`app/api/knowledge-base/files/[nodeId]/reparse/route.ts`

- [ ] **步骤 1：GET `/api/knowledge-base`**

- `ensureKnowledgeBaseInitialized()`
- 返回 `{ meta, nodes }` via `apiSuccess`

- [ ] **步骤 2：POST nodes — mkdir**

Body zod: `{ parentId: string | null, name: string }`  
- 校验 name 非空、无环、`parentId` 存在  
- `nanoid(10)` 新节点，`type: 'folder'`

- [ ] **步骤 3：PATCH/DELETE `[nodeId]`**

- PATCH: `{ parentId?, name? }` — 人工移动/重命名  
- DELETE: 递归删子节点 + `files/` + `extracts/`

- [ ] **步骤 4：POST files — multipart**

- Fields: `file`, `parentId`  
- 校验 `isKnowledgeFileAllowed`, size, legacy 拒绝  
- 创建 `type: 'file'` 节点，写磁盘，`extractKnowledgeFile` 异步或同步写 extract  
- 返回 `{ node }`

- [ ] **步骤 5：GET download / POST reparse**

- download: `Content-Disposition` attachment  
- reparse: 更新 `file.parseStatus` + extract 文件

- [ ] **步骤 6：手动冒烟**

```bash
curl -s http://localhost:3000/api/knowledge-base | head
```

- [ ] **步骤 7：Commit**

---

## 任务 8：AI 规划 API（Phase 1：导入初稿）

**文件：**
- 创建：`lib/prompts/templates/knowledge-base-plan/system.md`
- 创建：`lib/prompts/templates/knowledge-base-plan/user.md`
- 创建：`lib/knowledge-base/ai-plan.ts`
- 创建：`app/api/knowledge-base/import/route.ts`
- 创建：`app/api/knowledge-base/ai/plan/route.ts`
- 创建：`app/api/knowledge-base/ai/proposals/[id]/route.ts`
- 创建：`app/api/knowledge-base/ai/proposals/[id]/apply/route.ts`
- 创建：`app/api/knowledge-base/ai/proposals/[id]/discard/route.ts`

- [ ] **步骤 1：Prompt 模板**

system.md 要求：
- 只输出 JSON `{ "summary": string, "operations": PlanOperation[] }`
- 禁止删除 root
- `assign.tempFileId` 必须来自提供的 staging 列表

user.md 插值：`{{treeJson}}`, `{{stagingFiles}}`, `{{userMessage}}`

- [ ] **步骤 2：ai-plan.ts**

```typescript
export async function createKnowledgePlanProposal(input: {
  message?: string;
  stagingUploadId?: string;
}): Promise<AiPlanProposal> {
  // read tree, staging manifest
  // callLLM with templates
  // zod parse operations
  // write proposals/{id}.json
}
```

- [ ] **步骤 3：POST import**

- 多文件 multipart → `uploads-staging/{uploadId}/manifest.json`
- 调 `createKnowledgePlanProposal({ stagingUploadId })`
- 返回 `{ proposalId, proposal }`

- [ ] **步骤 4：POST ai/plan** — body `{ message: string }`

- [ ] **步骤 5：GET/apply/discard proposals**

- apply 调 `applyKnowledgeProposal`；409 on revision conflict

- [ ] **步骤 6：Commit**

---

## 任务 9：课程项目挂载

**文件：**
- 修改：`lib/teacher/course-types.ts`
- 修改：`lib/teacher/course-project-storage.ts`
- 创建：`app/api/teacher/projects/[projectId]/knowledge/route.ts`

- [ ] **步骤 1：扩展类型**

```typescript
// course-types.ts
export interface CourseProjectKnowledge {
  mount: { nodeIds: string[] };
  chapterExclusions?: Record<string, string[]>;
}
// CourseProject 增加 knowledge?: CourseProjectKnowledge;
```

- [ ] **步骤 2：migrateForRead** — `knowledge` 缺省为 `undefined`

- [ ] **步骤 3：PATCH knowledge route**

```typescript
// body: { nodeIds: string[] }
// validate project exists, nodeIds are valid kb ids (optional warn)
// project.knowledge = { mount: { nodeIds } }; writeTeacherProject
```

- [ ] **步骤 4：Commit**

---

## 任务 10：生成链路接入

**文件：**
- 修改：`lib/types/generation.ts`
- 修改：`lib/server/classroom-generation.ts`
- 修改：`app/api/generate-classroom/route.ts`
- 修改：`lib/teacher/chapter-generation-enrichment.ts`
- 修改：`app/api/teacher/projects/[projectId]/generate-outline/route.ts`（及 generate-chapter 若单独传 pdfText）

- [ ] **步骤 1：UserRequirements + GenerateClassroomInput**

```typescript
knowledgeNodeIds?: string[];
```

- [ ] **步骤 2：classroom-generation.ts**

在 `generateClassroom` 开始处：

```typescript
let kbText = '';
if (input.knowledgeNodeIds?.length) {
  const ctx = await resolveKnowledgeMountContext(input.knowledgeNodeIds);
  kbText = ctx.referenceText;
}
const pdfText = [kbText, pdfContent?.text].filter(Boolean).join('\n\n') || undefined;
// 现有 outline 使用 pdfText 变量处改为合并后的文本；images 仍来自 pdfContent?.images
```

- [ ] **步骤 3：generate-classroom route** 透传 `knowledgeNodeIds`

- [ ] **步骤 4：chapter-generation-enrichment.ts**

在 `buildChapterOutlineEnrichment` 内：

```typescript
const projectMountIds = project.knowledge?.mount.nodeIds ?? [];
const excluded = project.knowledge?.chapterExclusions?.[chapter.id] ?? [];
const effectiveIds = projectMountIds.filter((id) => !excluded.includes(id));
const kbCtx = effectiveIds.length ? await resolveKnowledgeMountContext(effectiveIds) : { referenceText: '' };
// 现有 chapter reference extract → mergeReferenceSources(kbCtx.referenceText, chapterExtract)
```

- [ ] **步骤 5：运行相关测试**

`pnpm test tests/teacher/chapter-generation-input.test.ts`  
`pnpm test tests/knowledge-base/`

- [ ] **步骤 6：Commit**

---

## 任务 11：前端 client 与 KnowledgePicker

**文件：**
- 创建：`lib/knowledge-base/client.ts`
- 创建：`components/knowledge-base/knowledge-picker.tsx`

- [ ] **步骤 1：client.ts**

```typescript
export async function fetchKnowledgeBase(): Promise<{ meta: KnowledgeBaseMeta; nodes: KnowledgeNode[] }> {
  const res = await fetch('/api/knowledge-base');
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? 'Failed to load knowledge base');
  return json.data;
}
```

及 `uploadKnowledgeFile`, `updateProjectKnowledgeMount` 等。

- [ ] **步骤 2：KnowledgePicker**

- Props: `selectedNodeIds`, `onChange`, `disabled?`
- `useEffect` load tree；Checkbox 树；已选 chips
- 使用 `useI18n` — keys 见任务 14

- [ ] **步骤 3：Commit**

---

## 任务 12：知识库管理页

**文件：**
- 创建：`app/knowledge-base/page.tsx`
- 创建：`components/knowledge-base/knowledge-tree.tsx`
- 创建：`components/knowledge-base/proposal-diff-panel.tsx`

- [ ] **步骤 1：page 布局**

- Client component；左侧 `KnowledgeTree`，右侧详情
- 上传 input、`fetchKnowledgeBase` 刷新
- 选中文件节点：显示 parseStatus、下载链接、重新解析

- [ ] **步骤 2：KnowledgeTree**

- 文件夹展开/折叠；选中高亮
- 操作：新建文件夹、删除（`confirm`）、上传到此目录
- 「批量导入」→ 多选 file input → POST `/api/knowledge-base/import` → 打开 `ProposalDiffPanel`

- [ ] **步骤 3：ProposalDiffPanel**

- 列出 operations 人类可读摘要
- 按钮 Apply → POST apply；Discard → POST discard

- [ ] **步骤 4：AI 对话区（Phase 1.5 可标 TODO 在 PR）**

MVP 若时间紧：仅 import 触发 proposal；对话 POST `/api/knowledge-base/ai/plan` 可在 Phase 1.5 加 textarea。

- [ ] **步骤 5：Commit**

---

## 任务 13：首页入口与快速生成

**文件：**
- 修改：`app/page.tsx`
- 修改：`components/generation/llm-composer-action-row.tsx`
- 修改：`lib/teacher/homepage-handoff.ts`（可选）

- [ ] **步骤 1：首页 pill 增加 Library 按钮**

在 Settings 左侧：

```tsx
import { Library } from 'lucide-react';
import Link from 'next/link';
// ...
<Link href="/knowledge-base" className="p-2 rounded-full ...">
  <Library className="w-4 h-4" />
</Link>
```

Tooltip: `t('knowledgeBase.openManager')`

- [ ] **步骤 2：FormState 增加 knowledgeNodeIds**

```typescript
knowledgeNodeIds: string[];
```

- [ ] **步骤 3：LlmComposerActionRow 增加可选 prop**

```typescript
knowledgeNodeIds?: string[];
onKnowledgeNodeIdsChange?: (ids: string[]) => void;
```

渲染 `<KnowledgePicker />` 当 callback 存在时。

- [ ] **步骤 4：handleEnterClassroom / 生成请求**

找到跳转 `generation-preview` 或调用 generate API 处，传入 `knowledgeNodeIds`（与 requirement、pdf 同级）。

- [ ] **步骤 5：handoff（教师路径）**

扩展 `TeacherHomepageRequirement`：

```typescript
knowledgeNodeIds?: string[];
```

`storeTeacherHomepageRequirement` 接受第二参数或在 object 内。

- [ ] **步骤 6：Commit**

---

## 任务 14：教师设计工作台挂载

**文件：**
- 修改：`components/teacher/course-project-design-shell.tsx` 或 `components/teacher/design-workbench/course-overview-block.tsx`

- [ ] **步骤 1：课程概览区增加「课程知识库」卡片**

- `<KnowledgePicker selectedNodeIds={...} onChange={async (ids) => { await patchProjectKnowledge(projectId, ids); reload project; }} />`
- 说明文案：章节参考资料仍为补充

- [ ] **步骤 2：不改动 ChapterReferenceField**

- [ ] **步骤 3：Commit**

---

## 任务 15：i18n

**文件：**
- 修改：`lib/i18n/locales/en-US.json`, `zh-CN.json`, 及其他 `supportedLocales`

- [ ] **步骤 1：添加 keys（示例）**

```json
"knowledgeBase": {
  "openManager": "Knowledge base",
  "title": "Knowledge base",
  "upload": "Upload files",
  "newFolder": "New folder",
  "parseStatus": {
    "ready": "Ready",
    "pending": "Pending",
    "partial": "Partial",
    "unsupported": "Not used in generation",
    "failed": "Failed"
  },
  "proposal": {
    "pendingTitle": "Pending AI organization plan",
    "apply": "Apply plan",
    "discard": "Discard"
  },
  "picker": {
    "label": "Knowledge base",
    "empty": "No files selected"
  },
  "courseMount": {
    "title": "Course knowledge sources",
    "hint": "Referenced files are not copied. Chapter uploads remain available as supplements."
  }
}
```

- [ ] **步骤 2：运行**

`pnpm check:i18n-keys`

- [ ] **步骤 3：Commit**

---

## 任务 16：验证与收尾

- [ ] **步骤 1：全量测试**

```bash
pnpm test tests/knowledge-base/
pnpm test tests/teacher/chapter-generation-input.test.ts
npx tsc --noEmit
pnpm lint
```

- [ ] **步骤 2：手动 E2E 清单**

1. `/knowledge-base` 上传 `test.pdf` → parse ready  
2. 首页选知识库 → 快速生成 → 大纲 prompt 含 PDF 文本片段  
3. 教师项目挂载 → 章节生成 brief 含知识库 + 章节 reference  
4. import 多文件 → proposal → apply → 树结构更新  

- [ ] **步骤 3：更新 `.gitignore`（如需要）**

确认 `data/knowledge-base/` 与 `data/teacher-projects/` 同样处理（通常已在 gitignore）。

- [ ] **步骤 4：最终 Commit**

```bash
git commit -m "feat(knowledge-base): complete MVP integration"
```

---

## 规格覆盖度自检

| 规格需求 | 计划任务 |
|----------|----------|
| 全局库 + 挂载不复制 | 任务 3–5, 9 |
| 单用户 MVP + ownerId 预留 | 任务 1 meta 字段 |
| 课程 + 首页选材 | 任务 10, 13, 14 |
| 章节本地上传保留 | 任务 10 merge, 14 不改 reference |
| AI 确认后 apply + 可移动 | 任务 6, 8 |
| 全格式 / MVP 核心解析 | 任务 2, 5 |
| 管理页 + 首页入口 | 任务 12, 13 |
| i18n | 任务 15 |
| RAG / 多用户 / ZIP 解压 | 不在 MVP（规格非目标） |
| AI 对话微调 | 任务 8 API + 任务 12 Phase 1.5 注记 |

## 执行交接

计划已保存到 `docs/superpowers/plans/2026-05-20-knowledge-base.md`。

**两种执行方式：**

1. **子代理驱动（推荐）** — 每个任务调度新子代理，任务间代码审查；配合 `subagent-driven-development` 技能。  
2. **内联执行** — 当前会话按任务顺序实现；配合 `executing-plans` 技能，每 2–3 个任务设检查点。

**你希望用哪种方式开始实现？** 若直接开始，回复「子代理」或「内联」即可。
