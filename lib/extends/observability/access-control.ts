/**
 * Gate for developer-only surfaces (full trace view, /dev/ai-traces, raw JSONL download).
 * Teacher-facing redacted views are always allowed regardless of this flag.
 */
export function isDevUiEnabled(): boolean {
  const flag = process.env.AI_TRACE_DEV_UI;
  if (flag === '1' || flag === 'true') return true;
  if (flag === '0' || flag === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}
