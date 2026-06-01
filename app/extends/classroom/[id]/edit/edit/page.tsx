/**
 * @extends-from app/classroom/[id]/edit/edit/page.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { CourseEditorShell } from '@/components/course-editor/course-editor-shell';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { createLogger } from '@/lib/logger';

const log = createLogger('CourseEditor');

export default function ClassroomEditPage() {
  const { t } = useI18n();
  const params = useParams();
  const classroomId = params?.id as string;
  const { loadFromStorage } = useStageStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadClassroom = useCallback(async () => {
    try {
      await loadFromStorage(classroomId);

      const loadedStage = useStageStore.getState().stage;
      if (loadedStage?.id !== classroomId) {
        useStageStore.getState().clearStore();
        const response = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
        if (!response.ok) {
          throw new Error(`Classroom fetch failed: ${response.status}`);
        }

        const json = await response.json();
        if (!json.success || !json.classroom) {
          throw new Error('Classroom not found');
        }

        const { stage, scenes } = json.classroom;
        if (
          stage.id !== classroomId ||
          scenes.some((scene: { stageId?: string }) => scene.stageId !== classroomId)
        ) {
          throw new Error('Classroom data does not match requested id');
        }
        useStageStore.getState().setStage(stage);
        useStageStore.setState({
          scenes,
          currentSceneId: scenes[0]?.id ?? null,
        });
      }
    } catch (error) {
      log.error('Failed to load classroom for editing:', error);
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [classroomId, loadFromStorage]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    loadClassroom();
  }, [loadClassroom]);

  return (
    <ThemeProvider>
      <MediaStageProvider value={classroomId}>
        {loading ? (
          <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
            {t('common.loading')}
          </div>
        ) : error ? (
          <div className="flex h-screen items-center justify-center bg-background">
            <div className="space-y-3 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button onClick={loadClassroom}>{t('courseEditor.retry')}</Button>
            </div>
          </div>
        ) : (
          <div className="flex h-screen flex-col overflow-hidden">
            <CourseEditorShell classroomId={classroomId} />
          </div>
        )}
      </MediaStageProvider>
    </ThemeProvider>
  );
}
