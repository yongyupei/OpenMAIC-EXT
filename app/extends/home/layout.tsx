/**
 * @extends-from app/home/layout.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { registerExtensions } from '@extends/bootstrap';

registerExtensions();

export default function ForkHomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
