/**
 * @extends-from components/course-editor/workflow-config-panel.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useEffect, useState } from 'react';

import { CourseModelSelectField } from '../teacher/design-workbench/course-model-select-field';
import { ChapterModelSelectField } from '../teacher/design-workbench/chapter-model-select-field';
import { CourseTtsModelSelectField } from '../teacher/design-workbench/course-tts-model-select-field';
import { ChapterTtsModelSelectField } from '../teacher/design-workbench/chapter-tts-model-select-field';
import { defaultWorkflowConfig, workflowPresets } from '@/lib/generation/workflow';
import { fetchSlideTemplate } from '@/lib/slide-templates/client';
import type { GenerationMode } from '@/lib/slide-templates/types';
import type {
  GenerationProfile,
  GenerationProfileOverride,
} from '@/lib/teacher/generation-profile';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

interface WorkflowConfigPanelProps {
  readonly selectedWorkflowId: string;
  readonly onSelectWorkflow: (workflowId: string) => void;
  readonly className?: string;
  /** When true, omits the top heading block (use when wrapped in a dialog title). */
  readonly hideTitle?: boolean;
  readonly projectSlideTemplateId?: string;
  readonly projectGenerationMode?: GenerationMode;
  readonly generationProfile?: GenerationProfile;
  readonly onGenerationProfileChange?: (profile: GenerationProfile | undefined) => void;
  readonly chapterId?: string;
  readonly generationProfileOverride?: GenerationProfileOverride;
  readonly onGenerationProfileOverrideChange?: (
    override: GenerationProfileOverride | undefined,
  ) => void;
}

export function WorkflowConfigPanel({
  selectedWorkflowId,
  onSelectWorkflow,
  className,
  hideTitle = false,
  projectSlideTemplateId,
  projectGenerationMode,
  generationProfile,
  onGenerationProfileChange,
  chapterId,
  generationProfileOverride,
  onGenerationProfileOverrideChange,
}: WorkflowConfigPanelProps) {
  const { t } = useI18n();
  const selectedWorkflow =
    workflowPresets.find((preset) => preset.id === selectedWorkflowId) ?? defaultWorkflowConfig;
  const [templateName, setTemplateName] = useState<string | null>(null);

  useEffect(() => {
    if (!projectSlideTemplateId) {
      return;
    }
    let cancelled = false;
    void fetchSlideTemplate(projectSlideTemplateId)
      .then((template) => {
        if (!cancelled) setTemplateName(template.name);
      })
      .catch(() => {
        if (!cancelled) setTemplateName(projectSlideTemplateId);
      });
    return () => {
      cancelled = true;
    };
  }, [projectSlideTemplateId]);

  const showGenerationSummary = Boolean(projectSlideTemplateId || projectGenerationMode);
  const showEditableGenerationSettings = Boolean(onGenerationProfileChange || onGenerationProfileOverrideChange);
  const isChapterScope = Boolean(chapterId && onGenerationProfileOverrideChange);

  return (
    <aside
      className={cn('h-full w-80 shrink-0 border-l bg-background p-4 overflow-y-auto', className)}
    >
      {!hideTitle && (
        <>
          <h2 className="text-sm font-semibold">{t('courseEditor.workflow')}</h2>
          <p className="mb-4 text-xs text-muted-foreground">{t('courseEditor.workflowHint')}</p>
        </>
      )}

      {showEditableGenerationSettings ? (
        <div className="mb-6 space-y-4 rounded-lg border bg-card p-3">
          <h3 className="text-xs font-medium uppercase text-muted-foreground">
            {t('courseEditor.generationSettings.title')}
          </h3>
          {isChapterScope ? (
            <>
              <ChapterModelSelectField
                generationProfileOverride={generationProfileOverride}
                courseGenerationProfile={generationProfile}
                disabled={false}
                onChange={onGenerationProfileOverrideChange!}
              />
              <ChapterTtsModelSelectField
                generationProfileOverride={generationProfileOverride}
                courseGenerationProfile={generationProfile}
                disabled={false}
                onChange={onGenerationProfileOverrideChange!}
              />
            </>
          ) : (
            <>
              <CourseModelSelectField
                generationProfile={generationProfile}
                disabled={false}
                onChange={onGenerationProfileChange!}
              />
              <CourseTtsModelSelectField
                generationProfile={generationProfile}
                disabled={false}
                onChange={onGenerationProfileChange!}
              />
            </>
          )}
        </div>
      ) : showGenerationSummary ? (
        <div className="mb-6 rounded-lg border bg-card p-3">
          <h3 className="text-xs font-medium uppercase text-muted-foreground">
            {t('courseEditor.generationSettings.title')}
          </h3>
          <dl className="mt-2 space-y-2 text-xs">
            <div>
              <dt className="text-muted-foreground">
                {t('courseEditor.generationSettings.slideTemplate')}
              </dt>
              <dd className="font-medium">
                {projectSlideTemplateId
                  ? (templateName ?? projectSlideTemplateId)
                  : t('courseEditor.generationSettings.notConfigured')}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t('courseEditor.generationSettings.generationMode')}
              </dt>
              <dd className="font-medium">
                {projectGenerationMode
                  ? t(`teacher.design.generationMode.${modeToKey(projectGenerationMode)}`)
                  : t('courseEditor.generationSettings.notConfigured')}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="space-y-3">
        {workflowPresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`w-full rounded-lg border bg-card p-3 text-left ${
              selectedWorkflowId === preset.id ? 'border-primary bg-primary/5' : ''
            }`}
            onClick={() => onSelectWorkflow(preset.id)}
          >
            <h3 className="text-sm font-medium">
              {t(`courseEditor.workflowPresets.${preset.id}.name`)}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(`courseEditor.workflowPresets.${preset.id}.description`)}
            </p>
          </button>
        ))}
      </div>

      <div className="mt-6">
        <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
          {t('courseEditor.activeWorkflow')}
        </h3>
        <ol className="space-y-2">
          {selectedWorkflow.steps.map((step, index) => (
            <li key={step.id} className="rounded-md border px-3 py-2 text-xs">
              <span className="font-medium">
                {index + 1}. {t(`courseEditor.workflowSteps.${step.type}`)}
              </span>
              <span className="ml-2 text-muted-foreground">
                {step.enabled ? t('courseEditor.enabled') : t('courseEditor.disabled')}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}

function modeToKey(mode: GenerationMode): 'materialDriven' | 'requirementDriven' | 'hybrid' {
  switch (mode) {
    case 'material-driven':
      return 'materialDriven';
    case 'requirement-driven':
      return 'requirementDriven';
    case 'hybrid':
      return 'hybrid';
  }
}
