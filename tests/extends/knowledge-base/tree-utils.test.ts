/**
 * @extends-from tests/knowledge-base/tree-utils.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';
import {
  buildKnowledgeBreadcrumbs,
  buildKnowledgeChildrenMap,
  expandNodeIdsToFileNodes,
  recomputeDisplayPaths,
  wouldCreateCycle,
} from '@/lib/knowledge-base/tree-utils';
import type { KnowledgeNode } from '@/lib/knowledge-base/types';

const nodes: KnowledgeNode[] = [
  {
    id: 'root',
    parentId: null,
    type: 'folder',
    name: 'Root',
    displayPath: '/',
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'f1',
    parentId: 'root',
    type: 'folder',
    name: 'Docs',
    displayPath: '/Docs',
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'file1',
    parentId: 'f1',
    type: 'file',
    name: 'a.pdf',
    displayPath: '/Docs/a.pdf',
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
    file: {
      storageKey: 'file1',
      originalName: 'a.pdf',
      mimeType: 'application/pdf',
      size: 1,
      category: 'pdf',
      parseStatus: 'ready',
    },
  },
];

describe('buildKnowledgeChildrenMap', () => {
  test('groups children under root and folder', () => {
    const map = buildKnowledgeChildrenMap(nodes);
    expect(map.get('root')?.map((n) => n.id)).toEqual(['f1']);
    expect(map.get('f1')?.map((n) => n.id)).toEqual(['file1']);
  });
});

describe('buildKnowledgeBreadcrumbs', () => {
  test('returns folder chain excluding root', () => {
    const crumbs = buildKnowledgeBreadcrumbs(nodes, 'f1');
    expect(crumbs.map((n) => n.id)).toEqual(['f1']);
  });
});

describe('expandNodeIdsToFileNodes', () => {
  test('expands folder to descendant files', () => {
    const files = expandNodeIdsToFileNodes(['f1'], nodes);
    expect(files.map((n) => n.id)).toEqual(['file1']);
  });
  test('returns file when mounting file id', () => {
    const files = expandNodeIdsToFileNodes(['file1'], nodes);
    expect(files).toHaveLength(1);
  });
});

describe('wouldCreateCycle', () => {
  test('detects moving parent into child', () => {
    expect(wouldCreateCycle('root', 'f1', nodes)).toBe(true);
  });
});

describe('recomputeDisplayPaths', () => {
  test('recomputes paths from root via BFS', () => {
    const stale = nodes.map((n) => ({ ...n, displayPath: 'stale' }));
    const updated = recomputeDisplayPaths(stale);
    expect(updated.find((n) => n.id === 'root')?.displayPath).toBe('/');
    expect(updated.find((n) => n.id === 'f1')?.displayPath).toBe('/Docs');
    expect(updated.find((n) => n.id === 'file1')?.displayPath).toBe('/Docs/a.pdf');
  });
});
