'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { TraceKind, TraceStatus } from '@/lib/extends/observability/trace-types';

const KIND_OPTIONS: readonly TraceKind[] = [
  'chapter-generation',
  'chapter-media-generation',
  'scene-redesign',
  'preview-outline-stream',
  'preview-scene-content',
  'preview-scene-actions',
  'pbl-generation',
  'knowledge-base-ai-plan',
  'tts',
  'asr',
  'other',
];

const STATUS_OPTIONS: readonly TraceStatus[] = ['in-progress', 'ok', 'error', 'partial'];

const SINCE_VALUES = ['', '1h', '24h', '7d'] as const;

export interface TraceListFilters {
  readonly kind: string;
  readonly status: string;
  readonly since: string;
  readonly search: string;
  readonly projectId: string;
}

export function TraceFilterBar({
  filters,
  onChange,
  onApply,
}: {
  readonly filters: TraceListFilters;
  readonly onChange: (patch: Partial<TraceListFilters>) => void;
  readonly onApply: () => void;
}) {
  const { t } = useI18n();

  const sinceLabel = (value: (typeof SINCE_VALUES)[number]) => {
    if (value === '') return t('observability.devUi.filters.allTime');
    if (value === '1h') return t('observability.devUi.filters.last1h');
    if (value === '24h') return t('observability.devUi.filters.last24h');
    return t('observability.devUi.filters.last7d');
  };

  return (
    <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
      <div className="space-y-1">
        <Label htmlFor="filter-kind">{t('observability.devUi.filters.kind')}</Label>
        <select
          id="filter-kind"
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={filters.kind}
          onChange={(e) => onChange({ kind: e.target.value })}
        >
          <option value="">{t('observability.devUi.filters.all')}</option>
          {KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {t(`observability.devUi.kinds.${k}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="filter-status">{t('observability.devUi.filters.status')}</Label>
        <select
          id="filter-status"
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={filters.status}
          onChange={(e) => onChange({ status: e.target.value })}
        >
          <option value="">{t('observability.devUi.filters.all')}</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {t(`observability.devUi.statusValues.${s}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="filter-since">{t('observability.devUi.filters.time')}</Label>
        <select
          id="filter-since"
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={filters.since}
          onChange={(e) => onChange({ since: e.target.value })}
        >
          {SINCE_VALUES.map((value) => (
            <option key={value || 'all'} value={value}>
              {sinceLabel(value)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="filter-project">{t('observability.devUi.filters.projectId')}</Label>
        <Input
          id="filter-project"
          value={filters.projectId}
          onChange={(e) => onChange({ projectId: e.target.value })}
          placeholder={t('observability.devUi.filters.projectIdPlaceholder')}
        />
      </div>
      <div className="space-y-1 sm:col-span-2 lg:col-span-1">
        <Label htmlFor="filter-search">{t('observability.devUi.filters.searchErrors')}</Label>
        <Input
          id="filter-search"
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder={t('observability.devUi.filters.searchPlaceholder')}
        />
      </div>
      <div className="flex items-end sm:col-span-2 lg:col-span-5">
        <Button type="button" onClick={onApply}>
          {t('observability.devUi.filters.apply')}
        </Button>
      </div>
    </div>
  );
}
