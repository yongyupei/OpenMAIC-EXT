/**
 * @extends-from components/slide-templates/slide-template-picker.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchSlideTemplates } from '@/lib/slide-templates/client';
import type { SlideTemplateRecord } from '@/lib/slide-templates/types';
import { useI18n } from '@/lib/hooks/use-i18n';

const INHERIT_VALUE = '__inherit__';

export interface SlideTemplatePickerProps {
  readonly value?: string;
  readonly onChange: (templateId: string | undefined) => void;
  readonly projectId?: string;
  readonly showBuiltin?: boolean;
  readonly showGlobal?: boolean;
  readonly showProject?: boolean;
  readonly allowInherit?: boolean;
  readonly disabled?: boolean;
}

function groupTemplates(
  templates: SlideTemplateRecord[],
  opts: { showBuiltin: boolean; showGlobal: boolean; showProject: boolean },
): {
  builtin: SlideTemplateRecord[];
  global: SlideTemplateRecord[];
  project: SlideTemplateRecord[];
} {
  const builtin: SlideTemplateRecord[] = [];
  const global: SlideTemplateRecord[] = [];
  const project: SlideTemplateRecord[] = [];

  for (const template of templates) {
    if (template.scope === 'builtin' && opts.showBuiltin) {
      builtin.push(template);
    } else if (template.scope === 'global' && opts.showGlobal) {
      global.push(template);
    } else if (template.scope === 'project' && opts.showProject) {
      project.push(template);
    }
  }

  return { builtin, global, project };
}

export function SlideTemplatePicker({
  value,
  onChange,
  projectId,
  showBuiltin = true,
  showGlobal = true,
  showProject = true,
  allowInherit = false,
  disabled,
}: SlideTemplatePickerProps) {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<SlideTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- Load templates when project or scope changes */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void fetchSlideTemplates({
      includeBuiltin: showBuiltin,
      ...(projectId ? { projectId } : {}),
    })
      .then((records) => {
        if (!cancelled) setTemplates(records);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : t('slideTemplates.loadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, showBuiltin, t]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const grouped = useMemo(
    () =>
      groupTemplates(templates, {
        showBuiltin,
        showGlobal,
        showProject: showProject && Boolean(projectId),
      }),
    [projectId, showBuiltin, showGlobal, showProject, templates],
  );

  const handleValueChange = (next: string) => {
    if (next === INHERIT_VALUE) {
      onChange(undefined);
      return;
    }
    onChange(next);
  };

  const selectValue = allowInherit ? (value ?? INHERIT_VALUE) : value;

  return (
    <Select
      {...(selectValue !== undefined ? { value: selectValue } : {})}
      onValueChange={handleValueChange}
      disabled={disabled || loading || Boolean(loadError)}
    >
      <SelectTrigger className="h-9 w-full text-sm">
        <SelectValue
          placeholder={
            loading
              ? t('slideTemplates.loading')
              : loadError ?? t('slideTemplates.selectPlaceholder')
          }
        />
      </SelectTrigger>
      <SelectContent>
        {allowInherit ? (
          <SelectItem value={INHERIT_VALUE} className="text-sm">
            {t('teacher.design.generationMode.inheritCourseDefault')}
          </SelectItem>
        ) : null}
        {grouped.builtin.length > 0 ? (
          <SelectGroup>
            <SelectLabel>{t('slideTemplates.builtin')}</SelectLabel>
            {grouped.builtin.map((template) => (
              <SelectItem key={template.id} value={template.id} className="text-sm">
                {template.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ) : null}
        {grouped.global.length > 0 ? (
          <SelectGroup>
            <SelectLabel>{t('slideTemplates.global')}</SelectLabel>
            {grouped.global.map((template) => (
              <SelectItem key={template.id} value={template.id} className="text-sm">
                {template.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ) : null}
        {grouped.project.length > 0 ? (
          <SelectGroup>
            <SelectLabel>{t('slideTemplates.project')}</SelectLabel>
            {grouped.project.map((template) => (
              <SelectItem key={template.id} value={template.id} className="text-sm">
                {template.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ) : null}
      </SelectContent>
    </Select>
  );
}

export function resolveTemplateName(
  templates: readonly SlideTemplateRecord[],
  templateId: string | undefined,
): string | undefined {
  if (!templateId) return undefined;
  return templates.find((template) => template.id === templateId)?.name;
}
