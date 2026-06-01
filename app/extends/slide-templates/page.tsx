/**
 * @extends-from app/slide-templates/page.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, LayoutTemplate, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { SlideTemplateEditDialog } from '@/components/slide-templates/slide-template-edit-dialog';
import { SlideTemplatePreview } from '@/components/slide-templates/slide-template-preview';
import type { SlideTemplateSavePayload } from '@/components/slide-templates/slide-template-json-editor';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  BUILTIN_DEFAULT_TEMPLATE_ID,
} from '@/lib/slide-templates/constants';
import {
  createGlobalSlideTemplate,
  deleteGlobalSlideTemplate,
  deleteProjectSlideTemplate,
  fetchSlideTemplate,
  fetchSlideTemplates,
  forkSlideTemplate,
  updateGlobalSlideTemplate,
  updateProjectSlideTemplate,
} from '@/lib/slide-templates/client';
import type { SlideTemplateRecord } from '@/lib/slide-templates/types';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

const NEW_TEMPLATE_KEY = '__new__';

function scopeLabelKey(scope: SlideTemplateRecord['scope']): 'builtin' | 'global' | 'project' {
  return scope;
}

function ThemeColorSwatches({ colors }: { readonly colors: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1" aria-hidden>
      {colors.map((color) => (
        <span
          key={color}
          className="size-4 shrink-0 rounded-full border border-black/10 dark:border-white/15"
          style={{ backgroundColor: color }}
          title={color}
        />
      ))}
    </div>
  );
}

function formatUpdatedAt(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale);
  } catch {
    return iso;
  }
}

export default function SlideTemplatesPage() {
  return (
    <Suspense fallback={null}>
      <SlideTemplatesPageContent />
    </Suspense>
  );
}

function SlideTemplatesPageContent() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectIdFromQuery = searchParams.get('projectId')?.trim() ?? '';

  const [forkProjectId, setForkProjectId] = useState(projectIdFromQuery);
  const [templates, setTemplates] = useState<SlideTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editorTemplate, setEditorTemplate] = useState<SlideTemplateRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [forking, setForking] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const activeProjectId = projectIdFromQuery || undefined;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const records = await fetchSlideTemplates({
        includeBuiltin: true,
        ...(activeProjectId ? { projectId: activeProjectId } : {}),
      });
      setTemplates(records);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('slideTemplates.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setForkProjectId(projectIdFromQuery);
  }, [projectIdFromQuery]);

  const selectedTemplate = useMemo(() => {
    if (!selectedKey || selectedKey === NEW_TEMPLATE_KEY) return editorTemplate;
    return templates.find((record) => record.id === selectedKey) ?? editorTemplate;
  }, [editorTemplate, selectedKey, templates]);

  const openBuiltinOrExisting = (id: string) => {
    setSelectedKey(id);
    setEditorTemplate(null);
  };

  const startNewGlobal = async () => {
    try {
      const builtin = await fetchSlideTemplate(BUILTIN_DEFAULT_TEMPLATE_ID);
      const draft: SlideTemplateRecord = {
        ...builtin,
        id: NEW_TEMPLATE_KEY,
        name: t('slideTemplates.newDefaultName'),
        scope: 'global',
        forkedFromId: BUILTIN_DEFAULT_TEMPLATE_ID,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setEditorTemplate(draft);
      setSelectedKey(NEW_TEMPLATE_KEY);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('slideTemplates.loadFailed'));
    }
  };

  const handleSave = async (payload: SlideTemplateSavePayload) => {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      if (selectedTemplate.scope === 'builtin') return;

      if (selectedKey === NEW_TEMPLATE_KEY) {
        const created = await createGlobalSlideTemplate(payload);
        toast.success(t('slideTemplates.createSuccess'));
        await load();
        setSelectedKey(created.id);
        setEditorTemplate(null);
        return;
      }

      if (selectedTemplate.scope === 'project' && activeProjectId) {
        await updateProjectSlideTemplate(activeProjectId, selectedTemplate.id, payload);
        toast.success(t('slideTemplates.saveSuccess'));
        await load();
        return;
      }

      if (selectedTemplate.scope === 'global') {
        await updateGlobalSlideTemplate(selectedTemplate.id, payload);
        toast.success(t('slideTemplates.saveSuccess'));
        await load();
        return;
      }

      toast.error(t('slideTemplates.saveFailed'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('slideTemplates.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGlobal = async (id: string) => {
    try {
      await deleteGlobalSlideTemplate(id);
      toast.success(t('slideTemplates.deleteSuccess'));
      if (selectedKey === id) {
        setSelectedKey(null);
        setEditorTemplate(null);
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('slideTemplates.deleteFailed'));
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!activeProjectId) return;
    try {
      await deleteProjectSlideTemplate(activeProjectId, id);
      toast.success(t('slideTemplates.deleteSuccess'));
      if (selectedKey === id) {
        setSelectedKey(null);
        setEditorTemplate(null);
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('slideTemplates.deleteFailed'));
    }
  };

  const handleFork = async (sourceId: string) => {
    const targetProjectId = forkProjectId.trim();
    if (!targetProjectId) {
      toast.error(t('slideTemplates.forkProjectIdRequired'));
      return;
    }
    setForking(true);
    try {
      const forked = await forkSlideTemplate(targetProjectId, sourceId);
      toast.success(t('slideTemplates.forkSuccess'));
      router.push(`/slide-templates?projectId=${encodeURIComponent(targetProjectId)}`);
      setSelectedKey(forked.id);
      setEditorTemplate(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('slideTemplates.forkFailed'));
    } finally {
      setForking(false);
    }
  };

  const editorReadOnly = selectedTemplate?.scope === 'builtin';
  const canDeleteGlobal = (template: SlideTemplateRecord) => template.scope === 'global';
  const canDeleteProject = (template: SlideTemplateRecord) =>
    template.scope === 'project' && Boolean(activeProjectId);

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-slate-50 to-slate-100 max-lg:overflow-y-auto lg:h-dvh lg:overflow-hidden dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 pt-6 md:gap-5 md:p-6 md:pt-8 lg:min-h-0 lg:overflow-hidden">
        <header className="flex shrink-0 flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">{t('slideTemplates.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('slideTemplates.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!activeProjectId ? (
              <Button type="button" size="sm" onClick={() => void startNewGlobal()}>
                <Plus className="mr-1 size-4" />
                {t('slideTemplates.createGlobal')}
              </Button>
            ) : null}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-6">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-medium">{t('slideTemplates.listTitle')}</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <p className="p-4 text-sm text-muted-foreground">{t('slideTemplates.loading')}</p>
              ) : templates.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">{t('slideTemplates.emptyList')}</p>
              ) : (
                <ul className="divide-y">
                  {templates.map((template) => {
                    const isSelected = selectedKey === template.id;
                    return (
                      <li key={template.id}>
                        <button
                          type="button"
                          onClick={() => openBuiltinOrExisting(template.id)}
                          className={cn(
                            'flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50',
                            isSelected && 'bg-muted/70',
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-sm">{template.name}</span>
                            {template.scope === 'builtin' ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {t('slideTemplates.readOnly')}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">
                                {t(`slideTemplates.${scopeLabelKey(template.scope)}`)}
                              </Badge>
                            )}
                          </div>
                          {template.description ? (
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              {template.description}
                            </p>
                          ) : null}
                          <ThemeColorSwatches colors={template.theme.themeColors} />
                          <p className="text-[11px] text-muted-foreground">
                            {t('slideTemplates.updatedAt')}:{' '}
                            {formatUpdatedAt(template.updatedAt, locale)}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <h2 className="text-sm font-medium">
                {selectedTemplate ? selectedTemplate.name : t('slideTemplates.editorTitle')}
              </h2>
              {selectedTemplate ? (
                <div className="flex flex-wrap items-center gap-2">
                  {!editorReadOnly ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditDialogOpen(true)}
                    >
                      <Pencil className="mr-1 size-3.5" />
                      {t('slideTemplates.editJson')}
                    </Button>
                  ) : null}
                  {selectedTemplate.scope !== 'builtin' ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={forkProjectId}
                        onChange={(event) => setForkProjectId(event.target.value)}
                        placeholder={t('slideTemplates.forkProjectId')}
                        className="h-8 w-36 text-xs"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={forking}
                        onClick={() => void handleFork(selectedTemplate.id)}
                      >
                        {t('slideTemplates.fork')}
                      </Button>
                    </div>
                  ) : null}
                  {canDeleteGlobal(selectedTemplate) ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="destructive" size="sm">
                          <Trash2 className="mr-1 size-3.5" />
                          {t('slideTemplates.delete')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('slideTemplates.delete')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('slideTemplates.deleteConfirm')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('slideTemplates.cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => void handleDeleteGlobal(selectedTemplate.id)}
                          >
                            {t('slideTemplates.delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                  {canDeleteProject(selectedTemplate) ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="destructive" size="sm">
                          <Trash2 className="mr-1 size-3.5" />
                          {t('slideTemplates.delete')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('slideTemplates.delete')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('slideTemplates.deleteConfirm')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('slideTemplates.cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => void handleDeleteProject(selectedTemplate.id)}
                          >
                            {t('slideTemplates.delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-4">
              {selectedTemplate ? (
                <>
                  <ThemeColorSwatches colors={selectedTemplate.theme.themeColors} />
                  <SlideTemplatePreview
                    key={`${selectedTemplate.id}:${selectedTemplate.updatedAt}`}
                    template={selectedTemplate}
                  />
                  {!editorReadOnly ? (
                    <p className="mt-2 text-xs text-muted-foreground">{t('slideTemplates.forkHint')}</p>
                  ) : null}
                  <SlideTemplateEditDialog
                    open={editDialogOpen}
                    onOpenChange={setEditDialogOpen}
                    template={selectedTemplate}
                    onSave={handleSave}
                    saving={saving}
                  />
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                  <LayoutTemplate className="size-10 opacity-40" />
                  <p className="text-sm">{t('slideTemplates.selectTemplate')}</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
