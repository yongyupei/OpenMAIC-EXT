/**
 * @extends-from components/teacher/design-workbench/course-generation-flow-settings-dialog.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  designWorkbenchDialogContentClassName,
  designWorkbenchDialogFooterClassName,
} from '@/components/teacher/design-workbench/design-workbench-dialog-layout';
import { GenerationWorkflowFields } from '@/components/teacher/design-workbench/generation-workflow-fields';
import { PromptOverrideList } from '@/components/teacher/design-workbench/prompt-override-list';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { WorkflowStepType } from '@/lib/generation/workflow/workflow-schema';
import {
  type GenerationProfile,
  type PromptOverride,
  type WorkflowPresetId,
  type WorkflowStepOverride,
} from '@/lib/teacher/generation-profile';
import { patchTeacherProject } from '@/lib/teacher/teacher-projects-client';

const DEFAULT_PRESET: WorkflowPresetId = 'default-course-generation';

export interface CourseGenerationFlowSettingsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly projectId: string;
  readonly generationProfile?: GenerationProfile;
  readonly onUpdated: (profile: GenerationProfile) => void;
  readonly disabled?: boolean;
}

export function CourseGenerationFlowSettingsDialog({
  open,
  onOpenChange,
  projectId,
  generationProfile,
  onUpdated,
  disabled,
}: CourseGenerationFlowSettingsDialogProps) {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);

  const presetId = generationProfile?.workflowPresetId ?? DEFAULT_PRESET;

  const [draftPresetId, setDraftPresetId] = useState<WorkflowPresetId>(presetId);
  const [draftStepOverrides, setDraftStepOverrides] = useState<
    Partial<Record<WorkflowStepType, WorkflowStepOverride>>
  >(generationProfile?.stepOverrides ?? {});
  const [draftPromptOverrides, setDraftPromptOverrides] = useState<
    Partial<Record<string, PromptOverride>>
  >(generationProfile?.promptOverrides ?? {});

  useEffect(() => {
    if (!open) return;
    setDraftPresetId(generationProfile?.workflowPresetId ?? DEFAULT_PRESET);
    setDraftStepOverrides(generationProfile?.stepOverrides ?? {});
    setDraftPromptOverrides(generationProfile?.promptOverrides ?? {});
  }, [open, generationProfile]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const hasStepOverrides = Object.values(draftStepOverrides).some((v) => v != null);
    const promptOverrides = Object.fromEntries(
      Object.entries(draftPromptOverrides).filter(
        (entry): entry is [string, PromptOverride] => entry[1] != null,
      ),
    );
    const hasPromptOverrides = Object.keys(promptOverrides).length > 0;
    const nextProfile: GenerationProfile = {
      ...(generationProfile ?? { workflowPresetId: DEFAULT_PRESET }),
      workflowPresetId: draftPresetId,
      ...(hasStepOverrides ? { stepOverrides: draftStepOverrides } : {}),
      ...(hasPromptOverrides ? { promptOverrides } : {}),
    };
    if (!hasStepOverrides && nextProfile.stepOverrides) {
      delete nextProfile.stepOverrides;
    }
    try {
      await patchTeacherProject(projectId, { generationProfile: nextProfile });
      onUpdated(nextProfile);
      toast.success(t('teacher.design.generationWorkflow.saved'));
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('teacher.design.generationWorkflow.saveFailed'),
      );
    } finally {
      setSaving(false);
    }
  }, [
    draftPresetId,
    draftStepOverrides,
    draftPromptOverrides,
    generationProfile,
    onOpenChange,
    onUpdated,
    projectId,
    t,
  ]);

  const tabTriggerClassName =
    'h-10 flex-none rounded-none px-1 pb-2.5 text-sm font-medium text-muted-foreground transition-colors data-active:text-foreground';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={designWorkbenchDialogContentClassName}>
        <DialogHeader className="shrink-0">
          <DialogTitle>{t('teacher.design.generationWorkflow.dialogTitle')}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="flow" className="flex min-h-0 flex-1 flex-col gap-3">
          <TabsList
            variant="line"
            className="h-10 w-full shrink-0 justify-start gap-8 rounded-none border-b border-border/50 bg-transparent p-0"
          >
            <TabsTrigger value="flow" className={tabTriggerClassName}>
              {t('teacher.design.chapterGenerationConfig.tabFlow')}
            </TabsTrigger>
            <TabsTrigger value="prompts" className={tabTriggerClassName}>
              {t('teacher.design.chapterGenerationConfig.tabPrompts')}
            </TabsTrigger>
          </TabsList>

          <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border/40 bg-muted/20">
            <TabsContent
              value="flow"
              className="absolute inset-0 mt-0 overflow-y-auto overscroll-contain px-4 py-4 focus-visible:outline-none"
            >
              <GenerationWorkflowFields
                workflowPresetId={draftPresetId}
                stepOverrides={draftStepOverrides}
                disabled={disabled || saving}
                onPresetChange={(id) => {
                  setDraftPresetId(id);
                  setDraftStepOverrides({});
                }}
                onStepOverridesChange={setDraftStepOverrides}
              />
            </TabsContent>

            <TabsContent
              value="prompts"
              className="absolute inset-0 mt-0 overflow-y-auto overscroll-contain px-4 py-4 focus-visible:outline-none"
            >
              <PromptOverrideList
                promptOverrides={draftPromptOverrides}
                disabled={disabled || saving}
                onChange={(overrides) => setDraftPromptOverrides(overrides ?? {})}
              />
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className={designWorkbenchDialogFooterClassName}>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={disabled || saving}>
            {saving
              ? t('teacher.design.generationWorkflow.saving')
              : t('teacher.design.generationWorkflow.saveButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
