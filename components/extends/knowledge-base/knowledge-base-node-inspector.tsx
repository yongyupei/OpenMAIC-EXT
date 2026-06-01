/**
 * @extends-from components/knowledge-base/knowledge-base-node-inspector.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import type { ReactNode } from 'react';
import { Download, Folder, Loader2 } from 'lucide-react';

import type { KnowledgeNode } from '@/lib/knowledge-base/types';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const INSPECTOR_HEIGHT_CLASS = 'h-[92px]';

export interface KnowledgeBaseNodeInspectorProps {
  readonly node: KnowledgeNode | null;
  readonly reparsing?: boolean;
  readonly onReparse?: () => void;
  readonly className?: string;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function InspectorField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col justify-center gap-0.5 px-3', className)}>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
        {label}
      </span>
      <div className="min-w-0 text-sm leading-tight">{children}</div>
    </div>
  );
}

export function KnowledgeBaseNodeInspector({
  node,
  reparsing = false,
  onReparse,
  className,
}: KnowledgeBaseNodeInspectorProps) {
  const { t } = useI18n();

  if (!node) {
    return (
      <div
        className={cn(
          INSPECTOR_HEIGHT_CLASS,
          'flex shrink-0 items-center justify-center border-t border-border/60 bg-muted/20 px-4',
          className,
        )}
      >
        <p className="text-sm text-muted-foreground">{t('knowledgeBase.selectNodeHint')}</p>
      </div>
    );
  }

  if (node.type === 'folder') {
    return (
      <div
        className={cn(
          INSPECTOR_HEIGHT_CLASS,
          'flex shrink-0 items-stretch overflow-hidden border-t border-border/60 bg-muted/10',
          className,
        )}
      >
        <div className="flex w-14 shrink-0 items-center justify-center border-r border-border/50 bg-amber-50/80 dark:bg-amber-950/20">
          <Folder className="size-7 fill-amber-400/80 text-amber-500" />
        </div>
        <InspectorField label={t('knowledgeBase.drive.colName')} className="min-w-[100px] flex-[1.2]">
          <p className="truncate font-medium" title={node.name}>
            {node.name}
          </p>
        </InspectorField>
        <InspectorField label={t('knowledgeBase.drive.colPath')} className="min-w-0 flex-[2] border-l border-border/50">
          <p className="truncate text-xs text-muted-foreground" title={node.displayPath}>
            {node.displayPath}
          </p>
        </InspectorField>
        <InspectorField label={t('knowledgeBase.drive.colType')} className="hidden min-w-[72px] border-l border-border/50 sm:flex">
          {t('knowledgeBase.drive.typeFolder')}
        </InspectorField>
        <div className="flex min-w-[140px] flex-1 items-center border-l border-border/50 px-3">
          <p className="line-clamp-2 text-xs text-muted-foreground">{t('knowledgeBase.folderSelected')}</p>
        </div>
      </div>
    );
  }

  const status = node.file?.parseStatus ?? 'pending';
  const statusLabel = t(`knowledgeBase.parseStatus.${status}`);

  return (
    <div
      className={cn(
        INSPECTOR_HEIGHT_CLASS,
        'flex shrink-0 items-stretch overflow-hidden border-t border-border/60 bg-muted/10',
        className,
      )}
    >
      <InspectorField label={t('knowledgeBase.drive.colName')} className="min-w-[100px] flex-[1.2]">
        <p className="truncate font-medium" title={node.name}>
          {node.name}
        </p>
      </InspectorField>
      <InspectorField
        label={t('knowledgeBase.drive.colPath')}
        className="hidden min-w-[120px] flex-[1.5] border-l border-border/50 sm:flex"
      >
        <p className="truncate text-xs text-muted-foreground" title={node.displayPath}>
          {node.displayPath}
        </p>
      </InspectorField>
      <InspectorField
        label={t('knowledgeBase.drive.colSize')}
        className="hidden min-w-[72px] border-l border-border/50 md:flex"
      >
        {node.file ? formatBytes(node.file.size) : '—'}
      </InspectorField>
      <InspectorField
        label={t('knowledgeBase.parseStatusLabel')}
        className="min-w-[88px] border-l border-border/50"
      >
        <Badge variant="secondary" className="w-fit font-normal">
          {statusLabel}
        </Badge>
      </InspectorField>
      <div className="ml-auto flex shrink-0 items-center gap-2 border-l border-border/50 px-3">
        <Button type="button" variant="outline" size="sm" className="h-8" asChild>
          <a href={`/api/extends/knowledge-base/files/${encodeURIComponent(node.id)}/download`}>
            <Download className="mr-1.5 size-3.5" />
            {t('knowledgeBase.download')}
          </a>
        </Button>
        {onReparse ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={reparsing}
            onClick={onReparse}
          >
            {reparsing ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            {t('knowledgeBase.reparse')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
