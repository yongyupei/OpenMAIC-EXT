/**
 * @extends-from components/knowledge-base/knowledge-tree.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  createFolder,
  deleteNode,
  uploadKnowledgeFile,
} from '@/lib/knowledge-base/client';
import { KNOWLEDGE_ROOT_NODE_ID } from '@/lib/knowledge-base/tree-utils';
import type { KnowledgeNode } from '@/lib/knowledge-base/types';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface KnowledgeTreeProps {
  readonly nodes: KnowledgeNode[];
  readonly selectedId: string | null;
  readonly onSelect: (nodeId: string) => void;
  readonly onRefresh: () => void;
  readonly disabled?: boolean;
}

function buildChildrenMap(nodes: KnowledgeNode[]): Map<string, KnowledgeNode[]> {
  const map = new Map<string, KnowledgeNode[]>();
  for (const node of nodes) {
    if (node.id === KNOWLEDGE_ROOT_NODE_ID) continue;
    const parentKey = node.parentId ?? KNOWLEDGE_ROOT_NODE_ID;
    const list = map.get(parentKey) ?? [];
    list.push(node);
    map.set(parentKey, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }
  return map;
}

interface TreeNodeRowProps {
  readonly node: KnowledgeNode;
  readonly depth: number;
  readonly childrenMap: Map<string, KnowledgeNode[]>;
  readonly expanded: Set<string>;
  readonly onToggleExpand: (id: string) => void;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onUploadTo: (parentId: string) => void;
  readonly onDelete: (nodeId: string) => void;
  readonly onNewFolder: (parentId: string) => void;
  readonly disabled?: boolean;
}

function TreeNodeRow({
  node,
  depth,
  childrenMap,
  expanded,
  onToggleExpand,
  selectedId,
  onSelect,
  onUploadTo,
  onDelete,
  onNewFolder,
  disabled,
}: TreeNodeRowProps) {
  const children = childrenMap.get(node.id) ?? [];
  const isFolder = node.type === 'folder';
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedId === node.id;

  return (
    <div>
      <TreeNodeRowBar
        node={node}
        depth={depth}
        isFolder={isFolder}
        isExpanded={isExpanded}
        isSelected={isSelected}
        disabled={disabled}
        onSelect={onSelect}
        onToggleExpand={onToggleExpand}
        onUploadTo={onUploadTo}
        onDelete={onDelete}
        onNewFolder={onNewFolder}
      />
      {isFolder && isExpanded &&
        children.map((child) => (
          <TreeNodeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            childrenMap={childrenMap}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            selectedId={selectedId}
            onSelect={onSelect}
            onUploadTo={onUploadTo}
            onDelete={onDelete}
            onNewFolder={onNewFolder}
            disabled={disabled}
          />
        ))}
    </div>
  );
}

function TreeNodeRowBar({
  node,
  depth,
  isFolder,
  isExpanded,
  isSelected,
  disabled,
  onSelect,
  onToggleExpand,
  onUploadTo,
  onDelete,
  onNewFolder,
}: {
  node: KnowledgeNode;
  depth: number;
  isFolder: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onUploadTo: (parentId: string) => void;
  onDelete: (nodeId: string) => void;
  onNewFolder: (parentId: string) => void;
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-md pr-1 text-sm',
        isSelected && 'bg-primary/10 text-primary',
      )}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
    >
      {isFolder ? (
        <button
          type="button"
          className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-muted"
          onClick={() => onToggleExpand(node.id)}
        >
          {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
      ) : (
        <span className="size-6 shrink-0" />
      )}
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
        onClick={() => onSelect(node.id)}
        disabled={disabled}
      >
        {isFolder ? (
          <Folder className="size-4 shrink-0 text-amber-600/80" />
        ) : (
          <FileText className="size-4 shrink-0 text-sky-600/80" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {isFolder && !disabled && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onNewFolder(node.id)}
          >
            <FolderPlus className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onUploadTo(node.id)}
          >
            <Upload className="size-3.5" />
          </Button>
        </div>
      )}
      {!disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 opacity-0 group-hover:opacity-100"
          onClick={() => onDelete(node.id)}
        >
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      )}
    </div>
  );
}

export function KnowledgeTree({
  nodes,
  selectedId,
  onSelect,
  onRefresh,
  disabled,
}: KnowledgeTreeProps) {
  const { t } = useI18n();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadParentRef = useRef<string>(KNOWLEDGE_ROOT_NODE_ID);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([KNOWLEDGE_ROOT_NODE_ID]));

  const childrenMap = useMemo(() => buildChildrenMap(nodes), [nodes]);
  const rootChildren = childrenMap.get(KNOWLEDGE_ROOT_NODE_ID) ?? [];

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDelete = useCallback(
    async (nodeId: string) => {
      if (!window.confirm(t('knowledgeBase.deleteConfirm'))) return;
      try {
        await deleteNode(nodeId);
        toast.success(t('knowledgeBase.deleteSuccess'));
        onRefresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('knowledgeBase.deleteFailed'));
      }
    },
    [onRefresh, t],
  );

  const handleNewFolder = useCallback(
    async (parentId: string) => {
      const name = window.prompt(t('knowledgeBase.newFolderPrompt'));
      if (!name?.trim()) return;
      try {
        await createFolder(parentId, name.trim());
        setExpanded((prev) => new Set(prev).add(parentId));
        toast.success(t('knowledgeBase.newFolderSuccess'));
        onRefresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('knowledgeBase.newFolderFailed'));
      }
    },
    [onRefresh, t],
  );

  const handleUploadTo = useCallback((parentId: string) => {
    uploadParentRef.current = parentId;
    uploadInputRef.current?.click();
  }, []);

  const handleUploadChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        await uploadKnowledgeFile(file, uploadParentRef.current);
        toast.success(t('knowledgeBase.uploadSuccess'));
        onRefresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('knowledgeBase.uploadFailed'));
      }
    },
    [onRefresh, t],
  );

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={uploadInputRef}
        type="file"
        className="hidden"
        onChange={(event) => void handleUploadChange(event)}
      />
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/60 bg-background/60 p-1">
        {rootChildren.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {t('knowledgeBase.emptyTree')}
          </p>
        ) : (
          rootChildren.map((node) => (
            <TreeNodeRow
              key={node.id}
              node={node}
              depth={0}
              childrenMap={childrenMap}
              expanded={expanded}
              onToggleExpand={toggleExpand}
              selectedId={selectedId}
              onSelect={onSelect}
              onUploadTo={handleUploadTo}
              onDelete={handleDelete}
              onNewFolder={handleNewFolder}
              disabled={disabled}
            />
          ))
        )}
      </div>
    </div>
  );
}
