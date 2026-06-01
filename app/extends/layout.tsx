'use client';

import { registerExtensions } from '@extends/bootstrap';

registerExtensions();

export default function ExtendsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
