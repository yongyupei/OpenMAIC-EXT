/**
 * @extends-from components/knowledge-base/knowledge-base-design-panel.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useCallback, useRef, useState } from 'react';
import { Download, FolderPlus, Loader2, RefreshCw, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { KnowledgeDriveBrowser } from '@/components/knowledge-base/knowledge-drive-browser';
import { KnowledgeBaseNodeInspector } from '@/components/knowledge-base/knowledge-base-node-inspector';
import { ProposalDiffPanel } from '@/components/knowledge-base/proposal-diff-panel';
import {
  createFolder,
  downloadKnowledgeBaseArchive,
  uploadKnowledgeFile,
} from '@/lib/knowledge-base/client';
import { KNOWLEDGE_FILE_ACCEPT } from '@/lib/knowledge-base/file-types';
import {
  KNOWLEDGE_ROOT_NODE_ID,
  resolveKnowledgeActionParentId,
} from '@/lib/knowledge-base/tree-utils';
import type { AiPlanProposal, KnowledgeNode } from '@/lib/knowledge-base/types';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface KnowledgeBaseDesignPanelProps {
  readonly loading: boolean;
  readonly nodes: KnowledgeNode[];
  readonly selectedId: string | null;
  readonly selectedNode: KnowledgeNode | null;
  readonly proposal: AiPlanProposal | null;
  readonly reparsing: boolean;
  readonly onSelect: (id: string) => void;
  readonly onRefresh: () => void;
  readonly onReparse: () => void;
  readonly onProposalApplied: () => void;
  readonly onProposalDiscarded: () => void;
  readonly className?: string;
}

export function KnowledgeBaseDesignPanel({
  loading,
  nodes,
  selectedId,
  selectedNode,
  proposal,
  reparsing,
  onSelect,
  onRefresh,
  onReparse,
  onProposalApplied,
  onProposalDiscarded,
  className,
}: KnowledgeBaseDesignPanelProps) {
  const { t } = useI18n();
  const bulkUploadInputRef = useRef<HTMLInputElement>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState(KNOWLEDGE_ROOT_NODE_ID);

  const toolbarDisabled = loading || actionBusy;

  const resolveParentId = useCallback(() => {
    if (selectedNode?.type === 'folder') return selectedNode.id;
    if (selectedNode?.type === 'file' && selectedNode.parentId) {
      return resolveKnowledgeActionParentId(selectedNode, nodes);
    }
    return currentFolderId;
  }, [currentFolderId, nodes, selectedNode]);

  const handleCreateDirectory = useCallback(async () => {
    const name = window.prompt(t('knowledgeBase.newFolderPrompt'));
    if (!name?.trim()) return;
    setActionBusy(true);
    try {
      await createFolder(resolveParentId(), name.trim());
      toast.success(t('knowledgeBase.newFolderSuccess'));
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('knowledgeBase.newFolderFailed'));
    } finally {
      setActionBusy(false);
    }
  }, [onRefresh, resolveParentId, t]);

  const handleBulkUploadChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files ? [...event.target.files] : [];
      event.target.value = '';
      if (files.length === 0) return;

      const parentId = resolveParentId();
      setActionBusy(true);
      let uploaded = 0;
      try {
        for (const file of files) {
          await uploadKnowledgeFile(file, parentId);
          uploaded += 1;
        }
        toast.success(t('knowledgeBase.bulkUploadSuccess', { count: String(uploaded) }));
        onRefresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : t('knowledgeBase.uploadFailed');
        if (uploaded > 0) {
          toast.error(t('knowledgeBase.bulkUploadPartial', { count: String(uploaded), error: message }));
          onRefresh();
        } else {
          toast.error(message);
        }
      } finally {
        setActionBusy(false);
      }
    },
    [onRefresh, resolveParentId, t],
  );

  const handleBulkDownload = useCallback(async () => {
    setActionBusy(true);
    try {
      const scopeId = selectedNode?.id ?? null;
      await downloadKnowledgeBaseArchive(scopeId);
      toast.success(t('knowledgeBase.bulkDownloadSuccess'));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('knowledgeBase.bulkDownloadFailed');
      if (message.toLowerCase().includes('no files')) {
        toast.error(t('knowledgeBase.bulkDownloadEmpty'));
      } else {
        toast.error(message);
      }
    } finally {
      setActionBusy(false);
    }
  }, [selectedNode, t]);

  return (
    <section
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-white/80 shadow-sm backdrop-blur dark:bg-slate-900/80',
        className,
      )}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{t('knowledgeBase.design.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('knowledgeBase.design.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <input
            ref={bulkUploadInputRef}
            type="file"
            multiple
            accept={KNOWLEDGE_FILE_ACCEPT}
            className="hidden"
            onChange={(event) => void handleBulkUploadChange(event)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={toolbarDisabled}
            onClick={() => void handleCreateDirectory()}
          >
            <FolderPlus className="mr-1.5 size-3.5" />
            {t('knowledgeBase.createDirectory')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={toolbarDisabled}
            onClick={() => bulkUploadInputRef.current?.click()}
          >
            <Upload className="mr-1.5 size-3.5" />
            {t('knowledgeBase.bulkUpload')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={toolbarDisabled}
            onClick={() => void handleBulkDownload()}
          >
            <Download className="mr-1.5 size-3.5" />
            {t('knowledgeBase.bulkDownload')}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={toolbarDisabled} onClick={onRefresh}>
            <RefreshCw className={cn('mr-1.5 size-3.5', loading && 'animate-spin')} />
            {t('knowledgeBase.refresh')}
          </Button>
        </div>
      </header>

      {proposal ? (
        <div className="max-h-40 shrink-0 overflow-y-auto border-b border-border/60 p-3">
          <ProposalDiffPanel
            proposal={proposal}
            onApplied={onProposalApplied}
            onDiscarded={onProposalDiscarded}
          />
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" />
            {t('knowledgeBase.loading')}
          </div>
        ) : (
          <KnowledgeDriveBrowser
            nodes={nodes}
            selectedId={selectedId}
            currentFolderId={currentFolderId}
            onCurrentFolderChange={setCurrentFolderId}
            onSelect={onSelect}
            onRefresh={onRefresh}
            disabled={toolbarDisabled}
          />
        )}
        <KnowledgeBaseNodeInspector
          node={selectedNode}
          reparsing={reparsing}
          onReparse={onReparse}
        />
      </div>
    </section>
  );
}
