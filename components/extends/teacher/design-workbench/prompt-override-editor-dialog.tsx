/**
 * @extends-from components/teacher/design-workbench/prompt-override-editor-dialog.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { PromptMarkdownField } from '@/components/teacher/design-workbench/prompt-markdown-field';
import {
  designWorkbenchDialogFooterClassName,
  promptOverrideDialogContentClassName,
} from '@/components/teacher/design-workbench/design-workbench-dialog-layout';
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
import type { GenerationPromptAllowlistId } from '@/lib/prompts/generation-prompt-allowlist';
import { PROMPT_OVERRIDE_MAX_CHARS } from '@/lib/teacher/generation-prompt-catalog';
import type { PromptOverride } from '@/lib/teacher/generation-profile';

interface PromptDefaultPayload {
  system: string;
  user: string;
}

export interface PromptOverrideEditorDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly promptId: GenerationPromptAllowlistId | null;
  readonly label: string;
  readonly override?: PromptOverride;
  readonly disabled?: boolean;
  readonly onSave: (override: PromptOverride | undefined) => void;
}

export function PromptOverrideEditorDialog({
  open,
  onOpenChange,
  promptId,
  label,
  override,
  disabled,
  onSave,
}: PromptOverrideEditorDialogProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<PromptDefaultPayload | null>(null);
  const [draftSystem, setDraftSystem] = useState('');
  const [draftUser, setDraftUser] = useState('');
  const [activePromptTab, setActivePromptTab] = useState<'system' | 'user'>('system');

  useEffect(() => {
    if (!open || !promptId) return;
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setLoadError(null);
      setDefaults(null);
      setActivePromptTab('system');

      try {
        const res = await fetch(`/api/extends/teacher/prompts/${encodeURIComponent(promptId)}/default`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { system?: string; user?: string };
        if (cancelled) return;
        const loaded = {
          system: json.system ?? '',
          user: json.user ?? '',
        };
        setDefaults(loaded);
        setDraftSystem(override?.system ?? '');
        setDraftUser(override?.user ?? '');
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'load failed');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, promptId, override?.system, override?.user]);

  const buildOverridePayload = (): PromptOverride | undefined => {
    if (!draftSystem.trim() && !draftUser.trim()) {
      return undefined;
    }
    return {
      ...(draftSystem.trim() ? { system: draftSystem } : {}),
      ...(draftUser.trim() ? { user: draftUser } : {}),
    };
  };

  const handleReset = () => {
    if (!defaults) return;
    setDraftSystem(defaults.system);
    setDraftUser(defaults.user);
    onSave(undefined);
  };

  const handleSave = () => {
    onSave(buildOverridePayload());
    onOpenChange(false);
  };

  const showUserTab = Boolean(defaults?.user?.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={promptOverrideDialogContentClassName}>
        <DialogHeader className="shrink-0">
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('teacher.design.promptOverride.loadingDefault')}
            </div>
          ) : loadError ? (
            <p className="text-sm text-destructive" role="alert">
              {t('teacher.design.promptOverride.loadFailed', { message: loadError })}
            </p>
          ) : defaults ? (
            <Tabs
              value={activePromptTab}
              onValueChange={(next) => {
                if (next === 'system' || next === 'user') setActivePromptTab(next);
              }}
              className="flex min-h-0 flex-1 flex-col gap-3"
            >
              <TabsList className="w-fit shrink-0">
                <TabsTrigger value="system">{t('teacher.design.promptOverride.tabSystem')}</TabsTrigger>
                {showUserTab ? (
                  <TabsTrigger value="user">{t('teacher.design.promptOverride.tabUser')}</TabsTrigger>
                ) : null}
              </TabsList>

              <TabsContent
                value="system"
                className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
              >
                <PromptMarkdownField
                  id="prompt-override-system"
                  label={t('teacher.design.promptOverride.systemLabel')}
                  value={draftSystem}
                  onChange={setDraftSystem}
                  disabled={disabled}
                  maxChars={PROMPT_OVERRIDE_MAX_CHARS}
                  placeholder={t('teacher.design.promptOverride.systemPlaceholder')}
                />
              </TabsContent>

              {showUserTab ? (
                <TabsContent
                  value="user"
                  className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                >
                  <PromptMarkdownField
                    id="prompt-override-user"
                    label={t('teacher.design.promptOverride.userLabel')}
                    value={draftUser}
                    onChange={setDraftUser}
                    disabled={disabled}
                    maxChars={PROMPT_OVERRIDE_MAX_CHARS}
                    placeholder={t('teacher.design.promptOverride.userPlaceholder')}
                  />
                </TabsContent>
              ) : null}
            </Tabs>
          ) : null}
        </div>

        <DialogFooter className={designWorkbenchDialogFooterClassName}>
          <Button
            type="button"
            variant="ghost"
            onClick={handleReset}
            disabled={disabled || loading || !defaults}
          >
            {t('teacher.design.promptOverride.resetToDefault')}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleSave} disabled={disabled || loading || !defaults}>
            {t('teacher.design.promptOverride.applyOverride')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
