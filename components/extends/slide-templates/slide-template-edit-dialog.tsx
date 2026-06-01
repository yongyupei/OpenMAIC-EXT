/**
 * @extends-from components/slide-templates/slide-template-edit-dialog.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import {
  SlideTemplateJsonEditor,
  type SlideTemplateSavePayload,
} from '@/components/slide-templates/slide-template-json-editor';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SlideTemplateRecord } from '@/lib/slide-templates/types';
import { useI18n } from '@/lib/hooks/use-i18n';

export interface SlideTemplateEditDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly template: SlideTemplateRecord;
  readonly onSave: (payload: SlideTemplateSavePayload) => Promise<void>;
  readonly saving?: boolean;
}

export function SlideTemplateEditDialog({
  open,
  onOpenChange,
  template,
  onSave,
  saving = false,
}: SlideTemplateEditDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{t('slideTemplates.editJsonTitle')}</DialogTitle>
          <DialogDescription>{t('slideTemplates.editJsonDescription')}</DialogDescription>
        </DialogHeader>
        <SlideTemplateJsonEditor
          template={template}
          onSave={async (payload) => {
            await onSave(payload);
            onOpenChange(false);
          }}
          saving={saving}
        />
      </DialogContent>
    </Dialog>
  );
}
