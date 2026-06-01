/**
 * @extends-from lib/hooks/use-navigate-back.ts
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Navigate to the previous history entry, or fallback when there is no back stack
 * (e.g. user opened the page directly).
 */
export function useNavigateBack(fallbackHref = '/') {
  const router = useRouter();

  return useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }, [router, fallbackHref]);
}
