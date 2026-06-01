/**
 * @extends-from app/knowledge-base/page.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { KnowledgeBaseAssistant } from '@/components/knowledge-base/knowledge-base-assistant';
import { KnowledgeBaseDesignPanel } from '@/components/knowledge-base/knowledge-base-design-panel';
import { fetchKnowledgeBase, reparseKnowledgeFile } from '@/lib/knowledge-base/client';
import { knowledgeBasePanelShellClassName } from '@/lib/knowledge-base/ui-layout';
import type { AiPlanProposal, KnowledgeNode } from '@/lib/knowledge-base/types';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Button } from '@/components/ui/button';

export default function KnowledgeBasePage() {
  const { t } = useI18n();
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [proposal, setProposal] = useState<AiPlanProposal | null>(null);
  const [reparsing, setReparsing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchKnowledgeBase();
      setNodes(data.nodes);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('knowledgeBase.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  const handleReparse = async () => {
    if (!selectedNode || selectedNode.type !== 'file') return;
    setReparsing(true);
    try {
      await reparseKnowledgeFile(selectedNode.id);
      toast.success(t('knowledgeBase.reparseSuccess'));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('knowledgeBase.reparseFailed'));
    } finally {
      setReparsing(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-slate-50 to-slate-100 max-lg:overflow-y-auto lg:h-dvh lg:overflow-hidden dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 pt-6 md:gap-5 md:p-6 md:pt-8 lg:min-h-0 lg:overflow-hidden">
        <header className="flex shrink-0 flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t('knowledgeBase.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('knowledgeBase.subtitle')}</p>
          </div>
        </header>

        <div className="flex flex-col gap-4 md:gap-6 lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(440px,520px)] lg:items-stretch xl:grid-cols-[minmax(0,1fr)_540px]">
          <KnowledgeBaseDesignPanel
            className={knowledgeBasePanelShellClassName}
            loading={loading}
            nodes={nodes}
            selectedId={selectedId}
            selectedNode={selectedNode}
            proposal={proposal}
            reparsing={reparsing}
            onSelect={setSelectedId}
            onRefresh={() => void load()}
            onReparse={() => void handleReparse()}
            onProposalApplied={() => {
              setProposal(null);
              void load();
            }}
            onProposalDiscarded={() => setProposal(null)}
          />

          <KnowledgeBaseAssistant
            className={knowledgeBasePanelShellClassName}
            nodes={nodes}
            selectedNode={selectedNode}
            onRefresh={() => void load()}
            onProposalCreated={setProposal}
            onProposalResolved={() => setProposal(null)}
          />
        </div>
      </div>
    </div>
  );
}
