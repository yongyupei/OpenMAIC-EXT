/**
 * @extends-from tests/knowledge-base/proposal-apply.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';

import { applyProposalOperations } from '@/lib/knowledge-base/proposal-apply';
import type { KnowledgeNode, PlanOperation } from '@/lib/knowledge-base/types';

const rootNode: KnowledgeNode = {
  id: 'root',
  parentId: null,
  type: 'folder',
  name: 'Root',
  displayPath: '/',
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('applyProposalOperations', () => {
  test('mkdir then assign under temp folder resolves paths', () => {
    const stagingFiles = new Map([
      [
        'temp-file-1',
        { buffer: Buffer.from('hello knowledge'), originalName: 'notes.txt', mimeType: 'text/plain' },
      ],
    ]);

    const operations: PlanOperation[] = [
      { op: 'mkdir', parentId: 'root', name: 'Imports', tempId: 'temp-folder-1' },
      { op: 'assign', tempFileId: 'temp-file-1', parentId: 'temp-folder-1', name: 'notes.txt' },
    ];

    const assignedNodeIds = new Map<string, string>();
    const result = applyProposalOperations([rootNode], operations, {
      stagingFiles,
      assignedNodeIds,
    });

    const folder = result.find((n) => n.name === 'Imports' && n.type === 'folder');
    expect(folder).toBeDefined();
    expect(folder?.parentId).toBe('root');
    expect(folder?.displayPath).toBe('/Imports');

    const fileId = assignedNodeIds.get('temp-file-1');
    expect(fileId).toBeDefined();

    const file = result.find((n) => n.id === fileId);
    expect(file?.type).toBe('file');
    expect(file?.parentId).toBe(folder?.id);
    expect(file?.displayPath).toBe('/Imports/notes.txt');
    expect(file?.file?.originalName).toBe('notes.txt');
    expect(file?.file?.parseStatus).toBe('pending');
    expect(file?.file?.category).toBe('text');
  });

  test('move and rename update display paths', () => {
    const nodes: KnowledgeNode[] = [
      rootNode,
      {
        id: 'f1',
        parentId: 'root',
        type: 'folder',
        name: 'A',
        displayPath: '/A',
        sortOrder: 0,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'f2',
        parentId: 'root',
        type: 'folder',
        name: 'B',
        displayPath: '/B',
        sortOrder: 1,
        createdAt: '',
        updatedAt: '',
      },
    ];

    const operations: PlanOperation[] = [
      { op: 'move', nodeId: 'f1', newParentId: 'f2' },
      { op: 'rename', nodeId: 'f1', newName: 'Renamed' },
    ];

    const result = applyProposalOperations(nodes, operations);
    const moved = result.find((n) => n.id === 'f1');
    expect(moved?.parentId).toBe('f2');
    expect(moved?.name).toBe('Renamed');
    expect(moved?.displayPath).toBe('/B/Renamed');
  });

  test('delete removes node and descendants', () => {
    const nodes: KnowledgeNode[] = [
      rootNode,
      {
        id: 'folder',
        parentId: 'root',
        type: 'folder',
        name: 'Trash',
        displayPath: '/Trash',
        sortOrder: 0,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'file1',
        parentId: 'folder',
        type: 'file',
        name: 'x.txt',
        displayPath: '/Trash/x.txt',
        sortOrder: 0,
        createdAt: '',
        updatedAt: '',
        file: {
          storageKey: 'file1',
          originalName: 'x.txt',
          mimeType: 'text/plain',
          size: 1,
          category: 'text',
          parseStatus: 'ready',
        },
      },
    ];

    const result = applyProposalOperations(nodes, [{ op: 'delete', nodeId: 'folder' }]);
    expect(result.find((n) => n.id === 'folder')).toBeUndefined();
    expect(result.find((n) => n.id === 'file1')).toBeUndefined();
    expect(result).toHaveLength(1);
  });

  test('throws when assign missing staging file', () => {
    expect(() =>
      applyProposalOperations([rootNode], [
        { op: 'assign', tempFileId: 'missing', parentId: 'root', name: 'a.pdf' },
      ]),
    ).toThrow(/Staging file not found/);
  });

  test('throws when deleting root', () => {
    expect(() =>
      applyProposalOperations([rootNode], [{ op: 'delete', nodeId: 'root' }]),
    ).toThrow(/Cannot delete root/);
  });
});
