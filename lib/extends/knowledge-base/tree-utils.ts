/**
 * @extends-from lib/knowledge-base/tree-utils.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { KnowledgeNode } from '@/lib/knowledge-base/types';

export const KNOWLEDGE_ROOT_NODE_ID = 'root';

const NODE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function isValidKnowledgeNodeId(id: string): boolean {
  return NODE_ID_PATTERN.test(id);
}

export function resolveKnowledgeParentId(
  parentId: string | null,
  nodes: KnowledgeNode[],
): string {
  if (parentId === null) {
    const root = nodes.find((n) => n.parentId === null);
    return root?.id ?? KNOWLEDGE_ROOT_NODE_ID;
  }
  return parentId;
}

/** Parent folder for create/upload actions from the current tree selection. */
export function resolveKnowledgeActionParentId(
  selectedNode: KnowledgeNode | null,
  nodes: KnowledgeNode[],
): string {
  if (selectedNode?.type === 'folder') {
    return selectedNode.id;
  }
  if (selectedNode?.type === 'file' && selectedNode.parentId) {
    return resolveKnowledgeParentId(selectedNode.parentId, nodes);
  }
  return KNOWLEDGE_ROOT_NODE_ID;
}

export function nextSortOrder(nodes: KnowledgeNode[], parentId: string): number {
  const siblings = nodes.filter((n) => n.parentId === parentId);
  if (siblings.length === 0) return 0;
  return Math.max(...siblings.map((n) => n.sortOrder)) + 1;
}

export function collectDescendantIds(nodes: KnowledgeNode[], nodeId: string): Set<string> {
  const ids = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    ids.add(current);
    for (const child of nodes) {
      if (child.parentId === current && !ids.has(child.id)) {
        queue.push(child.id);
      }
    }
  }
  return ids;
}

export function findNode(nodes: KnowledgeNode[], id: string): KnowledgeNode | undefined {
  return nodes.find((n) => n.id === id);
}

export function buildKnowledgeChildrenMap(
  nodes: KnowledgeNode[],
): Map<string, KnowledgeNode[]> {
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

export function buildKnowledgeBreadcrumbs(
  nodes: KnowledgeNode[],
  folderId: string,
): KnowledgeNode[] {
  const chain: KnowledgeNode[] = [];
  let current = findNode(nodes, folderId);
  while (current && current.id !== KNOWLEDGE_ROOT_NODE_ID) {
    chain.unshift(current);
    if (!current.parentId) break;
    current = findNode(nodes, current.parentId);
  }
  return chain;
}

export function expandNodeIdsToFileNodes(
  nodeIds: string[],
  nodes: KnowledgeNode[],
): KnowledgeNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const result: KnowledgeNode[] = [];
  const seen = new Set<string>();

  function collectFiles(id: string): void {
    const node = byId.get(id);
    if (!node) return;

    if (node.type === 'file') {
      if (!seen.has(node.id)) {
        seen.add(node.id);
        result.push(node);
      }
      return;
    }

    for (const child of nodes) {
      if (child.parentId === id) {
        collectFiles(child.id);
      }
    }
  }

  for (const id of nodeIds) {
    collectFiles(id);
  }
  return result;
}

function childDisplayPath(parentPath: string, name: string): string {
  return parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
}

export function recomputeDisplayPaths(nodes: KnowledgeNode[]): KnowledgeNode[] {
  const pathById = new Map<string, string>();
  const roots = nodes.filter((n) => n.parentId === null);
  const queue: string[] = [];

  for (const root of roots) {
    pathById.set(root.id, '/');
    queue.push(root.id);
  }

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const parentPath = pathById.get(parentId) ?? '/';
    const children = nodes
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const child of children) {
      const displayPath = childDisplayPath(parentPath, child.name);
      pathById.set(child.id, displayPath);
      queue.push(child.id);
    }
  }

  return nodes.map((n) => ({
    ...n,
    displayPath: pathById.get(n.id) ?? n.displayPath,
  }));
}

export function wouldCreateCycle(
  nodeId: string,
  newParentId: string | null,
  nodes: KnowledgeNode[],
): boolean {
  if (newParentId === null) return false;
  if (newParentId === nodeId) return true;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  let current: string | null = newParentId;

  while (current) {
    if (current === nodeId) return true;
    const node = byId.get(current);
    if (!node) return false;
    current = node.parentId;
  }

  return false;
}
