import path from 'node:path';

/** Resolve trace storage root to an absolute path (stable across Next.js cwd). */
export function resolveTraceRootDir(): string {
  const configured = process.env.AI_TRACE_ROOT_DIR?.trim();
  if (!configured) {
    return path.join(process.cwd(), 'data', 'ai-traces');
  }
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}
