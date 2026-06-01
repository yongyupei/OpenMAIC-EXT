/**
 * @extends-from components/knowledge-base/proposal-diff-panel.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import type { AiPlanProposal, PlanOperation } from '@/lib/knowledge-base/types';
import { applyProposal, discardProposal } from '@/lib/knowledge-base/client';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export interface ProposalDiffPanelProps {
  readonly proposal: AiPlanProposal;
  readonly onApplied: () => void;
  readonly onDiscarded: () => void;
  readonly busy?: boolean;
}

function formatOperation(
  operation: PlanOperation,
  t: (key: string, vars?: Record<string, string>) => string,
): string {
  switch (operation.op) {
    case 'mkdir':
      return t('knowledgeBase.proposal.opMkdir', { name: operation.name });
    case 'move':
      return t('knowledgeBase.proposal.opMove', {
        name: operation.newName ?? operation.nodeId,
      });
    case 'rename':
      return t('knowledgeBase.proposal.opRename', {
        name: operation.newName,
      });
    case 'delete':
      return t('knowledgeBase.proposal.opDelete', { id: operation.nodeId });
    case 'assign':
      return t('knowledgeBase.proposal.opAssign', { name: operation.name });
    case 'remove':
      return t('knowledgeBase.proposal.opRemove', { id: operation.nodeId });
    default:
      return JSON.stringify(operation);
  }
}

export function ProposalDiffPanel({
  proposal,
  onApplied,
  onDiscarded,
  busy,
}: ProposalDiffPanelProps) {
  const { t } = useI18n();
  const [acting, setActing] = useState(false);
  const disabled = busy || acting;

  const handleApply = async () => {
    setActing(true);
    try {
      await applyProposal(proposal.id);
      toast.success(t('knowledgeBase.proposal.applySuccess'));
      onApplied();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('knowledgeBase.proposal.applyFailed'));
    } finally {
      setActing(false);
    }
  };

  const handleDiscard = async () => {
    setActing(true);
    try {
      await discardProposal(proposal.id);
      toast.success(t('knowledgeBase.proposal.discardSuccess'));
      onDiscarded();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('knowledgeBase.proposal.discardFailed'),
      );
    } finally {
      setActing(false);
    }
  };

  return (
    <Card className="border-violet-200/80 bg-violet-50/40 dark:border-violet-900/50 dark:bg-violet-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('knowledgeBase.proposal.pendingTitle')}</CardTitle>
        <CardDescription>{proposal.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-1.5 text-sm">
          {proposal.operations.map((operation, index) => (
            <li key={`${operation.op}-${index}`} className="flex gap-2 text-muted-foreground">
              <span className="text-violet-600 dark:text-violet-400">•</span>
              <span>{formatOperation(operation, t)}</span>
            </li>
          ))}
        </ul>
        <ProposalActionButtons
          disabled={disabled}
          acting={acting}
          onApply={() => void handleApply()}
          onDiscard={() => void handleDiscard()}
          t={t}
        />
      </CardContent>
    </Card>
  );
}

function ProposalActionButtons({
  disabled,
  acting,
  onApply,
  onDiscard,
  t,
}: {
  disabled: boolean;
  acting: boolean;
  onApply: () => void;
  onDiscard: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={disabled} onClick={onApply}>
        {acting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        {t('knowledgeBase.proposal.apply')}
      </Button>
      <Button type="button" variant="outline" disabled={disabled} onClick={onDiscard}>
        {t('knowledgeBase.proposal.discard')}
      </Button>
    </div>
  );
}
