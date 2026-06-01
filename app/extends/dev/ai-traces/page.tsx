import { notFound } from 'next/navigation';
import { isDevUiEnabled } from '@lib-extends/observability/access-control';
import { DevTraceListPage } from './components/dev-trace-list-page';

export const dynamic = 'force-dynamic';

export default function DevAiTracesPage() {
  if (!isDevUiEnabled()) notFound();

  return <DevTraceListPage />;
}
