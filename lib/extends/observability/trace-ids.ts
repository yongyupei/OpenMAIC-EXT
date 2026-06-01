import { nanoid } from 'nanoid';

/** Client-safe trace id generation (no Node/fs dependencies). */
export function generateTraceId(): string {
  return nanoid(16);
}

export function generateSpanId(): string {
  return nanoid(12);
}

export const generateClientTraceId = generateTraceId;
