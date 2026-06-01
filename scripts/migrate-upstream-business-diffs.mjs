/**
 * Migrate remaining upstream-path business diffs into extends/ + restore upstream copies.
 * Run: node scripts/migrate-upstream-business-diffs.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UP = path.resolve(ROOT, '../OpenMAIC');

/** @type {Array<[upstreamRel: string, extendsRel: string]>} */
const COPY_FORK_TO_EXTENDS = [
  ['components/agent/agent-bar.tsx', 'components/extends/agent/agent-bar.tsx'],
  ['components/chat/session-list.tsx', 'components/extends/chat/session-list.tsx'],
  ['components/chat/use-chat-sessions.ts', 'components/extends/chat/use-chat-sessions.ts'],
  ['components/settings/agent-settings.tsx', 'components/extends/settings/agent-settings.tsx'],
  ['lib/chat/agent-loop.ts', 'lib/extends/chat/agent-loop.ts'],
  ['lib/orchestration/director-graph.ts', 'lib/extends/orchestration/director-graph.ts'],
  ['lib/types/chat.ts', 'lib/extends/types/chat.ts'],
  ['lib/prompts/templates/agent-system/system.md', 'lib/extends/prompts/templates/agent-system/system.md'],
  ['lib/store/settings.ts', 'lib/extends/store/settings.ts'],
  ['lib/prompts/templates/director/system.md', 'lib/extends/prompts/templates/director/system.md'],
];

/** Restore upstream only (no runtime alias needed). */
const RESTORE_UPSTREAM_ONLY = [
  'eval/whiteboard-layout/runner.ts',
  ...['ar-SA', 'en-US', 'ja-JP', 'pt-BR', 'ru-RU', 'zh-CN', 'zh-TW'].map(
    (code) => `lib/i18n/locales/${code}.json`,
  ),
];

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

for (const [upstreamRel, extendsRel] of COPY_FORK_TO_EXTENDS) {
  const forkPath = path.join(ROOT, upstreamRel);
  const extendsPath = path.join(ROOT, extendsRel);
  const upstreamPath = path.join(UP, upstreamRel);
  copyFile(forkPath, extendsPath);
  copyFile(upstreamPath, forkPath);
  console.log('migrated', upstreamRel, '->', extendsRel);
}

for (const rel of RESTORE_UPSTREAM_ONLY) {
  copyFile(path.join(UP, rel), path.join(ROOT, rel));
  console.log('restored upstream', rel);
}

// agent-loop: optional maxTurns so upstream eval (3-arg) still type-checks
const agentLoopPath = path.join(ROOT, 'lib/extends/chat/agent-loop.ts');
let agentLoop = fs.readFileSync(agentLoopPath, 'utf8');
agentLoop = agentLoop.replace(
  /export async function runAgentLoop\(\s*request: AgentLoopRequest,\s*callbacks: AgentLoopCallbacks,\s*signal: AbortSignal,\s*maxTurns: number,/,
  'export async function runAgentLoop(\n  request: AgentLoopRequest,\n  callbacks: AgentLoopCallbacks,\n  signal: AbortSignal,\n  maxTurns: number = Number.POSITIVE_INFINITY,',
);
fs.writeFileSync(agentLoopPath, agentLoop, 'utf8');
console.log('patched lib/extends/chat/agent-loop.ts (optional maxTurns)');

console.log('done');
