/**
 * @extends-from components/course-editor/course-editor/quiz-editor.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useSceneData } from '@/lib/contexts/scene-context';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { QuizContent, QuizOption, QuizQuestion } from '@/lib/types/stage';
import { createBlankQuizQuestion } from '@/lib/course-editor/scene-operations';

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}`;
}

const optionValues = ['A', 'B', 'C', 'D', 'E', 'F'];

export function QuizEditor() {
  const { t } = useI18n();
  const { sceneData, updateSceneData } = useSceneData<QuizContent>();

  const updateQuestion = (questionId: string, updates: Partial<QuizQuestion>) => {
    updateSceneData((draft) => {
      const question = draft.questions.find((item) => item.id === questionId);
      if (!question) return;
      Object.assign(question, updates);
    });
  };

  const updateOption = (questionId: string, optionIndex: number, updates: Partial<QuizOption>) => {
    updateSceneData((draft) => {
      const question = draft.questions.find((item) => item.id === questionId);
      if (!question?.options) return;
      question.options[optionIndex] = { ...question.options[optionIndex], ...updates };
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-background p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t('courseEditor.quizEditor')}</h2>
            <p className="text-sm text-muted-foreground">{t('courseEditor.quizEditorHint')}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              updateSceneData((draft) => {
                draft.questions.push(createBlankQuizQuestion(createId('question')));
              })
            }
          >
            <Plus />
            {t('courseEditor.addQuestion')}
          </Button>
        </div>

        {sceneData.questions.map((question, questionIndex) => (
          <section key={question.id} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {t('courseEditor.question')} {questionIndex + 1}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('courseEditor.deleteQuestion')}
                onClick={() =>
                  updateSceneData((draft) => {
                    draft.questions = draft.questions.filter((item) => item.id !== question.id);
                  })
                }
              >
                <Trash2 />
              </Button>
            </div>

            <div className="space-y-3">
              <label className="block space-y-1 text-sm">
                <span>{t('courseEditor.questionText')}</span>
                <Textarea
                  value={question.question}
                  onChange={(event) =>
                    updateQuestion(question.id, { question: event.target.value })
                  }
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1 text-sm">
                  <span>{t('courseEditor.questionType')}</span>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={question.type}
                    onChange={(event) =>
                      updateQuestion(question.id, {
                        type: event.target.value as QuizQuestion['type'],
                        hasAnswer: event.target.value !== 'short_answer',
                      })
                    }
                  >
                    <option value="single">{t('courseEditor.singleChoice')}</option>
                    <option value="multiple">{t('courseEditor.multipleChoice')}</option>
                    <option value="short_answer">{t('courseEditor.shortAnswer')}</option>
                  </select>
                </label>
                <label className="block space-y-1 text-sm">
                  <span>{t('courseEditor.points')}</span>
                  <Input
                    type="number"
                    min={0}
                    value={question.points ?? 1}
                    onChange={(event) =>
                      updateQuestion(question.id, { points: Number(event.target.value) || 0 })
                    }
                  />
                </label>
              </div>

              {question.type !== 'short_answer' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{t('courseEditor.options')}</span>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={(question.options?.length ?? 0) >= optionValues.length}
                      onClick={() =>
                        updateSceneData((draft) => {
                          const target = draft.questions.find((item) => item.id === question.id);
                          if (!target) return;
                          const nextValue = optionValues[target.options?.length ?? 0] ?? 'A';
                          target.options = [
                            ...(target.options ?? []),
                            { label: '', value: nextValue },
                          ];
                        })
                      }
                    >
                      {t('courseEditor.addOption')}
                    </Button>
                  </div>
                  {(question.options ?? []).map((option, optionIndex) => (
                    <div key={option.value} className="grid grid-cols-[4rem_1fr_auto] gap-2">
                      <Input
                        value={option.value}
                        aria-label={t('courseEditor.optionValue')}
                        onChange={(event) =>
                          updateOption(question.id, optionIndex, { value: event.target.value })
                        }
                      />
                      <Input
                        value={option.label}
                        aria-label={t('courseEditor.optionLabel')}
                        onChange={(event) =>
                          updateOption(question.id, optionIndex, { label: event.target.value })
                        }
                      />
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('courseEditor.deleteOption')}
                        onClick={() =>
                          updateSceneData((draft) => {
                            const target = draft.questions.find((item) => item.id === question.id);
                            if (!target?.options) return;
                            target.options = target.options.filter(
                              (_, index) => index !== optionIndex,
                            );
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <label className="block space-y-1 text-sm">
                    <span>{t('courseEditor.answerValues')}</span>
                    <Input
                      value={(question.answer ?? []).join(',')}
                      onChange={(event) =>
                        updateQuestion(question.id, {
                          answer: event.target.value
                            .split(',')
                            .map((value) => value.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </label>
                </div>
              )}

              <label className="block space-y-1 text-sm">
                <span>{t('courseEditor.analysis')}</span>
                <Textarea
                  value={question.analysis ?? ''}
                  onChange={(event) =>
                    updateQuestion(question.id, { analysis: event.target.value })
                  }
                />
              </label>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
