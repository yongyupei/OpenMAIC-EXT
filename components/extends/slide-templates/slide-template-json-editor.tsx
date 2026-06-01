/**
 * @extends-from components/slide-templates/slide-template-json-editor.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ZodError } from 'zod';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { slideTemplateSchema } from '@/lib/slide-templates/schema';
import type { SlideTemplateInput } from '@/lib/slide-templates/schema';
import type { SlideTemplateRecord } from '@/lib/slide-templates/types';
import { useI18n } from '@/lib/hooks/use-i18n';

export type SlideTemplateSavePayload = Omit<
  SlideTemplateInput,
  'id' | 'createdAt' | 'updatedAt' | 'scope' | 'projectId'
>;

export interface SlideTemplateJsonEditorProps {
  readonly template: SlideTemplateRecord;
  readonly onSave: (payload: SlideTemplateSavePayload) => Promise<void>;
  readonly readOnly?: boolean;
  readonly saving?: boolean;
}

function toEditorJson(template: SlideTemplateRecord, readOnly: boolean): string {
  if (readOnly) {
    return JSON.stringify(template, null, 2);
  }
  const payload: SlideTemplateSavePayload = {
    name: template.name,
    description: template.description,
    theme: template.theme,
    layouts: template.layouts,
    ...(template.forkedFromId ? { forkedFromId: template.forkedFromId } : {}),
    ...(template.ownerId ? { ownerId: template.ownerId } : {}),
    ...(template.workspaceId ? { workspaceId: template.workspaceId } : {}),
  };
  return JSON.stringify(payload, null, 2);
}

function formatZodIssues(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${String(issue.path.join('.'))}: ` : '';
      return `${path}${issue.message}`;
    })
    .join('\n');
}

function SlideTemplateJsonEditorBody({
  template,
  onSave,
  readOnly = false,
  saving = false,
}: SlideTemplateJsonEditorProps) {
  const { t } = useI18n();
  const [text, setText] = useState(() => toEditorJson(template, readOnly));
  const [parseError, setParseError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const validate = useCallback(
    (raw: string): SlideTemplateSavePayload | null => {
      setParseError(null);
      setValidationError(null);

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch (error) {
        const message = error instanceof Error ? error.message : t('slideTemplates.jsonInvalid');
        setParseError(message);
        return null;
      }

      const withScope = {
        ...(parsed as Record<string, unknown>),
        scope: template.scope,
        ...(template.projectId ? { projectId: template.projectId } : {}),
      };

      const result = slideTemplateSchema.safeParse(withScope);
      if (!result.success) {
        setValidationError(formatZodIssues(result.error));
        return null;
      }

      const {
        id: _id,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        scope: _scope,
        projectId: _projectId,
        ...payload
      } = result.data;

      return payload;
    },
    [t, template.projectId, template.scope],
  );

  const dirty = useMemo(() => text !== toEditorJson(template, readOnly), [text, template, readOnly]);

  const handleSave = async () => {
    const payload = validate(text);
    if (!payload) return;
    await onSave(payload);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setParseError(null);
          setValidationError(null);
        }}
        readOnly={readOnly}
        className="min-h-[320px] flex-1 resize-y font-mono text-xs leading-relaxed lg:min-h-[420px]"
        spellCheck={false}
      />
      {parseError ? (
        <p className="text-sm text-destructive" role="alert">
          {t('slideTemplates.jsonInvalid')}: {parseError}
        </p>
      ) : null}
      {validationError ? (
        <pre className="max-h-32 overflow-auto rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive whitespace-pre-wrap">
          {t('slideTemplates.validationFailed')}
          {'\n'}
          {validationError}
        </pre>
      ) : null}
      {!readOnly ? (
        <div className="flex justify-end">
          <Button type="button" onClick={() => void handleSave()} disabled={saving || !dirty}>
            {saving ? t('slideTemplates.saving') : t('slideTemplates.save')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function SlideTemplateJsonEditor(props: SlideTemplateJsonEditorProps) {
  return (
    <SlideTemplateJsonEditorBody
      key={`${props.template.id}:${props.template.updatedAt}:${props.readOnly}`}
      {...props}
    />
  );
}
