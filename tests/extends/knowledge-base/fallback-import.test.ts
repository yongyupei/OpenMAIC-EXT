/**
 * @extends-from tests/knowledge-base/fallback-import.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';

import { createFallbackImportProposal } from '@/lib/knowledge-base/ai-plan';
import type { StagingManifest } from '@/lib/knowledge-base/proposal-apply';

describe('createFallbackImportProposal', () => {
  test('single file assigns to root', () => {
    const manifest: StagingManifest = {
      uploadId: 'up1',
      files: [
        {
          tempFileId: 't1',
          originalName: 'notes.pdf',
          mimeType: 'application/pdf',
          size: 100,
        },
      ],
    };
    const proposal = createFallbackImportProposal(manifest);
    expect(proposal.operations).toHaveLength(1);
    expect(proposal.operations[0]).toMatchObject({
      op: 'assign',
      tempFileId: 't1',
      parentId: 'root',
      name: 'notes.pdf',
    });
  });

  test('multiple files mkdir then assign', () => {
    const manifest: StagingManifest = {
      uploadId: 'up2',
      files: [
        {
          tempFileId: 't1',
          originalName: 'a.pdf',
          mimeType: 'application/pdf',
          size: 1,
        },
        {
          tempFileId: 't2',
          originalName: 'b.pdf',
          mimeType: 'application/pdf',
          size: 2,
        },
      ],
    };
    const proposal = createFallbackImportProposal(manifest, { folderName: 'Batch' });
    expect(proposal.operations[0]).toMatchObject({ op: 'mkdir', name: 'Batch', tempId: 'import-folder' });
    expect(proposal.operations.filter((op) => op.op === 'assign')).toHaveLength(2);
  });
});
