'use client';

import Link from 'next/link';
import { Layers } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Toolbar entry: open fork home at /home (upstream home stays at /). */
export function ForkHomeEntryLink() {
  const { t } = useI18n();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/home"
          className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
        >
          <Layers className="w-4 h-4" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {t('extends.home.openWorkbench')}
      </TooltipContent>
    </Tooltip>
  );
}
