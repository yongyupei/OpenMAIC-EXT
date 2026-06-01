'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/hooks/use-i18n';
import { ProjectTraceListPane } from './project-trace-list-pane';

export function ProjectTraceDrawer({
  projectId,
  open,
  onOpenChange,
}: {
  readonly projectId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="fixed inset-y-0 right-0 left-auto top-0 flex h-full max-h-full w-full max-w-3xl translate-x-0 translate-y-0 flex-col gap-4 rounded-none rounded-l-xl p-4 sm:max-w-3xl"
        data-testid="project-trace-drawer"
      >
        <DialogHeader>
          <DialogTitle>{t('observability.menuLabel')}</DialogTitle>
        </DialogHeader>
        {open ? (
          <ProjectTraceListPane projectId={projectId} enabled className="flex-1" />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
