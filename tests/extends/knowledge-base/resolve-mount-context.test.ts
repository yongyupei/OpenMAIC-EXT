/**
 * @extends-from tests/knowledge-base/resolve-mount-context.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { KnowledgeNode } from '@/lib/knowledge-base/types';

const mockReadKnowledgeTree = vi.fn();
const mockReadKnowledgeExtract = vi.fn();
const mockWriteKnowledgeExtract = vi.fn();
const mockExtractKnowledgeFile = vi.fn();

vi.mock('@/lib/knowledge-base/storage', () => ({
  readKnowledgeTree: (...args: unknown[]) => mockReadKnowledgeTree(...args),
}));

vi.mock('@/lib/knowledge-base/extract-file', () => ({
  readKnowledgeExtract: (...args: unknown[]) => mockReadKnowledgeExtract(...args),
  writeKnowledgeExtract: (...args: unknown[]) => mockWriteKnowledgeExtract(...args),
  extractKnowledgeFile: (...args: unknown[]) => mockExtractKnowledgeFile(...args),
}));

const { resolveKnowledgeMountContext } = await import(
  '@/lib/knowledge-base/resolve-mount-context'
);

const now = '2026-05-20T00:00:00.000Z';

const nodes: KnowledgeNode[] = [
  {
    id: 'root',
    parentId: null,
    type: 'folder',
    name: 'Root',
    displayPath: '/',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'folder-docs',
    parentId: 'root',
    type: 'folder',
    name: 'Docs',
    displayPath: '/Docs',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'file-txt',
    parentId: 'folder-docs',
    type: 'file',
    name: 'notes.txt',
    displayPath: '/Docs/notes.txt',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    file: {
      storageKey: 'file-txt',
      originalName: 'notes.txt',
      mimeType: 'text/plain',
      size: 12,
      category: 'text',
      parseStatus: 'ready',
    },
  },
  {
    id: 'file-zip',
    parentId: 'root',
    type: 'file',
    name: 'bundle.zip',
    displayPath: '/bundle.zip',
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
    file: {
      storageKey: 'file-zip',
      originalName: 'bundle.zip',
      mimeType: 'application/zip',
      size: 100,
      category: 'archive',
      parseStatus: 'unsupported',
    },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockReadKnowledgeTree.mockResolvedValue({ revision: 1, nodes });
  mockReadKnowledgeExtract.mockResolvedValue(null);
  mockWriteKnowledgeExtract.mockResolvedValue(undefined);
  mockExtractKnowledgeFile.mockImplementation(async (node: KnowledgeNode) => {
    if (node.id === 'file-txt') {
      return { text: 'Chapter notes body', parseStatus: 'ready' as const };
    }
    if (node.id === 'file-zip') {
      return { text: '', parseStatus: 'unsupported' as const };
    }
    return { text: '', parseStatus: 'failed' as const };
  });
});

describe('resolveKnowledgeMountContext', () => {
  test('returns empty result for no node ids', async () => {
    const result = await resolveKnowledgeMountContext([]);
    expect(result).toEqual({ referenceText: '', missingNodeIds: [], unsupported: [] });
    expect(mockReadKnowledgeTree).not.toHaveBeenCalled();
  });

  test('builds referenceText from folder mount and caches extract', async () => {
    const result = await resolveKnowledgeMountContext(['folder-docs']);

    expect(result.referenceText).toContain('### notes.txt');
    expect(result.referenceText).toContain('Chapter notes body');
    expect(result.missingNodeIds).toEqual([]);
    expect(result.unsupported).toEqual([]);
    expect(mockExtractKnowledgeFile).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'file-txt' }),
    );
    expect(mockWriteKnowledgeExtract).toHaveBeenCalledWith('file-txt', 'Chapter notes body');
  });

  test('uses cached extract when present', async () => {
    mockReadKnowledgeExtract.mockImplementation(async (nodeId: string) => {
      if (nodeId === 'file-txt') return 'Cached notes';
      return null;
    });

    const result = await resolveKnowledgeMountContext(['file-txt']);

    expect(result.referenceText).toBe('### notes.txt\nCached notes');
    expect(mockExtractKnowledgeFile).not.toHaveBeenCalled();
  });

  test('reports missing node ids', async () => {
    const result = await resolveKnowledgeMountContext(['folder-docs', 'ghost-id']);

    expect(result.missingNodeIds).toEqual(['ghost-id']);
    expect(result.referenceText).toContain('notes.txt');
  });

  test('collects unsupported file node ids', async () => {
    const result = await resolveKnowledgeMountContext(['file-zip']);

    expect(result.unsupported).toEqual(['file-zip']);
    expect(result.referenceText).not.toContain('bundle.zip');
  });
});
