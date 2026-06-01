/**
 * @extends-from components/teacher/design-workbench/generation-workflow-fields.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { workflowPresets } from '@/lib/generation/workflow';
import type { WorkflowStepType } from '@/lib/generation/workflow/workflow-schema';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  WORKFLOW_PRESET_IDS,
  type WorkflowPresetId,
  type WorkflowStepOverride,
} from '@/lib/teacher/generation-profile';

const STEP_TYPES: WorkflowStepType[] = [
  'outline',
  'scene-content',
  'scene-actions',
  'media',
  'tts',
  'persist',
];

export interface GenerationWorkflowFieldsProps {
  readonly workflowPresetId: WorkflowPresetId;
  readonly stepOverrides?: Partial<Record<WorkflowStepType, WorkflowStepOverride>>;
  readonly disabled?: boolean;
  readonly onPresetChange: (id: WorkflowPresetId) => void;
  readonly onStepOverridesChange: (
    overrides: Partial<Record<WorkflowStepType, WorkflowStepOverride>>,
  ) => void;
}

export function GenerationWorkflowFields({
  workflowPresetId,
  stepOverrides = {},
  disabled,
  onPresetChange,
  onStepOverridesChange,
}: GenerationWorkflowFieldsProps) {
  const { t } = useI18n();

  const selectedPreset =
    workflowPresets.find((p) => p.id === workflowPresetId) ??
    workflowPresets.find((p) => p.id === 'default-course-generation')!;

  const setStepEnabled = (type: WorkflowStepType, enabled: boolean) => {
    onStepOverridesChange({
      ...stepOverrides,
      [type]: { ...stepOverrides[type], enabled },
    });
  };

  const setOutlineRequiresApproval = (requiresApproval: boolean) => {
    onStepOverridesChange({
      ...stepOverrides,
      outline: { ...stepOverrides.outline, requiresApproval },
    });
  };

  const outlineRequiresApproval =
    stepOverrides.outline?.requiresApproval ??
    selectedPreset.steps.find((s) => s.type === 'outline')?.requiresApproval ??
    false;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {WORKFLOW_PRESET_IDS.map((id) => {
          const preset = workflowPresets.find((p) => p.id === id)!;
          const selected = workflowPresetId === id;
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              className={cn(
                'flex h-full min-h-[5.5rem] flex-col rounded-md border px-2.5 py-2 text-left transition-colors',
                selected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border/60 hover:bg-muted/40',
              )}
              onClick={() => onPresetChange(id)}
              aria-pressed={selected}
            >
              <span className="text-xs font-medium leading-snug">
                {t(`courseEditor.workflowPresets.${id}.name`, { defaultValue: preset.name })}
              </span>
              <span className="mt-1 line-clamp-3 flex-1 text-[10px] leading-relaxed text-muted-foreground">
                {t(`courseEditor.workflowPresets.${id}.description`, {
                  defaultValue: preset.description,
                })}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-border/40 pt-3">
        <Label className="text-xs">{t('teacher.design.chapterGenerationConfig.stepsTitle')}</Label>
        {STEP_TYPES.map((type) => {
          const presetStep = selectedPreset.steps.find((s) => s.type === type);
          const enabled = stepOverrides[type]?.enabled ?? presetStep?.enabled ?? true;
          return (
            <div key={type} className="flex items-center justify-between gap-2 text-sm">
              <span>{t(`courseEditor.workflowSteps.${type}`)}</span>
              <Switch
                checked={enabled}
                disabled={disabled || type === 'persist'}
                onCheckedChange={(checked) => setStepEnabled(type, checked)}
                aria-label={t(`courseEditor.workflowSteps.${type}`)}
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {t('teacher.design.chapterGenerationConfig.outlineApprovalLabel')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('teacher.design.chapterGenerationConfig.outlineApprovalHint')}
          </p>
        </div>
        <Switch
          checked={outlineRequiresApproval}
          disabled={disabled}
          onCheckedChange={setOutlineRequiresApproval}
          aria-label={t('teacher.design.chapterGenerationConfig.outlineApprovalLabel')}
        />
      </div>
    </div>
  );
}
