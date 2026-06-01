/**

 * @extends-from components/teacher/design-workbench/chapter-generation-settings-field.tsx

 * @fork-branch feat/html-slide-design-workbench

 */

'use client';



import { Label } from '@/components/ui/label';

import { useI18n } from '@/lib/hooks/use-i18n';

import {

  ChapterGenerationSettingsPane,

  type ChapterGenerationSettingsPaneProps,

} from './chapter-generation-settings-pane';



export type ChapterGenerationSettingsFieldProps = ChapterGenerationSettingsPaneProps;



/** Inline card wrapper — prefer {@link ChapterGenerationSettingsDrawer} in the chapter list. */

export function ChapterGenerationSettingsField(props: ChapterGenerationSettingsFieldProps) {

  const { t } = useI18n();



  return (

    <div className="space-y-3 rounded-md border border-border/50 bg-muted/20 px-3 py-3">

      <div>

        <Label className="text-xs">{t('teacher.design.chapterGeneration.title')}</Label>

        <p className="mt-0.5 text-[11px] text-muted-foreground">

          {t('teacher.design.chapterGeneration.hint')}

        </p>

      </div>

      <ChapterGenerationSettingsPane {...props} />

    </div>

  );

}

