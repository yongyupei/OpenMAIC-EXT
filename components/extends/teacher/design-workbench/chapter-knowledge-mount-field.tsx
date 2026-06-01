/**
 * @extends-from components/teacher/design-workbench/chapter-knowledge-mount-field.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { KnowledgePicker } from '@/components/knowledge-base/knowledge-picker';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Label } from '@/components/ui/label';

export interface ChapterKnowledgeMountFieldProps {
  readonly selectedNodeIds: string[];
  readonly onChange: (nodeIds: string[]) => void;
  readonly disabled?: boolean;
}

export function ChapterKnowledgeMountField({
  selectedNodeIds,
  onChange,
  disabled,
}: ChapterKnowledgeMountFieldProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-2">
      <div>
        <Label className="text-xs">{t('knowledgeBase.chapterMount.title')}</Label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {t('knowledgeBase.chapterMount.hint')}
        </p>
      </div>
      <KnowledgePicker selectedNodeIds={selectedNodeIds} onChange={onChange} disabled={disabled} />
    </div>
  );
}
