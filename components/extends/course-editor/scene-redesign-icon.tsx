'use client';

import { cn } from '@/lib/utils';

/** Bold slide + wand — readable at 14px in xs text buttons. */
export function SceneRedesignIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('size-3.5 shrink-0', className)}
      aria-hidden
    >
      <rect
        x="3"
        y="6"
        width="13"
        height="11"
        rx="2"
        fill="currentColor"
        fillOpacity="0.14"
      />
      <rect
        x="3"
        y="6"
        width="13"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M6.5 10.5h6.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14.5 4.5 20.5 10.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M18.2 2.8 19.2 5.8 22.2 6.8 19.2 7.8 18.2 10.8 17.2 7.8 14.2 6.8 17.2 5.8Z"
        fill="currentColor"
      />
    </svg>
  );
}
