/**
 * @extends-from components/knowledge-base/knowledge-picker.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, FileText, Folder, Library, X } from 'lucide-react';

import { fetchKnowledgeBase } from '@/lib/knowledge-base/client';
import { KNOWLEDGE_ROOT_NODE_ID } from '@/lib/knowledge-base/tree-utils';
import type { KnowledgeNode } from '@/lib/knowledge-base/types';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface KnowledgePickerProps {
  readonly selectedNodeIds: string[];
  readonly onChange: (ids: string[]) => void;
  readonly disabled?: boolean;
}

function buildChildrenMap(nodes: KnowledgeNode[]): Map<string | null, KnowledgeNode[]> {
  const map = new Map<string | null, KnowledgeNode[]>();
  for (const node of nodes) {
    const list = map.get(node.parentId) ?? [];
    list.push(node);
    map.set(node.parentId, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }
  return map;
}

function collectDescendantIds(nodes: KnowledgeNode[], nodeId: string): string[] {
  const ids: string[] = [];
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    ids.push(current);
    for (const child of nodes) {
      if (child.parentId === current) {
        queue.push(child.id);
      }
    }
  }
  return ids;
}

function isNodeChecked(nodeId: string, selected: Set<string>, nodes: KnowledgeNode[]): boolean {
  if (selected.has(nodeId)) return true;
  let current = nodes.find((n) => n.id === nodeId);
  while (current?.parentId) {
    if (selected.has(current.parentId)) return true;
    current = nodes.find((n) => n.id === current!.parentId);
  }
  return false;
}

function hasSelectedDescendant(
  nodeId: string,
  selected: Set<string>,
  childrenMap: Map<string | null, KnowledgeNode[]>,
  nodes: KnowledgeNode[],
): boolean {
  const children = childrenMap.get(nodeId) ?? [];
  return children.some(
    (child) => selected.has(child.id) || hasSelectedDescendant(child.id, selected, childrenMap, nodes),
  );
}

interface TreeRowProps {
  readonly node: KnowledgeNode;
  readonly depth: number;
  readonly childrenMap: Map<string | null, KnowledgeNode[]>;
  readonly allNodes: KnowledgeNode[];
  readonly selected: Set<string>;
  readonly onToggle: (nodeId: string, checked: boolean) => void;
  readonly disabled?: boolean;
}

function TreeRow({
  node,
  depth,
  childrenMap,
  allNodes,
  selected,
  onToggle,
  disabled,
}: TreeRowProps) {
  const children = childrenMap.get(node.id) ?? [];
  const checked = isNodeChecked(node.id, selected, allNodes);
  const indeterminate =
    !checked && hasSelectedDescendant(node.id, selected, childrenMap, allNodes);

  return (
    <div>
      <PickerTreeRowLabel
        node={node}
        depth={depth}
        checked={checked}
        indeterminate={indeterminate}
        disabled={disabled}
        onToggle={onToggle}
      />
      {children.map((child) => (
        <TreeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          childrenMap={childrenMap}
          allNodes={allNodes}
          selected={selected}
          onToggle={onToggle}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function PickerTreeRowLabel({
  node,
  depth,
  checked,
  indeterminate,
  disabled,
  onToggle,
}: {
  node: KnowledgeNode;
  depth: number;
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  onToggle: (nodeId: string, checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60',
        disabled && 'pointer-events-none opacity-50',
      )}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
    >
      <Checkbox
        checked={indeterminate ? 'indeterminate' : checked}
        disabled={disabled}
        onCheckedChange={(value) => onToggle(node.id, value === true)}
      />
      {node.type === 'folder' ? (
        <Folder className="size-3.5 shrink-0 text-amber-600/80" />
      ) : (
        <FileText className="size-3.5 shrink-0 text-sky-600/80" />
      )}
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
    </label>
  );
}

function KnowledgePickerTree({
  nodes,
  selectedNodeIds,
  onChange,
  disabled,
}: KnowledgePickerProps & { readonly nodes: KnowledgeNode[] }) {
  const selected = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const childrenMap = useMemo(() => buildChildrenMap(nodes), [nodes]);

  const rootChildren = useMemo(
    () => nodes.filter((n) => n.parentId === KNOWLEDGE_ROOT_NODE_ID),
    [nodes],
  );

  const handleToggle = useCallback(
    (nodeId: string, checked: boolean) => {
      const branchIds = collectDescendantIds(nodes, nodeId);
      const next = new Set(selectedNodeIds);
      if (checked) {
        for (const id of branchIds) next.add(id);
      } else {
        for (const id of branchIds) next.delete(id);
        let parent = nodes.find((n) => n.id === nodeId)?.parentId;
        while (parent) {
          next.delete(parent);
          parent = nodes.find((n) => n.id === parent)?.parentId ?? null;
        }
      }
      onChange([...next]);
    },
    [nodes, onChange, selectedNodeIds],
  );

  return (
    <>
      {rootChildren.map((node) => (
        <TreeRow
          key={node.id}
          node={node}
          depth={0}
          childrenMap={childrenMap}
          allNodes={nodes}
          selected={selected}
          onToggle={handleToggle}
          disabled={disabled}
        />
      ))}
    </>
  );
}

function KnowledgePickerChips({
  nodes,
  selectedNodeIds,
  onChange,
  disabled,
}: KnowledgePickerProps & { readonly nodes: KnowledgeNode[] }) {
  const { t } = useI18n();
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const topLevelSelected = selectedNodeIds.filter((id) => {
    const node = byId.get(id);
    if (!node?.parentId) return false;
    return !selectedNodeIds.includes(node.parentId);
  });

  if (topLevelSelected.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">{t('knowledgeBase.picker.empty')}</span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1 border-t border-border/50 px-2 py-2">
      {topLevelSelected.map((id) => {
        const node = byId.get(id);
        if (!node) return null;
        return (
          <span
            key={id}
            className="inline-flex max-w-[160px] items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
          >
            <span className="truncate">{node.name}</span>
            {!disabled && (
              <button
                type="button"
                className="shrink-0 rounded-full hover:bg-primary/20"
                onClick={() => {
                  const branch = collectDescendantIds(nodes, id);
                  onChange(selectedNodeIds.filter((entry) => !branch.includes(entry)));
                }}
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function KnowledgePicker({ selectedNodeIds, onChange, disabled }: KnowledgePickerProps) {
  const { t } = useI18n();
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchKnowledgeBase();
      setNodes(data.nodes.filter((n) => n.id !== KNOWLEDGE_ROOT_NODE_ID));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      className="h-8 gap-1.5 rounded-full border-dashed px-3 text-xs"
    >
      <Library className="size-3.5" />
      <span>{t('knowledgeBase.picker.label')}</span>
      {selectedNodeIds.length > 0 && (
        <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-medium">
          {selectedNodeIds.length}
        </span>
      )}
      <ChevronDown className="size-3 opacity-50" />
    </Button>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0 sm:w-96">
        <PickerPanelContent
          loading={loading}
          nodes={nodes}
          selectedNodeIds={selectedNodeIds}
          onChange={onChange}
          disabled={disabled}
          t={t}
        />
      </PopoverContent>
    </Popover>
  );
}

function PickerPanelContent({
  loading,
  nodes,
  selectedNodeIds,
  onChange,
  disabled,
  t,
}: KnowledgePickerProps & {
  readonly loading: boolean;
  readonly nodes: KnowledgeNode[];
  readonly t: (key: string) => string;
}) {
  return (
    <div className="flex flex-col">
      <PickerTreePanel
        loading={loading}
        nodes={nodes}
        selectedNodeIds={selectedNodeIds}
        onChange={onChange}
        disabled={disabled}
        t={t}
      />
      <KnowledgePickerChips
        nodes={nodes}
        selectedNodeIds={selectedNodeIds}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

function PickerTreePanel({
  loading,
  nodes,
  selectedNodeIds,
  onChange,
  disabled,
  t,
}: KnowledgePickerProps & {
  readonly loading: boolean;
  readonly nodes: KnowledgeNode[];
  readonly t: (key: string) => string;
}) {
  return (
    <div className="max-h-72 overflow-y-auto p-1">
      {loading ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          {t('knowledgeBase.picker.loading')}
        </p>
      ) : nodes.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          {t('knowledgeBase.picker.noNodes')}
        </p>
      ) : (
        <KnowledgePickerTree
          nodes={nodes}
          selectedNodeIds={selectedNodeIds}
          onChange={onChange}
          disabled={disabled}
        />
      )}
    </div>
  );
}
