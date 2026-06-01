/**
 * @extends-from components/knowledge-base/knowledge-drive-browser.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Archive,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Film,
  Folder,
  Grid3x3,
  Home,
  Image as ImageIcon,
  List,
  Music,
  Presentation,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { deleteNode } from '@/lib/knowledge-base/client';
import type { KnowledgeFileCategory, KnowledgeNode } from '@/lib/knowledge-base/types';
import {
  KNOWLEDGE_ROOT_NODE_ID,
  buildKnowledgeBreadcrumbs,
  buildKnowledgeChildrenMap,
} from '@/lib/knowledge-base/tree-utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface KnowledgeDriveBrowserProps {
  readonly nodes: KnowledgeNode[];
  readonly selectedId: string | null;
  readonly currentFolderId: string;
  readonly onCurrentFolderChange: (folderId: string) => void;
  readonly onSelect: (nodeId: string) => void;
  readonly onRefresh: () => void;
  readonly disabled?: boolean;
}

type ViewMode = 'grid' | 'list';

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function FileTypeIcon({
  category,
  className,
}: {
  category: KnowledgeFileCategory;
  className?: string;
}) {
  const cls = cn('size-10', className);
  switch (category) {
    case 'pdf':
      return <FileText className={cn(cls, 'text-red-500')} />;
    case 'word':
      return <FileText className={cn(cls, 'text-blue-600')} />;
    case 'excel':
      return <FileSpreadsheet className={cn(cls, 'text-emerald-600')} />;
    case 'powerpoint':
      return <Presentation className={cn(cls, 'text-orange-500')} />;
    case 'image':
      return <ImageIcon className={cn(cls, 'text-violet-500')} />;
    case 'archive':
      return <Archive className={cn(cls, 'text-amber-700')} />;
    case 'media':
      return <Film className={cn(cls, 'text-pink-500')} />;
    case 'html':
    case 'text':
      return <FileText className={cn(cls, 'text-slate-500')} />;
    default:
      return <FileText className={cn(cls, 'text-sky-600')} />;
  }
}

function DriveItemIcon({ node }: { node: KnowledgeNode }) {
  if (node.type === 'folder') {
    return (
      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-amber-50 shadow-inner dark:from-amber-950/50 dark:to-amber-900/20">
        <Folder className="size-9 fill-amber-400/90 text-amber-500 dark:fill-amber-500/40 dark:text-amber-400" />
      </div>
    );
  }
  const category = node.file?.category ?? 'unknown';
  if (category === 'media' && node.file?.mimeType?.startsWith('audio/')) {
    return (
      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-100 to-pink-50 dark:from-pink-950/40 dark:to-pink-900/20">
        <Music className="size-9 text-pink-500" />
      </div>
    );
  }
  return (
    <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-white dark:from-slate-800 dark:to-slate-900/60">
      <FileTypeIcon category={category} />
    </div>
  );
}

function DriveGridCard({
  node,
  selected,
  disabled,
  onOpen,
  onSelect,
  onDelete,
  t,
}: {
  node: KnowledgeNode;
  selected: boolean;
  disabled?: boolean;
  onOpen: () => void;
  onSelect: () => void;
  onDelete: () => void;
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  const isFolder = node.type === 'folder';
  const status = node.file?.parseStatus;

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'group relative flex cursor-pointer flex-col items-center rounded-xl border bg-white p-3 text-center shadow-sm transition-all',
        'hover:border-violet-200 hover:shadow-md dark:bg-slate-900/90 dark:hover:border-violet-800',
        selected && 'border-violet-400 ring-2 ring-violet-400/30 dark:border-violet-600',
      )}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen();
      }}
    >
      {!disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1 size-7 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      )}
      <DriveItemIcon node={node} />
      <p className="mt-2 line-clamp-2 w-full text-xs font-medium leading-snug" title={node.name}>
        {node.name}
      </p>
      {!isFolder && node.file ? (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{formatBytes(node.file.size)}</p>
      ) : null}
      {!isFolder && status ? (
        <Badge variant="secondary" className="mt-1.5 h-5 px-1.5 text-[10px] font-normal">
          {t(`knowledgeBase.parseStatus.${status}`)}
        </Badge>
      ) : null}
    </div>
  );
}

function DriveListRow({
  node,
  selected,
  disabled,
  onOpen,
  onSelect,
  onDelete,
  t,
}: {
  node: KnowledgeNode;
  selected: boolean;
  disabled?: boolean;
  onOpen: () => void;
  onSelect: () => void;
  onDelete: () => void;
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  const isFolder = node.type === 'folder';

  return (
    <tr
      className={cn(
        'group cursor-pointer border-b border-border/40 transition-colors hover:bg-violet-50/50 dark:hover:bg-violet-950/20',
        selected && 'bg-violet-50 dark:bg-violet-950/30',
      )}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <td className="px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="shrink-0 scale-75">
            <DriveItemIcon node={node} />
          </div>
          <span className="truncate text-sm font-medium">{node.name}</span>
        </div>
      </td>
      <td className="hidden px-3 py-2 text-xs text-muted-foreground sm:table-cell">
        {isFolder ? t('knowledgeBase.drive.typeFolder') : t('knowledgeBase.drive.typeFile')}
      </td>
      <td className="hidden px-3 py-2 text-xs text-muted-foreground md:table-cell">
        {isFolder ? '—' : node.file ? formatBytes(node.file.size) : '—'}
      </td>
      <td className="hidden px-3 py-2 text-xs text-muted-foreground lg:table-cell">
        {formatDate(node.updatedAt)}
      </td>
      <td className="hidden px-3 py-2 text-xs md:table-cell">
        {!isFolder && node.file ? (
          <Badge variant="secondary" className="font-normal">
            {t(`knowledgeBase.parseStatus.${node.file.parseStatus}`)}
          </Badge>
        ) : (
          '—'
        )}
      </td>
      <td className="px-2 py-2 text-right">
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 opacity-0 group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        )}
      </td>
    </tr>
  );
}

export function KnowledgeDriveBrowser({
  nodes,
  selectedId,
  currentFolderId,
  onCurrentFolderChange,
  onSelect,
  onRefresh,
  disabled,
}: KnowledgeDriveBrowserProps) {
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const childrenMap = useMemo(() => buildKnowledgeChildrenMap(nodes), [nodes]);
  const entries = childrenMap.get(currentFolderId) ?? [];
  const folders = entries.filter((n) => n.type === 'folder');
  const files = entries.filter((n) => n.type === 'file');
  const breadcrumbs = useMemo(
    () => buildKnowledgeBreadcrumbs(nodes, currentFolderId),
    [nodes, currentFolderId],
  );

  const handleDelete = useCallback(
    async (nodeId: string) => {
      if (!window.confirm(t('knowledgeBase.deleteConfirm'))) return;
      try {
        await deleteNode(nodeId);
        toast.success(t('knowledgeBase.deleteSuccess'));
        if (selectedId === nodeId) {
          onSelect(currentFolderId);
        }
        onRefresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('knowledgeBase.deleteFailed'));
      }
    },
    [currentFolderId, onRefresh, onSelect, selectedId, t],
  );

  const openNode = useCallback(
    (node: KnowledgeNode) => {
      if (node.type === 'folder') {
        onCurrentFolderChange(node.id);
        onSelect(node.id);
      } else {
        onSelect(node.id);
      }
    },
    [onCurrentFolderChange, onSelect],
  );

  const itemProps = (node: KnowledgeNode) => ({
    node,
    selected: selectedId === node.id,
    disabled,
    onOpen: () => openNode(node),
    onSelect: () => onSelect(node.id),
    onDelete: () => void handleDelete(node.id),
    t,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/50 bg-muted/30 px-3 py-2">
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-background',
              currentFolderId === KNOWLEDGE_ROOT_NODE_ID && 'font-medium text-violet-700 dark:text-violet-300',
            )}
            onClick={() => {
              onCurrentFolderChange(KNOWLEDGE_ROOT_NODE_ID);
              onSelect(KNOWLEDGE_ROOT_NODE_ID);
            }}
          >
            <Home className="size-3.5 shrink-0" />
            <span>{t('knowledgeBase.drive.root')}</span>
          </button>
          {breadcrumbs.map((crumb) => (
            <span key={crumb.id} className="flex items-center gap-1 text-muted-foreground">
              <ChevronRight className="size-3.5 shrink-0" />
              <button
                type="button"
                className={cn(
                  'max-w-[140px] truncate rounded-md px-2 py-1 transition-colors hover:bg-background hover:text-foreground',
                  crumb.id === currentFolderId && 'font-medium text-violet-700 dark:text-violet-300',
                )}
                onClick={() => {
                  onCurrentFolderChange(crumb.id);
                  onSelect(crumb.id);
                }}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
        <span className="text-xs text-muted-foreground">
          {t('knowledgeBase.drive.itemCount', { count: String(entries.length) })}
        </span>
        <div className="flex shrink-0 rounded-md border border-border/60 bg-background p-0.5">
          <Button
            type="button"
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            className="size-7"
            aria-label={t('knowledgeBase.drive.viewGrid')}
            onClick={() => setViewMode('grid')}
          >
            <Grid3x3 className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            className="size-7"
            aria-label={t('knowledgeBase.drive.viewList')}
            onClick={() => setViewMode('list')}
          >
            <List className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/80 to-slate-100/40 p-3 dark:from-slate-950/40 dark:to-slate-900/20">
        {entries.length === 0 ? (
          <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 text-center">
            <Folder className="size-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{t('knowledgeBase.drive.empty')}</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(120px,1fr))]">
            {[...folders, ...files].map((node) => (
              <DriveGridCard key={node.id} {...itemProps(node)} />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border/60 bg-white shadow-sm dark:bg-slate-900/80">
            <table className="w-full table-fixed border-collapse">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t('knowledgeBase.drive.colName')}</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">
                    {t('knowledgeBase.drive.colType')}
                  </th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">
                    {t('knowledgeBase.drive.colSize')}
                  </th>
                  <th className="hidden px-3 py-2 font-medium lg:table-cell">
                    {t('knowledgeBase.drive.colModified')}
                  </th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">
                    {t('knowledgeBase.parseStatusLabel')}
                  </th>
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {[...folders, ...files].map((node) => (
                  <DriveListRow key={node.id} {...itemProps(node)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
