/**
 * @extends-from tests/teacher/html-slide-autoplay.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it, vi } from 'vitest';

import { runHtmlSlideAutoplay } from '@/lib/teacher/html-slide-autoplay';
import type { Action } from '@/lib/types/action';

describe('runHtmlSlideAutoplay', () => {
  it('runs speech before widget_reveal in order', async () => {
    const order: string[] = [];
    const actions: Action[] = [
      { id: 'speech-1', type: 'speech', text: 'Hello class' },
      { id: 'reveal-1', type: 'widget_reveal', target: '#chart' },
    ];

    await runHtmlSlideAutoplay(actions, {
      playSpeech: vi.fn(async () => {
        order.push('speech');
      }),
      sendToIframe: (type, payload) => {
        order.push(`widget:${type}:${String(payload.target)}`);
      },
    });

    expect(order).toEqual(['speech', 'widget:REVEAL_ELEMENT:#chart']);
  });

  it('stops when shouldAbort returns true before next action', async () => {
    const order: string[] = [];
    const actions: Action[] = [
      { id: 'speech-1', type: 'speech', text: 'One' },
      { id: 'speech-2', type: 'speech', text: 'Two' },
    ];
    let callCount = 0;

    await runHtmlSlideAutoplay(actions, {
      playSpeech: vi.fn(async () => {
        callCount += 1;
        order.push(`speech-${callCount}`);
      }),
      sendToIframe: () => {},
      shouldAbort: () => callCount >= 1,
    });

    expect(order).toEqual(['speech-1']);
  });
});
