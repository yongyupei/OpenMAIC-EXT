import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let tmpDir = '';

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-traces-cli-'));
  process.env.AI_TRACE_ROOT_DIR = tmpDir;
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(
    join(tmpDir, 'index.jsonl'),
    JSON.stringify({
      traceId: 'cli-a',
      kind: 'chapter-generation',
      status: 'error',
      startedAt: '2026-05-28T05:00:00.000Z',
      errorSummary: 'AI_RetryError 502',
      context: { projectId: 'p1' },
      file: '2026-05-28/cli-a.jsonl',
    }) + '\n',
  );
});

afterEach(() => {
  delete process.env.AI_TRACE_ROOT_DIR;
  if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function runCli(args: string[]): { stdout: string; status: number | null } {
  const script = fileURLToPath(
    new URL('../../../lib/extends/observability/cli/inspect.ts', import.meta.url),
  );
  const tsxCli = join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const result = spawnSync(process.execPath, [tsxCli, script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, AI_TRACE_ROOT_DIR: tmpDir },
    timeout: 25_000,
  });
  return { stdout: result.stdout ?? '', status: result.status };
}

describe('trace:inspect CLI list/search', () => {
  test(
    '--list prints trace id',
    () => {
      const { stdout, status } = runCli(['--list']);
      expect(status).toBe(0);
      expect(stdout).toContain('cli-a');
    },
    30_000,
  );

  test(
    '--search matches errorSummary',
    () => {
      const { stdout, status } = runCli(['--search', 'AI_RetryError']);
      expect(status).toBe(0);
      expect(stdout).toContain('cli-a');
    },
    30_000,
  );
});
