export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { runAiTraceStartupCleanup } = await import(
        '@lib-extends/observability/server-bootstrap'
      );
      await runAiTraceStartupCleanup();
    } catch (err) {
      console.warn('[ai-trace instrumentation] cleanup failed:', err);
    }
  }
}
