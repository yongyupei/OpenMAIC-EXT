'use client';

import { Suspense } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { DevTraceListClient } from './dev-trace-list-client';

export function DevTraceListPage() {
  const { t } = useI18n();

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('observability.menuLabel')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('observability.devUi.subtitle')}</p>
      </header>
      <Suspense fallback={<p className="text-sm text-muted-foreground">{t('observability.loading')}</p>}>
        <DevTraceListClient />
      </Suspense>
    </main>
  );
}
