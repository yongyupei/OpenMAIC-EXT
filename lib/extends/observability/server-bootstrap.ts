import { scheduleAiTraceCleanup } from './trace-sink';
import { resolveAiTraceConfig } from './config';

/** Server-only startup TTL cleanup (do not import from client bundles). */
export async function runAiTraceStartupCleanup(): Promise<void> {
  const cfg = resolveAiTraceConfig();
  if (cfg.detail === 'off') return;
  await scheduleAiTraceCleanup({
    rootDir: process.env.AI_TRACE_ROOT_DIR ?? 'data/ai-traces',
    retentionDays: cfg.retentionDays,
  });
}
