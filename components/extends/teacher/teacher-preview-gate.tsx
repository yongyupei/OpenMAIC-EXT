/**
 * @extends-from components/teacher/teacher-preview-gate.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { motion } from 'motion/react';
import { ArrowLeft, ExternalLink, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { useI18n } from '@/lib/hooks/use-i18n';

export type TeacherPreviewGateMode = 'resume' | 'published-only' | 'draft-and-published';

export interface TeacherPreviewGateProps {
  projectTitle: string;
  mode: TeacherPreviewGateMode;
  draftOutlineCount: number;
  draftSceneCount: number;
  publishedSceneCount: number | null;
  onContinue: () => void;
  onSoftRegenerate: () => void;
  onEnterStudio: () => void;
  onBackToDesign: () => void;
  showContinue: boolean;
  showEnterStudio: boolean;
}

export function TeacherPreviewGate({
  projectTitle,
  mode,
  draftOutlineCount,
  draftSceneCount,
  publishedSceneCount,
  onContinue,
  onSoftRegenerate,
  onEnterStudio,
  onBackToDesign,
  showContinue,
  showEnterStudio,
}: TeacherPreviewGateProps) {
  const { t } = useI18n();

  const bodyKey =
    mode === 'published-only'
      ? 'teacher.preview.gateBodyPublishedOnly'
      : mode === 'draft-and-published'
        ? 'teacher.preview.gateBodyBoth'
        : 'teacher.preview.gateBodyResume';

  const publishedHint =
    publishedSceneCount != null && publishedSceneCount > 0
      ? t('teacher.preview.gatePublishedHint', { count: publishedSceneCount })
      : '';

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-10 text-center dark:from-slate-950 dark:to-slate-900">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute left-4 top-4 z-20"
      >
        <Button variant="ghost" size="sm" onClick={onBackToDesign} className="gap-2">
          <ArrowLeft className="size-4" />
          {t('teacher.preview.backToDesign')}
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative z-10 w-full max-w-lg"
      >
        <Card className="border-muted/40 bg-white/90 p-8 shadow-2xl backdrop-blur-xl dark:bg-slate-900/90 md:p-10">
          <h1 className="text-balance text-2xl font-bold tracking-tight">
            {t('teacher.preview.gateTitle', { title: projectTitle })}
          </h1>
          <p className="mt-4 text-pretty text-muted-foreground">
            {t(bodyKey, {
              scenes: draftSceneCount,
              outlines: draftOutlineCount,
            })}
          </p>
          {publishedHint ? (
            <p className="mt-2 text-sm text-muted-foreground">{publishedHint}</p>
          ) : null}

          <div className="mt-8 flex flex-col gap-3">
            {showContinue ? (
              <Button size="lg" className="h-12 w-full gap-2" onClick={onContinue}>
                <Play className="size-4" />
                {t('teacher.preview.continueGeneration')}
              </Button>
            ) : null}

            {showEnterStudio ? (
              <Button
                size="lg"
                variant="secondary"
                className="h-12 w-full gap-2"
                onClick={onEnterStudio}
              >
                <ExternalLink className="size-4" />
                {t('teacher.preview.enterStudio')}
              </Button>
            ) : null}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="lg" variant="outline" className="h-12 w-full gap-2">
                  <RefreshCw className="size-4" />
                  {t('teacher.preview.softRegenerate')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('teacher.preview.softRegenerateConfirmTitle')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('teacher.preview.softRegenerateConfirmDescription')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={onSoftRegenerate}>
                    {t('common.confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
