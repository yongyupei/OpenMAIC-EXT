/**
 * @extends-from components/video-export/summary-card.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import type { Scene } from '@/lib/types/stage';
import type { QuizContent } from '@/lib/types/stage';
import { useI18n } from '@/lib/hooks/use-i18n';

const TYPE_LABEL_KEYS: Record<Scene['type'], string> = {
  slide: 'courseEditor.videoExportTypeSlide',
  quiz: 'courseEditor.videoExportTypeQuiz',
  interactive: 'courseEditor.videoExportTypeInteractive',
  pbl: 'courseEditor.videoExportTypePbl',
};

function quizPreview(scene: Scene): string {
  if (scene.type !== 'quiz') return '';
  const content = scene.content as QuizContent;
  const first = content.questions?.[0]?.question;
  if (!first) return '';
  return first.length > 120 ? `${first.slice(0, 117)}...` : first;
}

export function VideoExportSummaryCard({ scene }: { scene: Scene }) {
  const { t } = useI18n();
  const typeLabel = t(TYPE_LABEL_KEYS[scene.type]);

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-24 text-slate-900"
      data-export-root="true"
    >
      <span className="mb-6 rounded-full bg-purple-100 px-4 py-1 text-sm font-medium uppercase tracking-wide text-purple-700">
        {typeLabel}
      </span>
      <h1 className="max-w-4xl text-center text-5xl font-bold leading-tight">{scene.title}</h1>
      {quizPreview(scene) ? (
        <p className="mt-8 max-w-3xl text-center text-2xl text-slate-600">{quizPreview(scene)}</p>
      ) : null}
    </div>
  );
}
