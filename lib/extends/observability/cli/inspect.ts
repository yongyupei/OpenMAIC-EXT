import { exit, stdout, stderr, argv } from 'node:process';
import { createJsonlTraceReader } from '../trace-reader';
import { scheduleAiTraceCleanup } from '../trace-sink';
import { resolveAiTraceConfig } from '../config';
import { parseSinceToMs } from '../parse-since';
import { formatTraceForCli, formatTraceListForCli } from './format';
import type { TraceKind, TraceStatus } from '../trace-types';

function printUsage(): void {
  stdout.write(`Usage:
  pnpm trace:inspect <traceId>            # formatted summary
  pnpm trace:inspect <traceId> --full     # include prompt/response + stack
  pnpm trace:inspect <traceId> --json     # raw JSON

  pnpm trace:inspect --list               # last 20 traces
  pnpm trace:inspect --list --limit=50 --kind=chapter-generation --status=error --since=1h
  pnpm trace:inspect --search "AI_RetryError"
  pnpm trace:inspect --gc                 # run TTL cleanup now
`);
}

function parseFlagValue(args: readonly string[], prefix: string): string | undefined {
  const direct = args.find((a) => a.startsWith(`${prefix}=`));
  if (direct) return direct.slice(prefix.length + 1);
  const idx = args.indexOf(prefix);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

async function runList(args: readonly string[]): Promise<void> {
  const limitRaw = parseFlagValue(args, '--limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
  if (!Number.isFinite(limit) || limit < 1) {
    stderr.write('Invalid --limit\n');
    exit(2);
  }

  const kind = parseFlagValue(args, '--kind') as TraceKind | undefined;
  const status = parseFlagValue(args, '--status') as TraceStatus | undefined;
  const sinceRaw = parseFlagValue(args, '--since');
  const sinceMs = parseSinceToMs(sinceRaw);
  if (Number.isNaN(sinceMs)) {
    stderr.write(`Invalid --since: ${sinceRaw}\n`);
    exit(2);
  }

  const search = parseFlagValue(args, '--search');

  const reader = createJsonlTraceReader({
    rootDir: process.env.AI_TRACE_ROOT_DIR ?? 'data/ai-traces',
  });

  const items = await reader.listTraces({
    kind,
    status,
    sinceMs: sinceMs ?? undefined,
    search,
    limit,
  });
  stdout.write(formatTraceListForCli(items) + '\n');
}

async function runSearch(args: readonly string[]): Promise<void> {
  const query = parseFlagValue(args, '--search');
  if (!query) {
    stderr.write('Error: --search requires a query string\n');
    exit(2);
  }
  const limitRaw = parseFlagValue(args, '--limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
  const reader = createJsonlTraceReader({
    rootDir: process.env.AI_TRACE_ROOT_DIR ?? 'data/ai-traces',
  });
  const items = await reader.listTraces({ search: query, limit });
  stdout.write(formatTraceListForCli(items) + '\n');
}

async function runGc(): Promise<void> {
  const config = resolveAiTraceConfig();
  const rootDir = process.env.AI_TRACE_ROOT_DIR ?? 'data/ai-traces';
  await scheduleAiTraceCleanup({ rootDir, retentionDays: config.retentionDays });
  stdout.write(`GC complete (retention ${config.retentionDays} days, root ${rootDir})\n`);
}

async function runInspectTrace(args: readonly string[]): Promise<void> {
  const traceId = args.find((a) => !a.startsWith('--'));
  if (!traceId) {
    stderr.write('Error: missing traceId\n');
    exit(2);
  }
  const full = args.includes('--full');
  const asJson = args.includes('--json');

  const reader = createJsonlTraceReader({
    rootDir: process.env.AI_TRACE_ROOT_DIR ?? 'data/ai-traces',
  });
  const detail = await reader.readTrace(traceId, { view: 'developer' });
  if (!detail) {
    stderr.write(`Trace not found: ${traceId}\n`);
    exit(1);
  }

  if (asJson) stdout.write(JSON.stringify(detail, null, 2) + '\n');
  else stdout.write(formatTraceForCli(detail, { full }) + '\n');
}

async function main(): Promise<void> {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    exit(0);
  }

  if (args.includes('--gc')) {
    await runGc();
    return;
  }

  if (args.includes('--list')) {
    await runList(args);
    return;
  }

  if (args.includes('--search')) {
    await runSearch(args);
    return;
  }

  await runInspectTrace(args);
}

void main().catch((err: unknown) => {
  stderr.write(`Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`);
  exit(1);
});
