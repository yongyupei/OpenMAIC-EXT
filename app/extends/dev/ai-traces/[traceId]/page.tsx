import { notFound } from 'next/navigation';
import { isDevUiEnabled } from '@lib-extends/observability/access-control';
import { DevTraceDetailClient } from '../components/dev-trace-detail-client';

export const dynamic = 'force-dynamic';

type PageProps = { readonly params: Promise<{ traceId: string }> };

export default async function DevAiTraceDetailPage({ params }: PageProps) {
  if (!isDevUiEnabled()) notFound();
  const { traceId } = await params;
  if (!traceId) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8">
      <DevTraceDetailClient traceId={traceId} />
    </main>
  );
}
