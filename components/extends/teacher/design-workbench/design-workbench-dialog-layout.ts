/** Shared shell sizing for design-workbench course-level settings dialogs. */
export const designWorkbenchDialogContentClassName =
  'flex h-[min(640px,85vh)] w-full max-w-4xl flex-col gap-4 overflow-hidden p-6';

/** Equal spacing between footer actions (cancel / apply / reset, etc.). */
export const designWorkbenchDialogFooterClassName =
  'shrink-0 gap-3 border-t border-border/40 pt-4 sm:flex-row sm:justify-end';

/** Taller shell for per-prompt override editor (System / User tabs + markdown preview). */
export const promptOverrideDialogContentClassName =
  'flex h-[min(720px,90vh)] w-full max-w-4xl flex-col gap-4 overflow-hidden p-6';
