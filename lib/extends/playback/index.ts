/**
 * Fork playback engine for course editor (extends-only import path).
 * Re-exports upstream types/helpers; engine.ts carries the course-editor fix.
 */
export * from '@/lib/playback/types';
export * from '@/lib/playback/derived-state';
export { PlaybackEngine } from './engine';
